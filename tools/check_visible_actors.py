"""Check that every enabled NPC/enemy idle contains visible original pixels."""
from pathlib import Path
import json,concurrent.futures
from PIL import Image
from entity_layout import catalog_path,manifest_path
ROOT=Path(__file__).resolve().parent.parent
index=json.loads((catalog_path(ROOT)).read_text(encoding='utf-8'))['entities'];jobs={}
for entity in index:
 manifest=json.loads((manifest_path(ROOT,entity)).read_text(encoding='utf-8'))
 for role,mode,action in [('npc','world','idle_0'),('enemy','battle','C_idle')]+[('companion','world','run_'+str(i)) for i in range(8)]:
  if entity['capabilities'].get(role):
   anim=manifest['modes'][mode]['animations'][action];jobs[anim['url']]=(entity['id'],role,anim['url'])
def check(job):
 ident,role,url=job
 try:
  with Image.open(ROOT/'public'/url.lstrip('/')) as image:
   assert image.convert('RGBA').getchannel('A').getextrema()[1]>0,'entire idle is transparent'
  return None
 except Exception as exc:return {'id':ident,'role':role,'error':str(exc)}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:errors=[r for r in pool.map(check,jobs.values()) if r]
report={'checkedAnimationSheets':len(jobs),'coverage':'all enabled idle and companion run directions','errors':errors};(ROOT/'reports/entity-visibility-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report));assert not errors
