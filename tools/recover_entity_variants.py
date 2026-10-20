"""Bounded second pass for nonstandard action names and vector summon rigs."""
from pathlib import Path
import collections,hashlib,json,math,os,re,struct,subprocess,sys
from PIL import Image
from entity_pipeline import read_actions,convert,tags,write_json
from swf_bytes import decode
from entity_layout import catalog_path,manifest_path,organize
ROOT=Path(__file__).resolve().parent.parent
TOOLS=Path(r'D:\Naruto Idle\Naruto_Idle\tools')

def render_vector(manifest,resource,action,symbol):
 ident=manifest['id'];out=ROOT/'assets-extraidos/personagens'/manifest['id']/'renders-static'/action;out.mkdir(parents=True,exist_ok=True)
 decoded=out/'source.swf';decoded.write_bytes(decode(Path(resource['source']).read_bytes()))
 env=os.environ.copy();env['APPDATA']=str(ROOT/'tools/jpexs-profile');env['LOCALAPPDATA']=env['APPDATA']
 files=list((out/'frames').rglob('*.png'))
 cached=ROOT/'assets-extraidos/personagens'/manifest['id']/'renders-quarter'/action
 if not files and (cached/'source.swf').exists() and (cached/'source.swf').read_bytes()==decoded.read_bytes():
  files=[file for file in (cached/'frames').rglob('1.png')]
 if not files:
  cmd=[str(TOOLS/'jre17/jdk-17.0.20.1+1-jre/bin/java.exe'),'-Djava.awt.headless=true','-Duser.home='+str(ROOT/'tools/jpexs-profile'),'-Xmx1536m','-jar',str(TOOLS/'ffdec/ffdec.jar'),'-ignorebackground','-zoom','0.25','-format','sprite:png','-selectid',str(symbol),'-select',str(symbol)+':1','-exportTimeout','30','-export','sprite',str(out/'frames'),str(decoded)]
  print(json.dumps({'rendering':ident,'action':action,'exportZoom':.25}),flush=True)
  result=subprocess.run(cmd,capture_output=True,env=env,timeout=45);(out/'export.log').write_bytes(result.stdout+b'\n'+result.stderr)
  if result.returncode:raise ValueError('JPEXS export failed')
  files=list((out/'frames').rglob('*.png'))
 files.sort(key=lambda p:int(p.stem) if p.stem.isdigit() else 0)
 if not files:raise ValueError('No vector frames exported')
 images=[]
 for file in files:
  image=Image.open(file).convert('RGBA');box=image.getbbox();images.append(image.crop(box) if box else Image.new('RGBA',(1,1)))
 if not any(image.getbbox() for image in images):raise ValueError('Vector sprite is entirely transparent')
 originalWidth=max(i.width for i in images);originalHeight=max(i.height for i in images);ratio=min(1,384/max(originalWidth,originalHeight));w=max(1,round(originalWidth*ratio));h=max(1,round(originalHeight*ratio));unique=[];hashes={};timeline=[]
 for image in images:
  image=image.resize((max(1,round(image.width*ratio)),max(1,round(image.height*ratio))),Image.Resampling.LANCZOS);frame=Image.new('RGBA',(w,h));frame.alpha_composite(image,((w-image.width)//2,h-image.height));key=hashlib.sha256(frame.tobytes()).digest()
  if key not in hashes:hashes[key]=len(unique);unique.append(frame)
  timeline.append(hashes[key])
 cols=min(8,8192//w,len(unique));rows=math.ceil(len(unique)/cols)
 if rows*h>8192:raise ValueError('Vector atlas exceeds texture budget')
 sheet=Image.new('RGBA',(cols*w,rows*h))
 for i,image in enumerate(unique):sheet.alpha_composite(image,((i%cols)*w,(i//cols)*h))
 folder=manifest_path(ROOT,manifest).parent/'battle';folder.mkdir(exist_ok=True);sheet.save(folder/(action+'.png'),compress_level=2)
 data=decoded.read_bytes();off=8+(5+4*(data[8]>>3)+7)//8;fps=struct.unpack_from('<H',data,off)[0]/256
 return {'url':manifest['manifestUrl'].rsplit('/',1)[0]+'/battle/'+action+'.png','frameWidth':w,'frameHeight':h,'frames':len(unique),'timeline':timeline,'fps':fps,'origin':[.5,1],'status':'partial','sourcePixelScale':ratio,'originalSpriteId':symbol,'sourceAction':action,'referenceHeight':h,'coverage':'first native idle pose; full vector timeline pending','exportZoom':.25,'rendering':'static-vector-frames; source scripts not executed'}

def main():
 indexPath=catalog_path(ROOT);index=json.loads(indexPath.read_text(encoding='utf-8'));attempts=[];recovered=[]
 for entry in index['entities']:
  if any(entry['capabilities'].values()):continue
  path=manifest_path(ROOT,entry);m=json.loads(path.read_text(encoding='utf-8'));before=bool(m['modes']);changed=False
  for mode in ['world','battle']:
   resource=m['sources'].get(mode)
   if not resource:continue
   try:
    root,assets,images,symbols,xml=read_actions(Path(resource['source']))
    if not images:continue
    names=[a.get('name','') for a in root.findall('action')]
    if mode=='world':
     candidates=[n for n in names if n.strip().startswith(('idle','stand','yewan_idle'))]
     if not candidates and len(names)==1:candidates=names
     if not candidates:continue
     selected=set(candidates[:8]);result=convert(Path(resource['source']),path.parent/mode,m['manifestUrl'].rsplit('/',1)[0]+'/'+mode,mode,only=selected)
     usable=next((name for name in result['animations'] if name.strip().startswith(('idle_0','idle','stand','yewan_idle'))),next(iter(result['animations'])))
     result['animations']['idle_0']={**result['animations'][usable],'sourceAction':usable};result['status']='partial';result['issues'].append({'presentationBinding':'idle_0','sourceAction':usable,'note':'Explicit variant of native idle; no invented pixels'})
    else:
     selected={n for n in names if re.match(r'^(C_idle|A_1hit|C_dead)(?:_?\d+)?$',n)}
     result=convert(Path(resource['source']),path.parent/mode,m['manifestUrl'].rsplit('/',1)[0]+'/'+mode,mode,only=selected)
     for canonical in ['C_idle','A_1hit','C_dead']:
      if canonical not in result['animations']:
       candidate=next((n for n in result['animations'] if n.startswith(canonical)),None)
       if candidate:result['animations'][canonical]={**result['animations'][candidate],'sourceAction':candidate}
     if 'C_idle' not in result['animations']:continue
     result['referenceHeight']=result['animations']['C_idle']['referenceHeight'];result['status']='partial'
    m['modes'][mode]=result;changed=True;attempts.append({'id':m['id'],'mode':mode,'result':'native-variant-recovered'})
   except Exception as error:
    if 'No bitmap actions XML' not in str(error):attempts.append({'id':m['id'],'mode':mode,'result':'not-renderable','reason':str(error)});continue
    if mode!='battle':continue
    # Only explicit exported battle-pose symbols are selected. No script runs.
    classes={};spriteIds=set()
    for kind,body in tags(Path(resource['source']).read_bytes()):
     if kind==39:spriteIds.add(struct.unpack_from('<H',body)[0])
     if kind==76:
      count=struct.unpack_from('<H',body)[0];pos=2
      for _ in range(count):
       ident=struct.unpack_from('<H',body,pos)[0];pos+=2;end=body.index(0,pos);classes[body[pos:end].decode('utf-8')]=ident;pos=end+1
    if classes.get('C_idle') not in spriteIds:continue
    animations={}
    for action in ['C_idle']:
     if classes.get(action) not in spriteIds:continue
     try:animations[action]=render_vector(m,resource,action,classes[action])
     except Exception as exc:attempts.append({'id':m['id'],'action':action,'result':'vector-export-failed','reason':str(exc)})
    if 'C_idle' in animations:
     idle=animations['C_idle']
     for anim in animations.values():anim['rigScale']=anim['sourcePixelScale']/idle['sourcePixelScale']
     m['modes'][mode]={'animations':animations,'referenceHeight':idle['referenceHeight'],'status':'partial','issues':[{'note':'Only the first original idle pose is available; full vector animation and script-driven behavior remain pending.'}]};changed=True
     attempts.append({'id':m['id'],'mode':mode,'result':'vector-recovered','actions':list(animations)})
  if changed:
   world=m['modes'].get('world',{}).get('animations',{});battle=m['modes'].get('battle',{}).get('animations',{})
   m['capabilities']={'npc':'idle_0' in world,'companion':all(k in world for k in ['idle_0']+['run_'+str(i) for i in range(8)]),'enemy':'C_idle' in battle};m['status']='partial';m['recoveryPass']='nonstandard-actions-and-static-vectors'
   write_json(path,m);entry.update(capabilities=m['capabilities'],status=m['status']);recovered.append(m['id']);print(json.dumps({'recovered':m['id'],'capabilities':m['capabilities']}),flush=True)
 write_json(indexPath,index);organize(ROOT,Path(r'D:\Naruto Idle\Naruto_Idle'));summary=json.loads((ROOT/'reports/entity-summary.json').read_text(encoding='utf-8'));summary.update(statuses=dict(collections.Counter(e['status'] for e in index['entities'])),capabilities={role:sum(bool(e['capabilities'].get(role)) for e in index['entities']) for role in ['npc','companion','enemy']},usableInVillage=sum(any(e['capabilities'].values()) for e in index['entities']));write_json(ROOT/'reports/entity-summary.json',summary);write_json(ROOT/'reports/entity-second-pass.json',{'recoveredIds':recovered,'attempts':attempts});print(json.dumps(summary),flush=True)

if __name__=='__main__':main()
