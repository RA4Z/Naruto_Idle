"""Resume up to six explicit four-map batches. No concurrent workers or original writes."""
from pathlib import Path
import argparse,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]

def run(*args):
    subprocess.run([sys.executable,*args],cwd=ROOT,check=True)

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--max-batches',type=int,default=1);p.add_argument('--collection',choices=['all','world','scenario','unidentified'],default='all');args=p.parse_args()
    if not 1<=args.max_batches<=6:raise SystemExit('One cycle contains at most six sequential batches')
    specs=json.loads((ROOT/'tools/world-expansion-specs.json').read_text(encoding='utf-8'))
    known={x['id'] for x in json.loads((ROOT/'public/assets/maps/index.json').read_text(encoding='utf-8'))['maps']}
    order={'world':0,'scenario':1,'unidentified':2}
    pending=sorted((i for i,s in specs.items() if i not in known and (args.collection=='all' or s['collection']==args.collection)),key=lambda i:(order[specs[i]['collection']],i))
    for start in range(0,min(len(pending),args.max_batches*4),4):
        ids=pending[start:start+4];rows=[]
        for ident in ids:
            run('tools/prepare_world.py','--source',args.source,'--ids',ident,'--limit','1','--specs','tools/world-expansion-specs.json')
            rows.extend(json.loads((ROOT/f'reports/world-expansion-{ident}.json').read_text(encoding='utf-8'))['maps'])
        name='world-delivery-'+ '-'.join(ids)+'.json'
        (ROOT/'reports'/name).write_text(json.dumps({'policy':'explicit sequential map batch; no original changes','maps':rows},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        run('tools/validate_native_foreground.py','--source',args.source,'--batch',name,'--report','alpha-delivery-'+'-'.join(ids)+'.json')
        print(json.dumps({'batchValidated':ids}),flush=True)
    subprocess.run(['node','tools/prepare-runtime.mjs'],cwd=ROOT,check=True)

if __name__=='__main__':main()
