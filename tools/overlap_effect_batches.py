"""Overlap one isolated extractor and one validator; consolidate on one thread."""
import concurrent.futures as futures
import copy,hashlib,json,os,shutil,subprocess,sys,threading,time,uuid
from pathlib import Path,PurePosixPath
from atomic_json import write_json_atomic
from bounded_process import terminate_owned_tree,SourceProcessTimeout
from source_export_namespace import prepare_source_export_namespaces

PREFIX='/assets/effects/native/'
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def contained(root,relative):
    item=PurePosixPath(relative)
    if item.is_absolute() or '..' in item.parts or any(c in str(item) for c in ('\\',':')):
        raise ValueError('Pipeline artifact escapes its stage')
    path=(Path(root)/str(item)).resolve()
    if not path.is_relative_to(Path(root).resolve()):raise ValueError('Pipeline artifact follows external link')
    return path
def artifacts(entry):
    for layer in entry['layers']:
        if layer.get('sourceSequence'):
            relative=PurePosixPath(layer['sourceSequence']['manifestPath']).parent
            installed='asset-source/native-effects'
        else:
            url=layer['animation']['url']
            if not url.startswith(PREFIX):raise ValueError('Unexpected pipeline artifact URL')
            relative=PurePosixPath(url.removeprefix(PREFIX)).parent
            installed='public/assets/effects/native'
        for name,sha in layer['artifactsSha256'].items():
            if Path(name).name!=name or Path(name).suffix not in ('.json','.webp','.png'):
                raise ValueError('Unexpected pipeline artifact filename')
            yield relative/name,sha,installed
def copy_artifact(source,target,sha):
    if digest(source)!=sha:raise ValueError('Pipeline source artifact changed')
    if target.exists():
        if digest(target)!=sha:raise ValueError('Preserve conflicting aggregate artifact')
        return
    target.parent.mkdir(parents=True,exist_ok=True)
    # Raster files are immutable. Metadata gets an independent copy because a
    # later namespace review can rebase its paths without changing the pixels.
    if target.suffix in ('.png','.webp'):
        try:os.link(source,target);return
        except OSError:pass
    shutil.copyfile(source,target)
def empty_index():return {'version':1,'effects':{},'sourceBundles':{},'sourceExports':{},'deferred':{}}
def entries(index):return {**index.get('effects',{}),**index.get('sourceBundles',{}),**index.get('sourceExports',{})}

class Runner:
    def __init__(self):self.lock=threading.Lock();self.children=set();self.stop=False;self.events=[]
    def run(self,command,log,seconds,role,batch,*,environment=None,tag=None):
        log=Path(log);log.parent.mkdir(parents=True,exist_ok=True)
        options={'creationflags':subprocess.CREATE_NEW_PROCESS_GROUP} if os.name=='nt' else {'start_new_session':True}
        with log.open('w',encoding='utf-8') as stream:
            with self.lock:
                if self.stop:raise RuntimeError('Pipeline cancelled before child launch')
                child=subprocess.Popen(list(map(str,command)),stdin=subprocess.DEVNULL,stdout=stream,stderr=subprocess.STDOUT,env=environment,**options)
                self.children.add(child);event={'role':role,'batch':batch,'pid':child.pid,'start':time.monotonic()};self.events.append(event)
                if tag is not None:event['tag']=tag
            try:
                try:code=child.wait(timeout=seconds)
                except subprocess.TimeoutExpired:
                    terminate_owned_tree(child);raise SourceProcessTimeout(seconds,child.pid) from None
                if code:raise RuntimeError(f'Pipeline {role} batch{batch} failed; see {log}')
            finally:
                if child.poll() is None:terminate_owned_tree(child)
                with self.lock:self.children.discard(child);event['end']=time.monotonic()
    def abort(self):
        with self.lock:self.stop=True;children=list(self.children)
        for child in children:terminate_owned_tree(child)

def prepare_batch(args,batch,runroot,*,reuse=True,snapshot=None):
    number=batch['batch'];root=runroot/f'b{number}';root.mkdir()
    output=root/'o';output.mkdir();work=root/'n';work.mkdir()
    jobs=batch['jobs'];aggregate=Path(args.output)
    current,published=snapshot if snapshot is not None else (
        json.loads((aggregate/'index.json').read_bytes()) if reuse and (aggregate/'index.json').exists() else empty_index(),
        json.loads((Path(args.project)/'public/assets/effects/native/index.json').read_bytes()) if reuse else empty_index())
    local_entries=entries(current);public_entries=entries(published);index=empty_index();pending=[]
    for job in jobs:
        key=job['key'];entry=(public_entries.get(key) or local_entries.get(key)) if reuse else None
        if entry is None:pending.append(job);continue
        if entry['source']!=job['source']:raise ValueError('Reused pipeline source differs from plan')
        inputs=[]
        for relative,sha,installed in artifacts(entry):
            a=contained(aggregate,relative);b=contained(Path(args.project)/installed,relative)
            source=a if a.is_file() and digest(a)==sha else b
            if not source.is_file() or digest(source)!=sha:inputs=[];break
            inputs.append((source,contained(output,relative),sha))
        if not inputs:pending.append(job);continue
        for source,target,sha in inputs:copy_artifact(source,target,sha)
        table=next(name for name in ('effects','sourceBundles','sourceExports') if key in (published if key in public_entries else current).get(name,{}))
        index[table][key]=copy.deepcopy(entry)
    write_json_atomic(output/'index.json',index)
    selection=root/'jobs.json';write_json_atomic(selection,pending)
    return {'number':number,'jobs':jobs,'pending':pending,'selection':selection,'output':output,'work':work,'root':root}

def extract_batch(args,tool,item,runner,*,isolate_namespaces=True,action_workers=None):
    began=time.monotonic();number=item['number']
    if shutil.disk_usage(item['root']).free<8_000_000_000:raise RuntimeError('Below8GB reserve; preserve pipeline checkpoint')
    from balanced_action_extract import configured_maximum,extract_actions
    maximum=configured_maximum() if action_workers is None else action_workers
    if maximum>1 and len(item['pending'])>1:
        extract_actions(args,tool,item,runner,maximum)
    elif item['pending']:
        command=[sys.executable,'-X','utf8',tool/'recover_bound_effects.py']
        for key in ('source','project','java','ffdec','classes'):command.extend(['--'+key,getattr(args,key)])
        command.extend(['--output',item['output'],'--work',item['work'],'--jobs',item['selection'],
                        '--atlas-format','webp','--allow-pages','--discard-native-frames'])
        runner.run(command,item['root']/'extract.log',1500,'extract',number)
    index=json.loads((item['output']/'index.json').read_bytes());known=entries(index)
    ids=[j['key'] for j in item['jobs']];ready=[key for key in ids if key in known]
    if set(known)-set(ids):raise ValueError('Isolated extractor wrote an unrelated entry')
    if isolate_namespaces:
        published=json.loads((Path(args.project)/'public/assets/effects/native/index.json').read_bytes())
        new=[key for key in ready if key not in published.get('sourceExports',{})]
        if new:write_json_atomic(item['root']/'namespace-review.json',prepare_source_export_namespaces(Path(args.project),item['output'],new))
    item.update(ready=ready,seconds=time.monotonic()-began)
    return item

def validate_batch(args,tool,item,runner):
    proof=item['root']/'pixels.json'
    if item['ready']:
        runner.run([sys.executable,'-X','utf8',tool/'validate_native_effects.py','--project',args.project,
            '--source',args.source,'--effects-root',item['output'],'--ids',','.join(item['ready']),'--report',proof],
            item['root']/'validate.log',900,'validate',item['number'])
        data=json.loads(proof.read_bytes())
        if data['effects']!=len(item['ready']) or {row['id'] for row in data['rows']}!=set(item['ready']):
            raise ValueError('Pipeline validation does not cover every prepared entry')
        if not all(all(row.get(k) is True for k in ('allSourceRenderedFramesReconstructed','artifactsSha256Match','originalArchiveVerified'))
                   and row.get('sourceEntrySha256') for row in data['rows']):raise ValueError('Pipeline source proofs incomplete')
    return proof if item['ready'] else None

def merge_batch(aggregate,item,proof):
    aggregate=Path(aggregate);path=aggregate/'index.json';before=path.read_bytes() if path.exists() else None
    target=json.loads(before) if before else empty_index();source=json.loads((item['output']/'index.json').read_bytes())
    expected={j['key'] for j in item['jobs']};ready=set(item['ready'])
    if ready and proof is None:raise ValueError('Unvalidated batch cannot enter aggregate')
    if ready:
        evidence=json.loads(Path(proof).read_bytes());rows={r['id']:r for r in evidence['rows']}
        if set(rows)!=ready or len(rows)!=len(evidence['rows']) or evidence['effects']!=len(ready):raise ValueError('Proof coverage differs from batch')
        if not all(all(row.get(k) is True for k in ('allSourceRenderedFramesReconstructed','artifactsSha256Match','originalArchiveVerified')) for row in rows.values()):
            raise ValueError('Unverified frames cannot enter aggregate')
    for key in expected:
        table=next((name for name in ('effects','sourceBundles','sourceExports') if key in source.get(name,{})),None)
        if table:
            if key not in ready:raise ValueError('Unexpected prepared pipeline entry')
            entry=source[table][key]
            calculated=hashlib.sha256(json.dumps(entry,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
            if rows[key].get('sourceEntrySha256')!=calculated:raise ValueError('Entry changed after pixel validation')
            existing=target.setdefault(table,{}).get(key)
            if existing is not None and existing!=entry:raise ValueError('Preserve differing aggregate entry')
            for relative,sha,_ in artifacts(entry):copy_artifact(contained(item['output'],relative),contained(aggregate,relative),sha)
            target[table][key]=entry;target.setdefault('deferred',{}).pop(key,None)
        else:
            failure=source.get('deferred',{}).get(key)
            if failure is None:raise ValueError('Every unprepared action requires an explicit failure')
            target.setdefault('deferred',{})[key]=failure
    if (path.read_bytes() if path.exists() else None)!=before:raise ValueError('Another writer changed aggregate during consolidation')
    write_json_atomic(path,target)
    return target

def run_pipeline(args,batches,tool,checkpoint,report,*,reuse=True,isolate_namespaces=True):
    began=time.monotonic()
    # Keep Java output paths short: Windows app-data redirection expands them.
    root=Path(args.work).parent/'pb'/uuid.uuid4().hex[:8];root.mkdir(parents=True)
    runner=Runner();report.update(workerCount=2,pipelineRoot=str(root),pipeline='isolated-extract-validate-single-writer')
    report['pipelineStages']={'extractors':1,'validators':1,'aggregateWriters':1};checkpoint()
    extraction=futures.ThreadPoolExecutor(max_workers=1);validation=futures.ThreadPoolExecutor(max_workers=1)
    try:
        # Prepare before validators start. Re-reading a large catalog between
        # validation(A) and launch(B) would erase the overlap for small clips.
        snapshot=None
        if reuse:
            aggregate=Path(args.output)/'index.json'
            snapshot=(json.loads(aggregate.read_bytes()) if aggregate.exists() else empty_index(),
                json.loads((Path(args.project)/'public/assets/effects/native/index.json').read_bytes()))
        items=[prepare_batch(args,batch,root,reuse=reuse,snapshot=snapshot) for batch in batches]
        next_extract=extraction.submit(extract_batch,args,tool,items[0],runner,isolate_namespaces=isolate_namespaces)
        for position,batch in enumerate(batches):
            item=next_extract.result();checking=validation.submit(validate_batch,args,tool,item,runner)
            if position+1<len(batches):
                next_extract=extraction.submit(extract_batch,args,tool,items[position+1],runner,isolate_namespaces=isolate_namespaces)
            proof=checking.result();index=merge_batch(args.output,item,proof)
            report['batches'].append({'batch':item['number'],'ids':[j['key'] for j in item['jobs']],
                'prepared':item['ready'],'deferred':{j['key']:index['deferred'].get(j['key']) for j in item['jobs'] if j['key'] not in item['ready']},
                'seconds':round(item['seconds'],2),'validation':str(proof) if proof else None,
                'nativeWork':str(item['work']),'isolatedStage':str(item['output'])})
            if item.get('resourceBalance'):
                report['batches'][-1]['resourceBalance']=item['resourceBalance']
            report.update(catalogPreparedIds=len(index.get('effects',{})),catalogSourceExports=len(index.get('sourceExports',{})),
                catalogSourceBundles=len(index.get('sourceBundles',{})),catalogPreparedSources=len({e['source']['path'] for e in entries(index).values()}),
                pipelineEvents=copy.deepcopy(runner.events));checkpoint()
            print(json.dumps({'batch':item['number'],'state':'validated-and-consolidated','prepared':len(item['ready'])}),flush=True)
        report['pipelineEvents']=copy.deepcopy(runner.events)
        report['pipelineWallSeconds']=time.monotonic()-began
        report['extractionValidationOverlapSeconds']=overlap_wall_seconds(runner.events)
    except BaseException:
        runner.abort();report.update(state='stopped-pipeline-needs-review',pipelineEvents=copy.deepcopy(runner.events));checkpoint();raise
    finally:
        extraction.shutdown(wait=True,cancel_futures=True);validation.shutdown(wait=True,cancel_futures=True)

def overlap_wall_seconds(events):
    def union(role):
        result=[]
        for start,end in sorted((e['start'],e['end']) for e in events if e['role']==role and 'end' in e):
            if result and start<=result[-1][1]:result[-1][1]=max(result[-1][1],end)
            else:result.append([start,end])
        return result
    return sum(max(0,min(a[1],b[1])-max(a[0],b[0])) for a in union('extract') for b in union('validate'))

def prune_verified_pipeline_stages(project,cycle_path,allowed_root):
    """Use the existing three-copy/SHA guard after publication and Git staging."""
    from prune_effect_staging import prune
    report=json.loads(Path(cycle_path).read_bytes());result=[]
    for batch in report['batches']:
        if not batch.get('isolatedStage'):continue
        stages=[batch['isolatedStage'],*batch.get('resourceBalance',{}).get('actionStages',[])]
        for value in stages:
            stage=Path(value).resolve()
            if not stage.is_relative_to(Path(allowed_root).resolve()):raise ValueError('Pipeline cleanup escaped owned cache')
            proof=prune(Path(project),stage,apply=True)
            result.append({'batch':batch['batch'],'stage':str(stage),'removedFiles':len(proof['removed']),
                'removedBytes':proof['removedBytes'],'skippedFiles':len(proof['skipped'])})
    return result
