"""Resume explicit four-model batches; static decoding, one subprocess at a time."""
from pathlib import Path
import argparse,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]

def main():
 p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--max-batches',type=int,default=1);p.add_argument('--refresh-compact',action='store_true');p.add_argument('--offset',type=int,default=0);p.add_argument('--pixel-budget',type=int,default=8000000);args=p.parse_args()
 if not 1<=args.max_batches<=6:raise SystemExit('At most six sequential batches per cycle')
 pending=json.loads((ROOT/'reports/external-symbol-audit.json').read_text(encoding='utf-8'))['pending']
 if args.refresh_compact:
  for entry in json.loads((ROOT/'public/assets/catalog/entities.json').read_text(encoding='utf-8'))['entities']:
   manifest=json.loads((ROOT/'public'/entry['manifestUrl'].lstrip('/')).read_text(encoding='utf-8'))
   if any(a.get('rendererRevision')=='external-symbol-compact-frame-origin-v2' for mode in manifest.get('modes',{}).values() for a in mode['animations'].values()):pending.append({'id':entry['id']})
 ids=list(dict.fromkeys(row['id'] for row in pending))[args.offset:args.offset+args.max_batches*4]
 for start in range(0,len(ids),4):
  batch=ids[start:start+4]
  subprocess.run([sys.executable,'tools/refine_external_actions.py','--source',args.source,'--ids',','.join(batch),'--actions','A_1hit,SP_skill1,SP_skill2','--limit','4','--compact','--pixel-budget',str(args.pixel_budget)]+(['--refresh-compact'] if args.refresh_compact else []),cwd=ROOT,check=True)

if __name__=='__main__':main()
