"""Bounded one-worker extraction plus independent per-cycle pixel verification."""
import argparse,json,os,shutil,subprocess,sys,time
from pathlib import Path

def main():
    ap=argparse.ArgumentParser()
    for key in ('source','project','battle-output','world-output','plan','report'):ap.add_argument('--'+key,type=Path,required=True)
    ap.add_argument('--batches',required=True);ap.add_argument('--revision',required=True);args=ap.parse_args()
    numbers=[int(n) for n in args.batches.split(',')]
    if not 1<=len(numbers)<=6 or len(set(numbers))!=len(numbers):raise ValueError('Choose one to six explicit batch numbers')
    plan=json.loads(args.plan.read_bytes());batches={b['batch']:b for b in plan['batches']};tool=Path(__file__).resolve().parent
    report={'state':'running','batches':[],'originalsReadOnly':True,'workerCount':1};args.report.parent.mkdir(parents=True,exist_ok=True)
    def checkpoint():
        temp=args.report.with_suffix('.tmp');temp.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');temp.replace(args.report)
    environment=os.environ.copy();environment['PYTHONPATH']=str(args.project.resolve()/'tools')
    modes=set()
    for number in numbers:
        batch=batches[number];mode=batch['mode'];ids=batch['ids'];out=args.battle_output if mode=='battle' else args.world_output
        out.mkdir(parents=True,exist_ok=True)
        if shutil.disk_usage(out).free<8_000_000_000:raise RuntimeError('Under 8 GB free; checkpoint preserved')
        began=time.monotonic();print(json.dumps({'batch':number,'mode':mode,'ids':ids,'state':'started'}),flush=True)
        subprocess.run([sys.executable,'-X','utf8',str(tool/'recover_character_actions.py'),'--source',str(args.source),'--project',str(args.project),
            '--output',str(out),'--pipeline',str(tool),'--ids',','.join(ids),'--mode',mode,'--native-tween','--revision',args.revision],check=True,timeout=900,env=environment)
        state=json.loads((out/'report.json').read_bytes());new=sum(len(state['models'][i]['added']) for i in ids)
        report['batches'].append({'batch':number,'mode':mode,'ids':ids,'added':new,'seconds':round(time.monotonic()-began,2)});modes.add(mode);checkpoint()
    for mode in sorted(modes):
        out=args.battle_output if mode=='battle' else args.world_output;state=json.loads((out/'report.json').read_bytes())
        cat=json.loads((args.project/'public/assets/catalog/entities.json').read_bytes());cat['entities']=[e for e in cat['entities'] if e['id'] in state['models']]
        target=out/'public/assets/catalog/entities.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(cat,ensure_ascii=False),encoding='utf-8')
        expected=0
        for row in cat['entities']:
            mp=out/'public'/row['manifestUrl'].lstrip('/')
            if not mp.exists():continue
            m=json.loads(mp.read_bytes());expected+=sum(a.get('rendererRevision')==args.revision for a in m.get('modes',{}).get(mode,{}).get('animations',{}).values())
        # Deferred-only models have no staged manifest and must not enter the validator.
        cat['entities']=[e for e in cat['entities'] if (out/'public'/e['manifestUrl'].lstrip('/')).exists()];target.write_text(json.dumps(cat,ensure_ascii=False),encoding='utf-8')
        if expected:
            subprocess.run([sys.executable,'-X','utf8',str(tool/'validate_compact_actions.py'),'--source',str(args.source),'--project',str(out),
                '--revision',args.revision,'--expected',str(expected),'--all-frames','--no-contact','--report',args.report.stem+'-'+mode],check=True,timeout=1800,env=environment)
        report[mode+'ValidatedActions']=expected
    report['state']='cycle-complete-review-before-next';checkpoint();print(json.dumps(report),flush=True)

if __name__=='__main__':main()
