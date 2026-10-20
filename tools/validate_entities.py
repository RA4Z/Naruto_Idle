"""Audit every prepared entity, parallelizing independent PNG header reads."""
from pathlib import Path
import collections,concurrent.futures,json
from PIL import Image
from entity_layout import catalog_path,manifest_path
ROOT=Path(__file__).resolve().parent.parent
index=json.loads((catalog_path(ROOT)).read_text(encoding='utf-8'))['entities'];errors=[];jobs={};seen=set()
for entity in index:
 if entity['id'] in seen:errors.append('duplicate id '+entity['id'])
 seen.add(entity['id']);path=manifest_path(ROOT,entity);folder=path.parent;manifest=json.loads(path.read_text(encoding='utf-8'))
 for mode,data in manifest['modes'].items():
  for name,anim in data['animations'].items():
   path=ROOT/'public'/anim['url'].lstrip('/')
   if not path.resolve().is_relative_to(folder.resolve()):errors.append('asset outside entity folder: '+str(path))
   if not all(0<=i<anim['frames'] for i in anim.get('timeline',range(anim['frames']))):errors.append('invalid frame timeline: '+str(path))
   if anim['fps']<=0 or len(anim['origin'])!=2:errors.append('invalid animation metadata: '+str(path))
   jobs.setdefault(str(path),(entity['id'],mode,name,anim,path))
 for role in ['npc','enemy','companion']:
  if entity['capabilities'].get(role):
   animations=manifest['modes'].get('battle' if role=='enemy' else 'world',{}).get('animations',{})
   required=['C_idle'] if role=='enemy' else ['idle_0']+(['run_'+str(i) for i in range(8)] if role=='companion' else [])
   if not all(action in animations for action in required):errors.append({'id':entity['id'],'role':role,'error':'missing required actions'})
def check(job):
 ident,mode,name,anim,path=job
 try:
  with Image.open(path) as im:
   w,h=im.size;assert w%anim['frameWidth']==0 and h%anim['frameHeight']==0,'invalid frame grid'
   assert (w//anim['frameWidth'])*(h//anim['frameHeight'])>=anim['frames'],'frame count outside image'
   assert max(w,h)<=8192,'GPU texture budget exceeded'
  return {'width':w,'height':h,'bytes':path.stat().st_size,'original':len(anim.get('timeline',range(anim['frames']))),'unique':anim['frames']}
 except Exception as exc:return {'error':{'id':ident,'mode':mode,'action':name,'error':str(exc)}}
textures=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 for i,result in enumerate(pool.map(check,jobs.values()),1):
  if 'error' in result:errors.append(result['error'])
  else:textures.append(result)
  if i%5000==0:print(json.dumps({'checkedTextures':i,'total':len(jobs)}),flush=True)
presentation=json.loads((ROOT/'public/assets/presentation.json').read_text(encoding='utf-8'))
for data in [*presentation['effects'].values(),presentation['music']]:
 if not (ROOT/'public'/data['url'].lstrip('/')).is_file():errors.append('missing '+data['url'])
for sound in presentation['sounds'].values():
 for url in sound['urls']:
  if not (ROOT/'public'/url.lstrip('/')).is_file():errors.append('missing '+url)
result={'entities':len(index),'identifiedBySourceOrVisualReview':sum(e['identity']!='unidentified' for e in index),'statuses':dict(collections.Counter(e['status'] for e in index)),'capabilities':{role:sum(bool(e['capabilities'].get(role)) for e in index) for role in ['npc','companion','enemy']},'uniqueTextureFiles':len(textures),'sourceTimelineFrames':sum(t['original'] for t in textures),'uniqueStoredFrames':sum(t['unique'] for t in textures),'textureBytes':sum(t['bytes'] for t in textures),'maxTextureDimensions':[max(t['width'] for t in textures),max(t['height'] for t in textures)],'effects':len(presentation['effects']),'originalSoundFiles':sum(len(s['urls']) for s in presentation['sounds'].values()),'errors':errors}
(ROOT/'reports/entity-assets-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=True),flush=True);assert not errors
