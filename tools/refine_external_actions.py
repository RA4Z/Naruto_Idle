"""Explicit, sequential repair batches; no automatic full-library regeneration."""
import argparse,json,hashlib,shutil
from pathlib import Path
from entity_pipeline import convert,write_json
ROOT=Path(__file__).resolve().parents[1]
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--ids',required=True);ap.add_argument('--limit',type=int,default=4);ap.add_argument('--actions',default='A_1hit');args=ap.parse_args()
 ids=args.ids.split(',');allowed=set(args.actions.split(','))
 if not 1<=args.limit<=10 or len(ids)>args.limit:raise SystemExit('Use explicit batches of at most --limit models (maximum 10).')
 audit_path=ROOT/'reports/external-symbol-audit.json';audit=json.loads(audit_path.read_text(encoding='utf-8'))
 catalog={e['id']:e for e in json.loads((ROOT/'public/assets/catalog/entities.json').read_text(encoding='utf-8'))['entities']};fixed=[];deferred=[]
 for ident in ids:
  entry=catalog[ident];mp=ROOT/'public'/entry['manifestUrl'].lstrip('/');m=json.loads(mp.read_text(encoding='utf-8'))
  for mode,data in m.get('modes',{}).items():
   actions={row['action'] for row in audit['pending'] if row['id']==ident and row['mode']==mode and row['action'] in allowed}
   if not actions:continue
   source=Path(m['sources'][mode]['source']);before=hashlib.sha256(source.read_bytes()).hexdigest()
   backup=ROOT/'assets-extraidos/animation-review-before'/ident/mode;backup.mkdir(parents=True,exist_ok=True)
   if not (backup/'manifest.json').exists():shutil.copy2(mp,backup/'manifest.json')
   for action in actions:
    p=ROOT/'public'/data['animations'][action]['url'].lstrip('/');out=backup/p.name
    if not out.exists():shutil.copy2(p,out)
   try:
    result=convert(source,mp.parent/mode,entry['manifestUrl'].rsplit('/',1)[0]+'/'+mode,mode,only=actions,pixel_budget=8000000,source_pixel_budget=16000000)
   except Exception as error:
    deferred.append({'id':ident,'mode':mode,'actions':sorted(actions),'reason':str(error)[:250]});print(ident+': deferred '+str(error)[:120],flush=True);continue
   for action in actions-set(result['animations']):deferred.append({'id':ident,'mode':mode,'actions':[action],'reason':str(result.get('issues',[]))[:250]})
   for action,a in result['animations'].items():
    from PIL import Image
    with Image.open(ROOT/'public'/a['url'].lstrip('/')) as image:
     capacity=image.width//a['frameWidth']*(image.height//a['frameHeight']);assert 0<a['frames']<=capacity
     assert all(0<=f<a['frames'] for f in a.get('timeline',[]))
    a['rendererRevision']='external-symbol-namespace-v1';data['animations'][action]=a;fixed.append((ident,mode,action))
   assert before==hashlib.sha256(source.read_bytes()).hexdigest()
   print(ident+' '+mode+': '+','.join(sorted(result['animations'])),flush=True)
  write_json(mp,m)
 audit['pending']=[row for row in audit['pending'] if (row['id'],row['mode'],row['action']) not in fixed]
 audit['actionsPendingReview']=len(audit['pending']);audit['modelsPendingReview']=len({row['id'] for row in audit['pending']});write_json(audit_path,audit)
 report_path=ROOT/'reports/external-symbol-repairs.json';history=json.loads(report_path.read_text(encoding='utf-8')) if report_path.exists() else {'policy':'explicit sequential batches only','repaired':[]}
 history.setdefault('deferred',[]).extend(deferred)
 history['repaired'] += [{'id':i,'mode':m,'action':a} for i,m,a in fixed];write_json(report_path,history)
 print(json.dumps({'repaired':len(fixed),'deferred':len(deferred),'actionsPending':audit['actionsPendingReview']}))
if __name__=='__main__':main()
