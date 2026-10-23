"""Recover every role resource into a per-entity, lazy-loadable catalogue.
Static decoding only. Unsupported assets remain explicit entries, never invented.
"""
import argparse, concurrent.futures, collections, hashlib, io, json, math, re, shutil, struct, zlib
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image
from bitmap_cache import BitmapCache
from swf_bytes import decode
from entity_layout import catalog_path,manifest_path,organize

VERSION=3
STARTERS={'11000101':('naruto','naruto-kid','Naruto'), '11000201':('sasuke','sasuke-kid','Sasuke'), '11000301':('sakura','sakura-kid','Sakura')}
def write_json(path,value):
 path.parent.mkdir(parents=True,exist_ok=True)
 temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(path)

def tags(data):
 b=decode(data)
 if b[:3]!=b'FWS':raise ValueError('SWF compression not supported')
 off=8+(5+4*(b[8]>>3)+7)//8+4
 while off+2<=len(b):
  head=struct.unpack_from('<H',b,off)[0];off+=2;size=head&63;kind=head>>6
  if size==63:size=struct.unpack_from('<I',b,off)[0];off+=4
  if off+size>len(b):raise ValueError('Truncated tag')
  yield kind,b[off:off+size];off+=size

def lossless(payload,alpha):
 ident,fmt,w,h=struct.unpack_from('<HBHH',payload);pos=7
 if fmt==3:count=payload[pos]+1;pos+=1
 b=zlib.decompress(payload[pos:]);pixels=[]
 if fmt==3:
  channels=4 if alpha else 3;stride=(w+3)&~3;offset=count*channels
  image=Image.frombytes('P',(w,h),b[offset:offset+stride*h],'raw','P',stride)
  palette=bytearray()
  for i in range(count):
   r,g,blue=b[i*channels:i*channels+3];a=b[i*channels+3] if alpha else 255
   palette.extend((min(255,(r*255+a//2)//a),min(255,(g*255+a//2)//a),min(255,(blue*255+a//2)//a),a) if a else (0,0,0,0))
  image.putpalette(bytes(palette),rawmode='RGBA')
  return ident,image.convert('RGBA')
 if fmt==5:
  image=Image.frombytes('RGBA',(w,h),b[:w*h*4],'raw','ARGB')
  if not alpha:image.putalpha(255);return ident,image
  pixels=bytearray(image.tobytes())
  for i in range(0,len(pixels),4):
   a=pixels[i+3]
   if a==0:pixels[i:i+3]=b'\x00\x00\x00'
   elif a<255:
    for channel in range(3):pixels[i+channel]=min(255,(pixels[i+channel]*255+a//2)//a)
  return ident,Image.frombytes('RGBA',(w,h),bytes(pixels))
 if fmt==4 and not alpha:
  stride=(w*2+3)&~3
  for y in range(h):
   for x in range(w):
    v=struct.unpack_from('<H',b,y*stride+x*2)[0];pixels.append((((v>>10)&31)*255//31,((v>>5)&31)*255//31,(v&31)*255//31,255))
 else:raise ValueError('Unsupported lossless format '+str(fmt))
 if alpha:pixels=[(min(255,(r*255+a//2)//a),min(255,(g*255+a//2)//a),min(255,(blue*255+a//2)//a),a) if a else (0,0,0,0) for r,g,blue,a in pixels]
 im=Image.new('RGBA',(w,h));im.putdata(pixels);return ident,im

def read_actions(path,max_image_pixels=None,only_actions=None,frame_limits=None,image_cache=None,preferred_config=False):
 records=list(tags(path.read_bytes()));images={};symbols={};xml=None;pixel_total=0
 for kind,p in records:
  if kind==87 and p[6:].lstrip().startswith(b'<actions'):xml=p[6:]
  elif kind==76:
   count=struct.unpack_from('<H',p)[0];pos=2
   for _ in range(count):
    ident=struct.unpack_from('<H',p,pos)[0];pos+=2;end=p.index(0,pos);symbols[p[pos:end].decode('utf-8')]=ident;pos=end+1
 if preferred_config:
  from mme_config import read_config
  root,_,_=read_config(path.read_bytes(),action_names=only_actions);xml=ET.tostring(root,encoding='utf-8')
 else:
  if not xml:raise ValueError('No bitmap actions XML: timeline/vector reconstruction required')
  root=ET.fromstring(xml)
 assets={a.get('id'):a.attrib for a in root.findall('asset')};needed=None
 if only_actions is not None:
  needed=set()
  for action in root.findall('action'):
   if action.get('name') not in only_actions:continue
   limit=(frame_limits or {}).get(action.get('name'))
   for frame in action.iter('frame'):
    if limit is not None and int(frame.get('index','0'))>=limit:continue
    for el in frame.findall('element'):
     if el.get('extname'):continue
     asset=assets.get(el.get('assetId'))
     if asset:needed.add(symbols.get(asset.get('className')))
 def check_size(w,h):
  nonlocal pixel_total
  pixel_total+=w*h
  if max_image_pixels is not None and pixel_total>max_image_pixels:raise ValueError('source-bitmap-pixel-budget-exceeded')
 for kind,p in records:
  if kind not in (20,36,21,35,90):continue
  ident=struct.unpack_from('<H',p)[0]
  if needed is not None and ident not in needed:continue
  cache_key=(kind,hashlib.sha256(p).digest()) if image_cache is not None else None
  cached=image_cache.get(cache_key) if image_cache is not None else None
  if cached is not None:
   check_size(*cached.size);images[ident]=cached;continue
  if kind in (20,36):
   w,h=struct.unpack_from('<HH',p,3);check_size(w,h);ident,im=lossless(p,kind==36)
  else:
   if kind in (35,90):
    length=struct.unpack_from('<I',p,2)[0];start=8 if kind==90 else 6
    im=Image.open(io.BytesIO(p[start:start+length]));check_size(*im.size);im=im.convert('RGBA');alpha=p[start+length:]
    if alpha:im.putalpha(Image.frombytes('L',im.size,zlib.decompress(alpha)))
   else:
    im=Image.open(io.BytesIO(p[2:]));check_size(*im.size);im=im.convert('RGBA')
  images[ident]=im
  if image_cache is not None:image_cache.put(cache_key,im)
 return root,assets,images,symbols,xml

def convert(path,folder,url,mode,only=None,frame_limits=None,pixel_budget=None,source_pixel_budget=None,compact=False,native_tween=False,image_cache=None,preferred_config=False):
 root,assets,images,symbols,xml=read_actions(path,max_image_pixels=source_pixel_budget,only_actions=only,frame_limits=frame_limits,image_cache=image_cache,preferred_config=preferred_config);folder.mkdir(parents=True,exist_ok=True);(folder/'actions.xml').write_bytes(xml)
 if native_tween:
  from native_tween import expand_tweens
  root=expand_tweens(root,only)
 if frame_limits:
  import copy
  root=copy.deepcopy(root)
  for action in root.findall('action'):
   limit=frame_limits.get(action.get('name'))
   if limit:
    for layer in action.findall('layer'):
     for frame in list(layer.findall('frame')):
      index=int(frame.get('index','0'))
      if index>=limit:layer.remove(frame)
      else:frame.set('length',str(min(int(frame.get('length','1')),limit-index)))
 animations={};issues=[];fps=float(root.get('frameRate','24'));refs=sorted(set(e.get('extname') for e in root.iter() if e.get('extname')))
 for action in root.findall('action'):
  name=action.get('name','')
  if not name:continue
  if only is not None and name not in only:continue
  if only is None and mode=='world' and not re.match(r'^(idle|run|stand)_?\d*$',name,re.I):continue
  if only is None and mode=='battle' and name not in ('C_idle','A_1hit','C_dead','C_hurt','SP_skill1','SP_skill2'):continue
  if mode=='effect' and not name:continue
  layers=action.findall('layer');end=max((int(f.get('index','0'))+int(f.get('length','1')) for l in layers for f in l.findall('frame')),default=0)
  if end<1 or end>480:issues.append({'action':name,'reason':'invalid-frame-count'});continue
  # Compute one shared action canvas across the entire animation, retaining the ground origin.
  bounds=[0.,0.,0.,0.];elements={};missing=set();unsupported=set()
  for el in action.iter('element'):
   # External symbols have their own namespace. assetId=0 is NOT local bitmap 0.
   if el.get('extname'):continue
   asset=assets.get(el.get('assetId'));image=images.get(symbols.get(asset.get('className'))) if asset else None
   if image is None:
    missing.add(el.get('assetId','unknown'));continue
   sx=float(el.get('scaleX','1'));sy=float(el.get('scaleY','1'));angle=math.radians(float(el.get('rotation','0')));co=math.cos(angle);si=math.sin(angle)
   a,b,c,d=co*sx,-si*sy,si*sx,co*sy;det=a*d-b*c
   if abs(det)<1e-9:continue
   tx=float(el.get('x','0'))+a*float(asset.get('x','0'))+b*float(asset.get('y','0'));ty=float(el.get('y','0'))+c*float(asset.get('x','0'))+d*float(asset.get('y','0'))
   opacity=float(el.get('alpha','1'));elements[id(el)]=(image,a,b,c,d,det,tx,ty,opacity)
   unsupported.update(set(el.attrib)-{'assetId','x','y','alpha','scaleX','scaleY','rotation'}-({'blendMode'} if el.get('blendMode')=='normal' else set()))
   for u,v in [(0,0),(image.width,0),(0,image.height),(image.width,image.height)]:
    x=a*u+b*v+tx;y=c*u+d*v+ty;bounds=[min(bounds[0],x),min(bounds[1],y),max(bounds[2],x),max(bounds[3],y)]
  if any(f.get('tween')=='true' and any(id(e) in elements for e in f.findall('element')) for f in action.iter('frame')):
   unsupported.add('tween-interpolation')
  if not elements:issues.append({'action':name,'reason':'no-resolved-bitmaps','missing':sorted(missing)});continue
  left,top=math.floor(bounds[0])-2,math.floor(bounds[1])-2;w=math.ceil(bounds[2])-left+2;h=math.ceil(bounds[3])-top+2
  if not compact and (w>2048 or h>2048):issues.append({'action':name,'reason':'canvas-too-large','size':[w,h]});continue
  if pixel_budget is not None and not compact:
   signatures=set()
   for time in range(end):
    visible=[]
    for layer in layers:
     active=[f for f in layer.findall('frame') if int(f.get('index','0'))<=time<int(f.get('index','0'))+int(f.get('length','1'))]
     if active:visible.extend(el for el in active[-1].findall('element') if id(el) in elements)
    signatures.add(tuple(tuple(sorted(el.attrib.items())) for el in visible))
   if w*h*len(signatures)>pixel_budget:issues.append({'action':name,'reason':'canvas-pixel-budget-exceeded','estimatedPixels':w*h*len(signatures)});continue
  cache={};content_frames={};frames=[];timeline=[];frame_bounds=[];frame_positions=[];allocated=0;failed=None
  if compact and (max(w,h)>8192 or w*h>16000000):issues.append({'action':name,'reason':'temporary-canvas-budget-exceeded','size':[w,h]});continue
  for time in range(end):
   visible=[]
   for layer in layers:
    active=[f for f in layer.findall('frame') if int(f.get('index','0'))<=time<int(f.get('index','0'))+int(f.get('length','1'))]
    if active:visible.extend(el for el in active[-1].findall('element') if id(el) in elements)
   signature=tuple(tuple(sorted(el.attrib.items())) for el in visible)
   if signature not in cache:
    fl,ft,fw,fh=left,top,w,h
    # Use the original shared coordinate canvas before cropping. Re-basing the
    # affine rasterizer for each pose changes subpixel interpolation slightly.
    # Only retained frames/atlases are compact; the one temporary canvas is bounded.
    frame=Image.new('RGBA',(fw,fh))
    for el in visible:
     image,a,b,c,d,det,tx,ty,opacity=elements[id(el)];tx-=fl;ty-=ft
     transformed=image.transform((fw,fh),Image.Transform.AFFINE,(d/det,-b/det,(-d*tx+b*ty)/det,-c/det,a/det,(c*tx-a*ty)/det),Image.Resampling.BICUBIC)
     if opacity!=1:transformed.putalpha(transformed.getchannel('A').point(lambda v:round(v*opacity)))
     frame.alpha_composite(transformed)
    if compact:
     bbox=frame.getbbox()
     if bbox:frame=frame.crop(bbox);fl+=bbox[0];ft+=bbox[1]
     else:frame=Image.new('RGBA',(1,1));fl=ft=0
     # Different source bitmap IDs can contain identical pixels. Registration is
     # part of the key, so a translated pose never inherits another origin.
     content_key=(frame.size,hashlib.sha256(frame.tobytes()).digest(),fl,ft)
     if content_key in content_frames:
      cache[signature]=content_frames[content_key];timeline.append(cache[signature]);frame.close();continue
     allocated+=frame.width*frame.height
     if pixel_budget is not None and allocated>pixel_budget:failed={'action':name,'reason':'compact-pixel-budget-exceeded','estimatedPixels':allocated};break
     content_frames[content_key]=len(frames)
    cache[signature]=len(frames);frames.append(frame);frame_bounds.append(frame.getbbox());frame_positions.append((fl,ft))
   timeline.append(cache[signature])
  if failed:issues.append(failed);continue
  if compact:
   w=max(f.width for f in frames);h=max(f.height for f in frames)
   if pixel_budget is not None and w*h*len(frames)>pixel_budget:issues.append({'action':name,'reason':'compact-atlas-budget-exceeded','estimatedPixels':w*h*len(frames)});continue
  cols=min(8,max(1,8192//w),len(frames));rows=(len(frames)+cols-1)//cols
  if compact:
   layouts=[(c,(len(frames)+c-1)//c) for c in range(1,min(8,8192//w,len(frames))+1) if ((len(frames)+c-1)//c)*h<=8192]
   if layouts:cols,rows=min(layouts,key=lambda cr:(cr[0]*cr[1],abs(cr[0]*w-cr[1]*h)))
  if rows*h>8192:issues.append({'action':name,'reason':'texture-exceeds-8192'});continue
  if compact and pixel_budget is not None and cols*w*rows*h>pixel_budget:issues.append({'action':name,'reason':'padded-atlas-budget-exceeded','estimatedPixels':cols*w*rows*h});continue
  sheet=Image.new('RGBA',(cols*w,rows*h))
  for i,frame in enumerate(frames):sheet.alpha_composite(frame,((i%cols)*w,(i//cols)*h))
  safeName=name.strip() if re.fullmatch(r'[A-Za-z0-9_-]+',name.strip()) else 'action-'+hashlib.sha256(name.encode()).hexdigest()[:12]
  filename=safeName+('-'+hashlib.sha256(name.encode()).hexdigest()[:8] if name!=name.strip() or sum(a.get('name','').strip().casefold()==name.strip().casefold() for a in root.findall('action'))>1 else '')+'.png'
  sheet.save(folder/filename,compress_level=2)
  boxes=[b for b in frame_bounds if b]
  if not boxes:issues.append({'action':name,'reason':'all-frames-transparent'});continue
  height=max(1,round(sum(b[3]-b[1] for b in boxes)/len(boxes)))
  external=sorted(set(el.get('extname') for el in action.iter() if el.get('extname')))
  animations[name]={'url':url+'/'+filename,'frameWidth':w,'frameHeight':h,'frames':len(frames),'timeline':timeline,'fps':fps,'origin':[-left/w,-top/h],'referenceHeight':height,'status':'partial' if missing or unsupported or external else 'ready','externalEffects':external}
  if compact:
   animations[name]['frameOrigins']=[[-x/w,-y/h] for x,y in frame_positions]
   animations[name]['origin']=animations[name]['frameOrigins'][0]
   animations[name]['frameLayout']='compact-ground-origins-v1'
  if missing or unsupported or external:issues.append({'action':name,'missing':sorted(missing),'unsupported':sorted(unsupported),'externalEffects':external})
 if not animations:raise ValueError('No supported actions rendered; '+str(issues[:2]))
 idle=next((animations[k] for k in ['idle_0','C_idle','stand'] if k in animations),next(iter(animations.values())))
 return {'animations':animations,'referenceHeight':idle['referenceHeight'],'status':'partial' if issues else 'ready','issues':issues,'externalEffects':refs}

def discover(source):
 rows=json.loads((source/'recovery/resource-manifest.json').read_text(encoding='utf-8'))['assets'];entries={};names=collections.defaultdict(collections.Counter);evidence=collections.defaultdict(list)
 for r in rows:
  path=r['path'];mode=None;ident=None
  for prefix,pattern,m in [('assets/battle/role/left/',r'(\d+)\.swf','battle'),('assets/role/npc/scene/npcres/',r'(\d+)_outdoor\.swf','world'),('assets/battle/role/head_110_100/',r'(\d+)\.png','portrait')]:
   if path.startswith(prefix):
    match=re.fullmatch(pattern,path[len(prefix):])
    if match:ident=match[1];mode=m;break
  if ident:entries.setdefault(ident,{})[mode]={'path':path,'source':str(source/'recovered-web/cdn'/r['tag']/path)}
  if path.startswith('config/role/npc/scene/') and path.endswith('.xml'):
   b=(source/'recovered-web/cdn'/r['tag']/path).read_bytes()
   try:b=zlib.decompress(b)
   except zlib.error:pass
   try:
    for el in ET.fromstring(b).iter('NPC'):
     d=el.attrib;ident=d.get('roleId')
     if not ident:continue
     if d.get('name'):names[ident][d['name']]+=1
     evidence[ident].append({'config':path,'name':d.get('name'),'type':d.get('npcType'),'resource':d.get('res'),'hostile':d.get('initiativeAttack')=='1','position':d.get('destPixelPoint')})
   except ET.ParseError:pass
 ninjaPath='config/battle/NinjaInfos.xml'
 ninjaRow=next((r for r in rows if r['path']==ninjaPath),None)
 if ninjaRow:
  b=(source/'recovered-web/cdn'/ninjaRow['tag']/ninjaPath).read_bytes()
  try:b=zlib.decompress(b)
  except zlib.error:pass
  for e in ET.fromstring(b):
   ident=e.get('id');name=e.get('name','').strip()
   if ident in entries and name:
    names[ident][name]+=10000
    evidence[ident].append({'config':ninjaPath,'name':name,'type':None,'resource':entries[ident].get('battle',{}).get('path'),'hostile':False,'position':None})
 return entries,names,evidence

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--source',default=r'D:\Naruto Idle\Naruto_Idle');ap.add_argument('--project',default=r'D:\Naruto Idle\Naruto Idle RPG');ap.add_argument('--workers',type=int,default=1);ap.add_argument('--limit',type=int,default=0);ap.add_argument('--retry',action='store_true');args=ap.parse_args()
 project=Path(args.project);source=Path(args.source);out=project/'public/assets/para-revisao/novos-recursos';out.mkdir(parents=True,exist_ok=True)
 existing={e['id']:e for e in json.loads(catalog_path(project).read_text(encoding='utf-8'))['entities']} if catalog_path(project).exists() else {}
 entries,names,evidence=discover(source);legacy=json.loads((project/'public/assets/animations.json').read_text(encoding='utf-8'));catalog=[]
 for ident,resources in sorted(entries.items()):
  starter=STARTERS.get(ident);name=starter[2] if starter else names[ident].most_common(1)[0][0] if names[ident] else 'Recurso '+ident
  slug=starter[1] if starter else ident;ev=evidence[ident]
  entry={'id':ident,'slug':slug,'name':name,'aliases':list(names[ident]),'identity':'visually-verified' if starter else 'source-config' if names[ident] else 'unidentified','sourceRoles':sorted(set(e['type'] for e in ev if e['type'])),'hostile':any(e['hostile'] for e in ev),'resources':resources,'evidence':ev,'starter':starter[0] if starter else None}
  catalog.append(entry)
 write_json(project/'reports/entity-discovery.json',catalog)
 def process(entry):
  ident=entry['id'];folder=manifest_path(project,existing[ident]).parent if ident in existing else (project/'public/assets/characters'/entry['slug'] if entry['starter'] else out/entry['slug']);manifest=folder/'manifest.json';baseUrl='/'+folder.relative_to(project/'public').as_posix();fingerprint=hashlib.sha256(json.dumps(entry,sort_keys=True).encode()).hexdigest()
  if manifest.exists():
   old=json.loads(manifest.read_text(encoding='utf-8'))
   if old.get('pipelineVersion')==VERSION and old.get('fingerprint')==fingerprint and (not args.retry or old.get('status')!='blocked'):return old
  folder.mkdir(parents=True,exist_ok=True);result={k:v for k,v in entry.items() if k not in ('evidence','resources')};result.update(pipelineVersion=VERSION,fingerprint=fingerprint,modes={},sources=entry['resources'],evidence=entry['evidence'],issues=[])
  portrait=entry['resources'].get('portrait')
  if portrait:
   try:
    with Image.open(portrait['source']) as im:im.convert('RGBA').save(folder/'portrait.png')
    result['portrait']=baseUrl+'/portrait.png'
   except Exception as exc:result['issues'].append({'portrait':str(exc)})
  for mode in ['world','battle']:
   resource=entry['resources'].get(mode)
   if not resource:continue
   try:
    if entry['starter']:
     data=legacy[entry['starter']+'-'+mode];heights={'naruto':(107,118),'sasuke':(113,129),'sakura':(119,130)}
     result['modes'][mode]={'animations':data['animations'],'referenceHeight':heights[entry['starter']][mode=='battle'],'status':'partial' if data['warnings'] else 'ready','issues':data['warnings']}
    else:result['modes'][mode]=convert(Path(resource['source']),folder/mode,baseUrl+'/'+mode,mode)
   except Exception as exc:result['issues'].append({'mode':mode,'error':str(exc)})
  world=result['modes'].get('world',{}).get('animations',{})
  if 'idle_0' not in world:
   native=next((name for name in world if name.startswith(('idle','stand'))),None)
   if native:world['idle_0']={**world[native],'sourceAction':native}
  result['capabilities']={'npc':'idle_0' in world, 'companion':all(k in result['modes'].get('world',{}).get('animations',{}) for k in ['idle_0']+['run_'+str(i) for i in range(8)]), 'enemy':'C_idle' in result['modes'].get('battle',{}).get('animations',{})}
  result['status']='ready' if result['modes'] and not result['issues'] and all(m['status']=='ready' for m in result['modes'].values()) else 'partial' if result['modes'] else 'portrait-only' if result.get('portrait') else 'blocked'
  write_json(manifest,result);return result
 work=catalog[:args.limit] if args.limit else catalog
 # Process pools avoid the GIL and keep each worker's bitmap memory isolated.
 # Thread workers are intentional here: Pillow/zlib release the GIL and no IPC copies images.
 results=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
  for i,result in enumerate(pool.map(process,work),1):
   results.append(result)
   if i%25==0:print(json.dumps({'completed':i,'total':len(work),'id':result['id']}),flush=True)
 organize(project,source)
 index=json.loads(catalog_path(project).read_text(encoding='utf-8'))['entities']
 summary={'discovered':len(catalog),'processed':sum(e['status']!='pending' for e in index),'statuses':dict(collections.Counter(e['status'] for e in index)), 'capabilities':{key:sum(bool(e.get('capabilities',{}).get(key)) for e in index) for key in ['npc','companion','enemy']},'configurationOccurrences':sum(len(e['evidence']) for e in catalog)}
 write_json(project/'reports/entity-summary.json',summary);print(json.dumps(summary),flush=True)

if __name__=='__main__':main()
