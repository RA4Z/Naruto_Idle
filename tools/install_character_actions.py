"""Merge only independently verified action additions, preserving current manifests.

Existing actions and gameplay fields are never replaced. Filename collisions get
a new content suffix rather than overwriting a previously delivered bitmap.
"""
import argparse,copy,gzip,hashlib,json,math,shutil,sys
from pathlib import Path

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def asset(root,url):
    if not url.startswith('/assets/') or any(c in url for c in ('?', '#','\\')):raise ValueError('Unexpected asset URL')
    path=(root/'public'/url.lstrip('/')).resolve()
    if not path.is_relative_to((root/'public').resolve()):raise ValueError('Asset escapes public directory')
    return path

def main():
    ap=argparse.ArgumentParser()
    for key in ('source','project','staging'):ap.add_argument('--'+key,type=Path,required=True)
    ap.add_argument('--source-parity',type=Path,help='Optional completed source parity audit; permit only exactly equivalent, source-pinned files')
    ap.add_argument('--label',required=True);args=ap.parse_args();project=args.project.resolve();staging=args.staging.resolve()
    if not args.label.isalnum():raise ValueError('Simple report label required')
    sys.path.insert(0,str(project/'tools'))
    from original_archive import OriginalArchive
    archive=OriginalArchive(args.source)
    if project.is_relative_to(archive.root):raise ValueError('Originals are read-only')
    extraction=json.loads((staging/'report.json').read_bytes());proofs={}
    for path in (staging/'reports').glob('*.json'):
        report=json.loads(path.read_bytes())
        if report.get('allTimelineFrames') is not True:continue
        for row in report.get('actions',[]):
            if not all(row.get(k) is True for k in ('timingAndTimelineMatch','groundOffsetsAndPixelsMatch','sourceHashesPreserved')):continue
            key=(row['id'],row['mode'],row['action']);before=proofs.get(key)
            if before is not None and before['atlasSha256']!=row['atlasSha256']:raise ValueError('Conflicting validation proofs')
            proofs[key]=row
    result={'version':1,'label':args.label,'models':{},'added':0,'sourceFramesVerified':0,'preservedExisting':[],
            'sourceExecution':False,'mechanicalUnlocksChanged':False,'scope':'Every added timeline frame covered by independent source-pose/atlas-index RGBA verification. External layers are not composited; source XML is retained. No AVM/player capture.'}
    parity=None
    if args.source_parity:
        audit=json.loads(gzip.decompress(args.source_parity.read_bytes()))
        if audit.get('sourceExecution') is not False:raise ValueError('A static source parity audit is required')
        parity={row['source']['path']:row for row in audit['rows']}
        if len(parity)!=len(audit['rows']):raise ValueError('Duplicate source parity records')
        result['sourceParityAuditSha256']=digest(args.source_parity);result['excludedSources']=[]
    for index,(ident,row) in enumerate(extraction['models'].items()):
        mode=row.get('mode','battle');additions=row['added']
        if not additions:
            result['models'][ident]={'mode':mode,'added':[],'source':row['source'],'deferred':row['deferred'],'markers':row['markers']};continue
        assert archive.record(row['source']['path'])==row['source'],'Original graphics source changed'
        if parity is not None:
            checked=parity.get(row['source']['path'])
            if checked is None or checked['source']!=row['source']:raise ValueError('Source lacks matching audit evidence: '+ident)
            if checked.get('semanticMatch') is not True:
                result['excludedSources'].append({'id':ident,'mode':mode,'source':row['source'],'actions':len(additions),'reason':'Source data differ or require an adapter'})
                continue
        current_path=asset(project,row['manifest']);staged_path=asset(staging,row['manifest'])
        current=json.loads(current_path.read_bytes());original=copy.deepcopy(current);prepared=json.loads(staged_path.read_bytes());installed=[]
        before_sha=digest(current_path)
        mode_created=mode not in current['modes']
        if mode_created:
            definition=prepared['modes'][mode];height=definition['referenceHeight']
            if not isinstance(height,(int,float)) or isinstance(height,bool) or not math.isfinite(height) or height<=0:raise ValueError('Invalid source mode reference height')
            if definition['status'] not in ('ready','partial'):raise ValueError('Invalid source mode status')
            current['modes'][mode]={'referenceHeight':height,'status':definition['status'],'animations':{}}
        for addition in additions:
            name=addition['action']
            if name in current['modes'][mode]['animations']:
                result['preservedExisting'].append({'id':ident,'mode':mode,'action':name});continue
            animation=copy.deepcopy(prepared['modes'][mode]['animations'][name]);proof=proofs.get((ident,mode,name))
            if proof is None:raise ValueError('Missing all-frame validation: '+ident+'/'+name)
            if proof.get('sampledTimelineFrames')!=list(range(len(animation['timeline']))):raise ValueError('Incomplete timeline coverage: '+ident+'/'+name)
            source=asset(staging,animation['url'])
            if digest(source)!=proof['atlasSha256']:raise ValueError('Staged bitmap differs from validated bytes: '+str(source))
            if animation.get('packedAtlasUrl') or animation.get('multiAtlas'):raise ValueError('Packed body clip needs a bundle installer')
            if animation.get('interpolationEvidence'):assert archive.record(animation['interpolationEvidence']['path'])==animation['interpolationEvidence']
            target=asset(project,animation['url']);sha=proof['atlasSha256']
            if target.exists() and digest(target)!=sha:
                target=target.with_name(target.stem+'-native-'+sha[:12]+target.suffix)
                animation['url']='/'+target.relative_to(project/'public').as_posix()
            target.parent.mkdir(parents=True,exist_ok=True)
            if not target.exists():shutil.copy2(source,target)
            if digest(target)!=sha:raise ValueError('Installed image verification failed')
            current['modes'][mode]['animations'][name]=animation;installed.append({'action':name,'url':animation['url'],'atlasSha256':sha,
                'frames':len(animation['timeline']),'status':animation['status'],'externalEffects':animation.get('externalEffects',[])})
            result['added']+=1;result['sourceFramesVerified']+=len(proof['sampledTimelineFrames'])
        if installed:
            # Verify that the merge changed exactly the recorded new action keys.
            stripped=copy.deepcopy(current)
            if mode_created:del stripped['modes'][mode]
            else:
                for item in installed:del stripped['modes'][mode]['animations'][item['action']]
            assert stripped==original,'A non-addition manifest field changed'
            if digest(current_path)!=before_sha:raise ValueError('Manifest was edited during installation')
            temporary=current_path.with_suffix('.json.tmp');temporary.write_text(json.dumps(current,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');temporary.replace(current_path)
        result['models'][ident]={'mode':mode,'manifest':row['manifest'],'beforeManifestSha256':before_sha,'afterManifestSha256':digest(current_path),
            'added':installed,'modeCreated':bool(mode_created and installed),'source':row['source'],'deferred':row['deferred'],'markers':row['markers']}
        if index%25==0:print(json.dumps({'modelsVisited':index+1,'added':result['added']}),flush=True)
    target=project/'reports'/('full-character-extraction-'+args.label+'.json.gz');target.parent.mkdir(parents=True,exist_ok=True)
    with gzip.GzipFile(filename=str(target),mode='wb',mtime=0) as stream:stream.write((json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n').encode())
    print(json.dumps({'report':str(target),'models':len(result['models']),'added':result['added'],'sourceFramesVerified':result['sourceFramesVerified'],'preservedExisting':len(result['preservedExisting'])}))

if __name__=='__main__':main()
