"""Execute at most six explicit batches, then validate and checkpoint; never publish."""
import argparse,json,shutil,subprocess,sys,time
from pathlib import Path

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--plan',type=Path,required=True);ap.add_argument('--batches',required=True)
    for key in ('source','project','output','work','java','ffdec','classes'):ap.add_argument('--'+key,required=True)
    ap.add_argument('--report',type=Path,required=True)
    args=ap.parse_args();numbers=[int(n) for n in args.batches.split(',')]
    if not 1<=len(numbers)<=6 or len(set(numbers))!=len(numbers):raise ValueError('Choose one to six explicit batch numbers')
    plan=json.loads(args.plan.read_bytes());batches={b['batch']:b for b in plan['batches']};root=Path(args.output).resolve()
    tool=Path(__file__).resolve().parent;report={'batches':[],'state':'running','originalsReadOnly':True,'workerCount':1}
    args.report.parent.mkdir(parents=True,exist_ok=True)
    def checkpoint():
        temporary=args.report.with_suffix('.tmp');temporary.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');temporary.replace(args.report)
    for number in numbers:
        batch=batches[number];ids=batch['ids']
        if not 1<=len(ids)<=4 or any(not i.isdigit() for i in ids):raise ValueError('Invalid explicit batch IDs')
        if shutil.disk_usage(root).free<8_000_000_000:raise RuntimeError('Under 8 GB free; checkpoint preserved, no source deletion')
        command=[sys.executable,'-X','utf8',str(tool/'recover_bound_effects.py')]
        for key in ('source','project','output','work','java','ffdec','classes'):command.extend(['--'+key,getattr(args,key)])
        command.extend(['--ids',','.join(ids),'--atlas-format','webp','--allow-pages','--discard-native-frames'])
        began=time.monotonic();print(json.dumps({'batch':number,'ids':ids,'state':'started'}),flush=True)
        result=subprocess.run(command,check=False,timeout=1500)
        if result.returncode:report['state']='stopped-child-error';checkpoint();raise RuntimeError('Extraction batch failed')
        index=json.loads((root/'index.json').read_bytes());ready=[i for i in ids if i in index['effects']]
        validation=args.report.with_name(args.report.stem+f'-batch-{number}-pixels.json')
        if ready:
            subprocess.run([sys.executable,'-X','utf8',str(tool/'validate_native_effects.py'),'--project',args.project,
                '--source',args.source,'--effects-root',str(root),'--ids',','.join(ready),'--report',str(validation)],check=True,timeout=900)
        report['batches'].append({'batch':number,'ids':ids,'prepared':ready,'deferred':{i:index['deferred'].get(i) for i in ids if i not in ready},'seconds':round(time.monotonic()-began,2),'validation':str(validation) if ready else None})
        report['catalogPreparedIds']=len(index['effects']);report['catalogPreparedSources']=len({e['source']['path'] for e in index['effects'].values()})
        checkpoint();print(json.dumps({'batch':number,'state':'validated','preparedIds':report['catalogPreparedIds'],'preparedSources':report['catalogPreparedSources']}),flush=True)
    report['state']='cycle-complete-review-before-next';checkpoint()

if __name__=='__main__':main()
