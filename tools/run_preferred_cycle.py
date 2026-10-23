"""Bounded preferred-data corrections with independent pixels and field review."""
import argparse,copy,json,shutil,subprocess,sys,time
from pathlib import Path

def main():
    ap=argparse.ArgumentParser()
    for name in ('source','project','plan','battle-output','world-output','report'):ap.add_argument('--'+name,type=Path,required=True)
    ap.add_argument('--batches',required=True);args=ap.parse_args();numbers=[int(n) for n in args.batches.split(',')]
    if not 1<=len(numbers)<=6 or len(set(numbers))!=len(numbers):raise ValueError('Choose at most six explicit batches')
    tool=Path(__file__).resolve().parent;sys.path.insert(0,str(args.project/'tools'))
    from original_archive import OriginalArchive
    archive=OriginalArchive(args.source);plan=json.loads(args.plan.read_bytes());batches={b['batch']:b for b in plan['batches']}
    catalog=json.loads((args.project/'public/assets/catalog/entities.json').read_bytes())
    report={'state':'running','batches':[],'originalsReadOnly':True,'workerCount':1,'mechanicalUnlocksChanged':False}
    args.report.parent.mkdir(parents=True,exist_ok=True)
    def checkpoint():
        target=args.report.with_suffix('.tmp');target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');target.replace(args.report)
    for number in numbers:
        jobs=batches[number]['jobs']
        if not 1<=len(jobs)<=4:raise ValueError('At most four source models per batch')
        revision='preferred-'+args.report.stem+'-b'+str(number);began=time.monotonic();prepared=0;deferred=[];modes=set()
        print(json.dumps({'batch':number,'state':'started','models':[j['id'] for j in jobs]}),flush=True)
        for job_index,job in enumerate(jobs):
            if not job['id'].isdigit() or job['mode'] not in ('battle','world'):raise ValueError('Invalid explicit source job')
            if shutil.disk_usage(args.report.parent).free<8_000_000_000:raise RuntimeError('Under 8 GB free; checkpoint preserved')
            assert archive.record(job['source']['path'])==job['source'],'Original source changed'
            output=args.battle_output if job['mode']=='battle' else args.world_output;output.mkdir(parents=True,exist_ok=True)
            selection=args.report.with_name(args.report.stem+f'-b{number}-j{job_index}.json');selection.write_text(json.dumps(job['actions'],ensure_ascii=False),encoding='utf-8')
            command=[sys.executable,'-X','utf8',str(tool/'recover_character_actions.py'),'--source',str(args.source),'--project',str(args.project),
                '--output',str(output),'--pipeline',str(tool),'--ids',job['id'],'--mode',job['mode'],'--native-tween','--preferred-config',
                '--refresh-existing','--actions-file',str(selection),'--revision',revision]
            subprocess.run(command,check=True,timeout=900)
            row=json.loads((output/'report.json').read_bytes())['models'][job['id']]
            assert row['mechanicalUnlocksChanged'] is False and archive.record(row['source']['path'])==row['source']
            changes=row.get('replacedExistingActions',[]);additions=row['added'];deferred.extend([{'id':job['id'],'mode':job['mode'],**d} for d in row['deferred']])
            if changes or additions:
                manifest=output/'public'/row['manifest'].lstrip('/');candidate=json.loads(manifest.read_bytes())
                before=json.loads((args.project/'public'/row['manifest'].lstrip('/')).read_bytes());reverted=copy.deepcopy(candidate)
                if row.get('modeCreated'):del reverted['modes'][job['mode']]
                else:
                    for change in changes:reverted['modes'][job['mode']]['animations'][change['action']]=change['before']
                    for addition in additions:del reverted['modes'][job['mode']]['animations'][addition['action']]
                assert reverted==before,'A non-requested field changed'
            modes.add(job['mode'])
        validations={}
        for mode in sorted(modes):
            output=args.battle_output if mode=='battle' else args.world_output;state=json.loads((output/'report.json').read_bytes());entries=[];expected=0
            for entry in catalog['entities']:
                if entry['id'] not in state['models']:continue
                manifest=output/'public'/entry['manifestUrl'].lstrip('/')
                if not manifest.is_file():continue
                entries.append(entry);data=json.loads(manifest.read_bytes())
                expected+=sum(a.get('rendererRevision')==revision for a in data.get('modes',{}).get(mode,{}).get('animations',{}).values())
            path=output/'public/assets/catalog/entities.json';path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps({**catalog,'entities':entries},ensure_ascii=False),encoding='utf-8')
            if expected:
                name=args.report.stem+f'-b{number}-{mode}'
                subprocess.run([sys.executable,'-X','utf8',str(tool/'validate_compact_actions.py'),'--source',str(args.source),'--project',str(output),
                    '--revision',revision,'--expected',str(expected),'--all-frames','--no-contact','--report',name],check=True,timeout=1800)
                validations[mode]={'actions':expected,'report':str(output/'reports'/(name+'.json'))};prepared+=expected
        report['batches'].append({'batch':number,'preparedActions':prepared,'deferred':deferred,'validations':validations,'seconds':round(time.monotonic()-began,2),'nonActionFieldsPreserved':True})
        checkpoint();print(json.dumps({'batch':number,'state':'source-pixels-and-preservation-reviewed','preparedActions':prepared,'deferred':len(deferred)}),flush=True)
    report['state']='cycle-complete-review-before-next';checkpoint()

if __name__=='__main__':main()
