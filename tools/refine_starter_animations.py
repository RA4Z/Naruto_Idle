"""Repair only the three starters, sequentially. Never modify source SWFs.
External symbols must never alias local body bitmaps. Keep preparation windows
used by the game's separate projectile presentation; preserve original XML.
"""
import hashlib,json,shutil
from pathlib import Path
from PIL import Image,ImageDraw
from entity_pipeline import convert,write_json
PROJECT=Path(__file__).resolve().parents[1]
ACTIONS={'C_idle','A_1hit','C_hurt','C_dead','SP_skill1','SP_skill2'}
def main():
 legacy_path=PROJECT/'public/assets/animations.json';legacy=json.loads(legacy_path.read_text(encoding='utf-8'))
 report={'policy':'sequential-three-starters-only','externalNamespace':'extname never resolves local assetId','characters':[]}
 contact=Image.new('RGB',(960,3*190),(25,43,35));draw=ImageDraw.Draw(contact)
 for row,hero in enumerate(('naruto','sasuke','sakura')):
  folder=PROJECT/f'public/assets/characters/{hero}-kid';path=folder/'manifest.json';manifest=json.loads(path.read_text(encoding='utf-8'))
  backup=PROJECT/f'assets-extraidos/animation-review-before/{hero}-kid';backup.mkdir(parents=True,exist_ok=True)
  if not (backup/'manifest.json').exists():shutil.copy2(path,backup/'manifest.json')
  old=manifest['modes']['battle'];source=Path(manifest['sources']['battle']['source']);source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
  for action in ACTIONS:
   a=old['animations'].get(action)
   if a:
    original=PROJECT/'public'/a['url'].lstrip('/');dest=backup/original.name
    if not dest.exists():shutil.copy2(original,dest)
  limits={'SP_skill1':24 if hero=='naruto' else 38,'SP_skill2':35}
  fixed=convert(source,folder/'battle',f'/assets/characters/{hero}-kid/battle','battle',only=ACTIONS,frame_limits=limits)
  old['animations'].update(fixed['animations']);old['referenceHeight']=fixed['referenceHeight'];old['rendererRevision']='external-symbol-namespace-v1'
  original=json.loads((backup/'manifest.json').read_text(encoding='utf-8'))['modes']['battle']
  old['issues']=[i for i in original.get('issues',[]) if i.get('action') not in fixed['animations']]+fixed['issues']
  old['status']='partial' if old['issues'] else 'ready'
  manifest['status']='partial' if old['issues'] else manifest['status']
  for action,a in fixed['animations'].items():
   a['rendererRevision']='external-symbol-namespace-v1'
   if action in limits:a['sourceFrameWindow']=[0,limits[action]]
   image=Image.open(PROJECT/'public'/a['url'].lstrip('/'));capacity=image.width//a['frameWidth']*(image.height//a['frameHeight'])
   assert a['frames']<=capacity and all(0<=f<a['frames'] for f in a['timeline'])
  write_json(path,manifest)
  legacy[hero+'-battle']['animations'].update(fixed['animations'])
  legacy[hero+'-battle']['warnings']=[i for i in legacy[hero+'-battle'].get('warnings',[]) if i.get('action') not in fixed['animations']]+fixed['issues']
  action='SP_skill2' if hero=='sakura' else 'SP_skill1';a=fixed['animations'][action];im=Image.open(PROJECT/'public'/a['url'].lstrip('/')).convert('RGBA');cols=im.width//a['frameWidth']
  for col,time in enumerate((0,min(10,len(a['timeline'])-1),min(24,len(a['timeline'])-1))):
   frame=a['timeline'][time];w,h=a['frameWidth'],a['frameHeight'];tile=im.crop((frame%cols*w,frame//cols*h,frame%cols*w+w,frame//cols*h+h))
   x=col*320+160-round(w*a['origin'][0]);y=row*190+175-round(h*a['origin'][1]);contact.paste(tile,(x,y),tile);draw.text((col*320+8,row*190+8),f'{hero} source frame {time}',fill='white')
  assert hashlib.sha256(source.read_bytes()).hexdigest()==source_hash
  rgba_before=rgba_after=0
  for key in fixed['animations']:
   with Image.open(backup/Path(original['animations'][key]['url']).name) as previous:rgba_before+=previous.width*previous.height*4
   with Image.open(PROJECT/'public'/fixed['animations'][key]['url'].lstrip('/')) as current:rgba_after+=current.width*current.height*4
  report['characters'].append({'reviewedAtlasRgbaBytesBefore':rgba_before,'reviewedAtlasRgbaBytesAfter':rgba_after,'id':manifest['id'],'name':manifest['name'],'sourceSha256':source_hash,'actions':{k:{'uniqueFrames':a['frames'],'timelineFrames':len(a['timeline']),'externalEffectsSkipped':a['externalEffects'],'origin':a['origin']} for k,a in fixed['animations'].items()}})
  print(hero+': reviewed '+str(len(fixed['animations']))+' actions',flush=True)
 for rel in ('public/assets/catalog/entities.json','public/assets/characters/index.json'):
  index_path=PROJECT/rel;index=json.loads(index_path.read_text(encoding='utf-8'))
  for e in index['entities']:
   if e['id'] in ('11000101','11000201','11000301'):
    m=json.loads((PROJECT/'public'/e['manifestUrl'].lstrip('/')).read_text(encoding='utf-8'));e['name']=m['name'];e['status']=m['status']
  write_json(index_path,index)
 from prepare_previews import create
 catalog=json.loads((PROJECT/'public/assets/catalog/entities.json').read_text(encoding='utf-8'))
 for e in catalog['entities']:
  if e['id'] in ('11000101','11000201','11000301'):create(e)
 write_json(legacy_path,legacy);write_json(PROJECT/'reports/combat-animation-refinement.json',report);contact.save(PROJECT/'reports/combat-special-reviewed.png')
if __name__=='__main__':main()
