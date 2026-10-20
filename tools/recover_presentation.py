"""Recover linked effects/audio, preserving configuration and frame-event provenance."""
from pathlib import Path
import argparse,collections,json,os,shutil,struct,subprocess,zlib
import xml.etree.ElementTree as ET
from PIL import Image
from entity_pipeline import tags,convert,write_json
from swf_bytes import decode

ROOT=Path(__file__).resolve().parent.parent
SOURCE=Path(r'D:\Naruto Idle\Naruto_Idle')
rows=json.loads((SOURCE/'recovery/resource-manifest.json').read_text(encoding='utf-8'))['assets'];lookup={r['path']:r for r in rows}
def source(path):return SOURCE/'recovered-web/cdn'/lookup[path]['tag']/path
def xml(path):
 b=source(path).read_bytes()
 try:b=zlib.decompress(b)
 except zlib.error:pass
 return ET.fromstring(b)

def vector_effect(name,ident):
 output=ROOT/'assets-extraidos/efeitos'/name;output.mkdir(parents=True,exist_ok=True)
 original=source('assets/battle/effect/'+name+'.swf');decoded=output/'source.swf';decoded.write_bytes(decode(original.read_bytes()))
 java=SOURCE/'tools/jre17/jdk-17.0.20.1+1-jre/bin/java.exe';jar=SOURCE/'tools/ffdec/ffdec.jar'
 env=os.environ.copy();env['APPDATA']=str(ROOT/'tools/jpexs-profile');env['LOCALAPPDATA']=env['APPDATA']
 command=[str(java),'-Djava.awt.headless=true','-Duser.home='+str(ROOT/'tools/jpexs-profile'),'-Xmx1536m','-jar',str(jar),'-ignorebackground','-format','sprite:png','-selectid',str(ident),'-exportTimeout','160','-export','sprite',str(output/'frames'),str(decoded)]
 if not list((output/'frames').rglob('*.png')):
  result=subprocess.run(command,capture_output=True,env=env,timeout=180)
  (output/'export.log').write_bytes(result.stdout+b'\n'+result.stderr)
  if result.returncode:raise ValueError('JPEXS export failed: '+str(result.returncode))
 files=sorted((output/'frames').rglob('*.png'),key=lambda p:int(p.stem) if p.stem.isdigit() else 0)
 if not files:raise ValueError('JPEXS produced no PNG frames')
 images=[];sourceBounds=[]
 for file in files:
  im=Image.open(file).convert('RGBA');box=im.getbbox();sourceBounds.append(box);images.append(im.crop(box) if box else Image.new('RGBA',(1,1)))
 originalWidth=max(im.width for im in images);originalHeight=max(im.height for im in images)
 ratio=min(1,384/max(originalWidth,originalHeight));width=max(1,round(originalWidth*ratio));height=max(1,round(originalHeight*ratio))
 # The new game controls projectile travel. Preserve original effect pixels while
 # removing its old arena translation, without stretching individual frames.
 images=[im.resize((max(1,round(im.width*ratio)),max(1,round(im.height*ratio))),Image.Resampling.LANCZOS) for im in images]
 unique=[];hashes={};timeline=[]
 for im in images:
  frame=Image.new('RGBA',(width,height));frame.alpha_composite(im,((width-im.width)//2,(height-im.height)//2));key=frame.tobytes()
  if key not in hashes:hashes[key]=len(unique);unique.append(frame)
  timeline.append(hashes[key])
 cols=min(8,8192//width,len(unique));r=(len(unique)+cols-1)//cols
 if r*height>8192:raise ValueError('Vector atlas exceeds 8192')
 sheet=Image.new('RGBA',(cols*width,r*height))
 for i,im in enumerate(unique):sheet.alpha_composite(im,((i%cols)*width,(i//cols)*height))
 folder=ROOT/'public/assets/effects'/name;folder.mkdir(parents=True,exist_ok=True);sheet.save(folder/'effect.png',compress_level=2)
 b=decoded.read_bytes();off=8+(5+4*(b[8]>>3)+7)//8;fps=struct.unpack_from('<H',b,off)[0]/256
 anim={'url':'/assets/effects/'+name+'/effect.png','frameWidth':width,'frameHeight':height,'frames':len(unique),'timeline':timeline,'fps':fps,'origin':[.5,.5],'status':'ready','rendering':'JPEXS-static-vector-timeline','originalSpriteId':ident,'sourcePixelScale':ratio,'placement':'centered-frames-with-game-controlled-travel'}
 write_json(folder/'manifest.json',{'animations':{'effect':anim},'source':str(original),'exportedFrames':len(images),'referenceHeight':height,'status':'ready'})
 return anim

def main():
 effects={};issues=[]
 effectinfo={e.get('id'):e.attrib for e in xml('assets/battle/Effect.xml')}
 for name,ident in [('luoxuanwan',393),('qianniao',371)]:
  try:effects[name]=vector_effect(name,ident)
  except Exception as e:issues.append({'effect':name,'error':str(e)})
 for name,action in [('zhihuozaishen','effect'),('hphuifu','effect_battle_addhp'),('DaJiTeXiao','d1')]:
  try:
   folder=ROOT/'public/assets/effects'/name;manifest=convert(source('assets/battle/effect/'+name+'.swf'),folder,'/assets/effects/'+name,'effect');write_json(folder/'manifest.json',manifest);effects[name]=manifest['animations'][action]
  except Exception as e:issues.append({'effect':name,'error':str(e)})
 packages={e.get('id'):e for e in xml('assets/sound/soundConfig.xml').iter('package')};sounds={};characters={}
 actionBindings={e.get('id'):e for e in xml('assets/battle/SkillAction.xml')}
 previous=json.loads((ROOT/'public/assets/presentation.json').read_text(encoding='utf-8')) if (ROOT/'public/assets/presentation.json').exists() else {}
 for legacy,slug,skill in [('naruto','naruto-kid','21000104'),('sasuke','sasuke-kid','21000204'),('sakura','sakura-kid','21000304')]:
  root=ET.fromstring((ROOT/'public/assets/characters'/slug/'battle/actions.xml').read_bytes());fps=float(root.get('frameRate','24'));actions={}
  binding=actionBindings.get(skill);specialAction=binding.get('attackAction','SP_skill1') if binding is not None else 'SP_skill1'
  for action in root.findall('action'):
   if action.get('name') not in ['A_1hit',specialAction,'C_dead','C_hurt']:continue
   events=[]
   for frame in action.iter('frame'):
    sid=frame.get('sound')
    if not sid:continue
    events.append({'time':round(int(frame.get('index','0'))*1000/fps),'sound':sid,'volume':min(1,float(frame.get('volume','100'))/100)})
   actions['SP_skill1' if action.get('name')==specialAction else action.get('name')]=sorted(events,key=lambda e:e['time'])
  characters[legacy]={'skillId':skill,'action':specialAction,'actions':actions}
 for sid in sorted(set(e['sound'] for c in characters.values() for a in c['actions'].values() for e in a)|set(previous.get('sounds',{}))):
  package=packages.get(sid)
  if package is None:issues.append({'sound':sid,'error':'package not in soundConfig'});continue
  path='assets/sound/'+package.get('src','');clips=[]
  if path not in lookup:issues.append({'sound':sid,'error':'missing original '+path});continue
  for kind,payload in tags(source(path).read_bytes()):
   if kind==14 and payload[2]>>4==2:
    ident=struct.unpack_from('<H',payload)[0];folder=ROOT/'public/assets/audio/sfx'/sid;folder.mkdir(parents=True,exist_ok=True);target=folder/(str(ident)+'.mp3');target.write_bytes(payload[9:]);clips.append('/assets/audio/sfx/'+sid+'/'+target.name)
  if clips:sounds[sid]={'name':package.get('name'),'urls':clips,'source':path}
 subskills={e.get('id'):e for e in xml('assets/battle/SubSkillInfo.xml')};skillnames={e.get('id'):e.get('name') for e in xml('config/battle/SkillInfos.xml')}
 for character,config in characters.items():
  entry=subskills[config['skillId']].find('SubSkillInfo');config['name']=skillnames[config['skillId']];config['sourceMapping']=entry.attrib
  if config['skillId'] in actionBindings:config['activeActionMapping']=actionBindings[config['skillId']].attrib
 musicSource='assets/sound/scene/SE/main.mp3';musicFolder=ROOT/'public/assets/audio/music';musicFolder.mkdir(parents=True,exist_ok=True);shutil.copyfile(source(musicSource),musicFolder/'main.mp3')
 config={'music':{'url':'/assets/audio/music/main.mp3','source':musicSource,'selection':'prototype-village-ambience'},'characters':characters,'effects':effects,'sounds':sounds,'issues':issues,'provenance':['assets/battle/SubSkillInfo.xml','assets/battle/SkillAction.xml','assets/battle/Effect.xml','assets/sound/soundConfig.xml','config/battle/SkillInfos.xml']}
 write_json(ROOT/'public/assets/presentation.json',config);write_json(ROOT/'reports/presentation-recovery.json',config)
 print(json.dumps({'effects':list(effects),'soundPackages':len(sounds),'soundFiles':sum(len(s['urls']) for s in sounds.values()),'issues':issues}),flush=True)

if __name__=='__main__':main()
