"""Static asset preparation. Originals are read only; all outputs are copies."""
import argparse,json,struct,zlib,shutil,hashlib,xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
ap=argparse.ArgumentParser();ap.add_argument('--source',default=r'D:\Naruto Idle\Naruto_Idle');ap.add_argument('--output',default=r'D:\Naruto Idle\Naruto Idle RPG');args=ap.parse_args()
SRC=Path(args.source);DST=Path(args.output);PUB=DST/'public/assets';PUB.mkdir(parents=True,exist_ok=True)
rows=json.loads((SRC/'recovery/resource-manifest.json').read_text(encoding='utf-8'))['assets'];lookup={r['path']:r for r in rows}
def get(p):
 r=lookup[p];return SRC/'recovered-web/cdn'/r['tag']/p
def unpack(b):
 try:return zlib.decompress(b)
 except zlib.error:return b
def swf_decode(b):
 if not b.startswith(b'ZWS\x00\xff\xff\xff\xff'):return b
 high=b[8:19:2];low=b[9:19:2];header=bytes((high[i]&15)|((high[i+1]&15)<<4) for i in range(0,6,2))+low;body=bytearray(b[19:])
 for i in range(1,min(128,len(body)),2):body[i]^=255
 return header+body
manifest=[]
for name,ident in [('naruto','11000101'),('sasuke','11000201'),('sakura','11000301')]:
 slug=name+'-kid';(PUB/'characters'/slug).mkdir(parents=True,exist_ok=True)
 portrait='assets/battle/role/head_110_100/'+ident+'.png';im=Image.open(get(portrait));im.save(PUB/'characters'/slug/'portrait.png')
 manifest.append({'key':name+'-portrait','url':'/assets/characters/'+slug+'/portrait.png','source':str(get(portrait)),'id':ident,'status':'ready','dimensions':list(im.size),'category':'interface','character':name})
 for category,p in [('exploracao',f'assets/role/npc/scene/npcres/{ident}_outdoor.swf'),('combate',f'assets/battle/role/left/{ident}.swf')]:
  if p not in lookup:manifest.append({'id':ident,'category':category,'status':'missing'});continue
  out=DST/'assets-extraidos/personagens'/slug/'sources'/('world' if category=='exploracao' else 'battle')/(ident+'.swf');out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(swf_decode(get(p).read_bytes()))
  manifest.append({'source':str(get(p)),'output':str(out),'id':ident,'category':category,'character':name,'status':'decoded-not-rendered','sha256':hashlib.sha256(out.read_bytes()).hexdigest()})
base='assets/scene/map/10001/';bg=ET.fromstring(unpack(get(base+'_scene_bg.xml').read_bytes()));tiles=list(bg.iter('img'));first=Image.open(get(tiles[0].get('url')));w,h=first.size
canvas=Image.new('RGB',((1+max(int(t.get('imgX')) for t in tiles))*w,(1+max(int(t.get('imgY')) for t in tiles))*h))
for t in tiles:canvas.paste(Image.open(get(t.get('url'))).convert('RGB'),(int(t.get('imgX'))*w,int(t.get('imgY'))*h))
original_size=canvas.size;canvas.save(PUB/'world.jpg',quality=94)
manifest.append({'key':'world','url':'/assets/world.jpg','category':'mapas','source':str(get(base+'_scene_bg.xml')),'status':'partial-background-only','original_dimensions':original_size,'dimensions':list(canvas.size),'tile_dimensions':[w,h],'tiles':len(tiles),'collision':'authored-street-polygon','world_coordinates':[1000,1000]})
dataout=DST/'assets-extraidos/mapas/10001';dataout.mkdir(parents=True,exist_ok=True)
for suffix in ['_scene_bg.xml','_scene_mg.xml','_scene_fg.xml']:
 if base+suffix in lookup:(dataout/suffix).write_bytes(unpack(get(base+suffix).read_bytes()))
inventory=[]
for r in rows:
 p=r['path'];category='outros'
 for marker,c in [('assets/battle/role/','personagens/combate'),('assets/role/','personagens/exploracao'),('assets/battle/effect/','efeitos'),('assets/skill/','efeitos'),('assets/scene/','mapas'),('assets/sound/','audio'),('assets/bag/item/','itens'),('flash/','interface')]:
  if p.startswith(marker):category=c;break
 inventory.append({'source':str(get(p)),'original_path':p,'version':r['tag'],'category':category,'size_declared':r['size'],'status':'original-available-conversion-pending' if p.endswith('.swf') else 'original-available','conversion_output':None})
out=DST/'assets-extraidos/manifestos';out.mkdir(parents=True,exist_ok=True)
(out/'inventory.json').write_text(json.dumps(inventory,ensure_ascii=False),encoding='utf-8')
(PUB/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'inventoried':len(inventory),'prepared':len(manifest),'map_size':canvas.size,'map_tiles':len(tiles)}))
