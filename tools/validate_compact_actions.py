"""Independent shared-canvas pixel probes against the delivered static SWFs.
Checks timing, offsets and RGBA without using convert() or executing ActionScript.
External effects remain explicitly unresolved, not counted as reconstructed pixels.
"""
from pathlib import Path
import argparse,hashlib,json,math
from PIL import Image,ImageDraw,ImageChops
from entity_pipeline import read_actions,write_json
from original_archive import OriginalArchive
ROOT=Path(__file__).resolve().parents[1]

def render(elements, images, assets, symbols, box):
 left,top,right,bottom=box;canvas=Image.new('RGBA',(right-left,bottom-top))
 for el in elements:
  if el.get('extname'):continue
  asset=assets.get(el.get('assetId'));image=images.get(symbols.get(asset.get('className'))) if asset else None
  if image is None:continue
  angle=math.radians(float(el.get('rotation','0')));sx=float(el.get('scaleX','1'));sy=float(el.get('scaleY','1'))
  a,b,c,d=math.cos(angle)*sx,-math.sin(angle)*sy,math.sin(angle)*sx,math.cos(angle)*sy;det=a*d-b*c
  if abs(det)<1e-9:continue
  tx=float(el.get('x','0'))+a*float(asset.get('x','0'))+b*float(asset.get('y','0'))-left
  ty=float(el.get('y','0'))+c*float(asset.get('x','0'))+d*float(asset.get('y','0'))-top
  layer=image.transform(canvas.size,Image.Transform.AFFINE,(d/det,-b/det,(-d*tx+b*ty)/det,-c/det,a/det,(c*tx-a*ty)/det),Image.Resampling.BICUBIC)
  alpha=float(el.get('alpha','1'))
  if alpha!=1:layer.putalpha(layer.getchannel('A').point(lambda value:round(value*alpha)))
  canvas.alpha_composite(layer)
 return canvas

def main():
 p=argparse.ArgumentParser();p.add_argument('--source',required=True);args=p.parse_args();archive=OriginalArchive(args.source);rows=[];previews=[]
 catalog=json.loads((ROOT/'public/assets/catalog/entities.json').read_text(encoding='utf-8'))['entities']
 for entry in catalog:
  mp=ROOT/'public'/entry['manifestUrl'].lstrip('/');manifest=json.loads(mp.read_text(encoding='utf-8'))
  for mode,data in manifest.get('modes',{}).items():
   for name,definition in data['animations'].items():
    if definition.get('rendererRevision')!='external-symbol-compact-frame-origin-v2':continue
    evidence=definition['sourceEvidence'];assert archive.record(evidence['path'])==evidence
    root,assets,images,symbols,_=read_actions(archive.path(evidence['path']),32000000,{name})
    action=next(a for a in root.findall('action') if a.get('name')==name);layers=action.findall('layer')
    duration=max(int(f.get('index','0'))+int(f.get('length','1')) for l in layers for f in l.findall('frame'))
    timeline=definition['timeline'];assert len(timeline)==duration;assert definition['fps']==float(root.get('frameRate','24'))
    w,h=definition['frameWidth'],definition['frameHeight'];origins=definition['frameOrigins'];assert len(origins)==definition['frames']
    extreme=max(range(len(origins)),key=lambda i:abs(origins[i][0])+abs(origins[i][1]))
    probes=sorted({0,duration//2,duration-1,timeline.index(extreme)})
    path=ROOT/'public'/definition['url'].lstrip('/')
    with Image.open(path) as sheet:
     assert max(sheet.size)<=8192 and sheet.width*sheet.height<=16000000
     cols=sheet.width//w
     for time in probes:
      frame=timeline[time];visible=[];coordinates=[(0,0)]
      for layer in layers:
       active=[f for f in layer.findall('frame') if int(f.get('index','0'))<=time<int(f.get('index','0'))+int(f.get('length','1'))]
       if active:visible.extend(active[-1].findall('element'))
      for el in action.iter('element'):
       if el.get('extname'):continue
       asset=assets.get(el.get('assetId'));image=images.get(symbols.get(asset.get('className'))) if asset else None
       if image is None:continue
       angle=math.radians(float(el.get('rotation','0')));sx=float(el.get('scaleX','1'));sy=float(el.get('scaleY','1'))
       a,b,c,d=math.cos(angle)*sx,-math.sin(angle)*sy,math.sin(angle)*sx,math.cos(angle)*sy
       tx=float(el.get('x','0'))+a*float(asset.get('x','0'))+b*float(asset.get('y','0'));ty=float(el.get('y','0'))+c*float(asset.get('x','0'))+d*float(asset.get('y','0'))
       coordinates.extend((a*x+b*y+tx,c*x+d*y+ty) for x,y in [(0,0),(image.width,0),(0,image.height),(image.width,image.height)])
      box=(math.floor(min(x for x,y in coordinates))-2,math.floor(min(y for x,y in coordinates))-2,math.ceil(max(x for x,y in coordinates))+2,math.ceil(max(y for x,y in coordinates))+2)
      assert (box[2]-box[0])*(box[3]-box[1])<=16000000
      expected=render(visible,images,assets,symbols,box)
      actual=Image.new('RGBA',expected.size);cell=sheet.crop(((frame%cols)*w,(frame//cols)*h,(frame%cols+1)*w,(frame//cols+1)*h)).convert('RGBA')
      actual.alpha_composite(cell,(round(-origins[frame][0]*w)-box[0],round(-origins[frame][1]*h)-box[1]))
      if actual.tobytes()!=expected.tobytes():
       actual.save(ROOT/'reports/compact-probe-actual.png');expected.save(ROOT/'reports/compact-probe-source.png')
       diff=ImageChops.difference(actual,expected);print({'id':entry['id'],'frame':time,'diffExtrema':diff.getextrema(),'channelBounds':[c.getbbox() for c in diff.split()]},flush=True)
       raise AssertionError(f'{entry["id"]}/{name}/{time}: pixels or ground offset differ')
      if time==duration//2:
       preview=expected.crop(expected.getbbox()) if expected.getbbox() else expected;preview.thumbnail((210,170))
       tile=Image.new('RGBA',(250,220),'#1e2634');tile.alpha_composite(preview,((250-preview.width)//2,30+(170-preview.height)//2));ImageDraw.Draw(tile).text((6,4),entry['id']+' '+name,fill='white');previews.append(tile)
    rows.append({'id':entry['id'],'mode':mode,'action':name,'timingAndTimelineMatch':True,'groundOffsetsAndPixelsMatch':True,'sampledTimelineFrames':probes,'sourceHashesPreserved':True,'atlasSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'externalEffectsUnresolved':definition.get('externalEffects',[])})
    print(entry['id']+' '+name+' source probes verified',flush=True)
 assert len(rows)==31,len(rows)
 write_json(ROOT/'reports/compact-animation-validation.json',{'actions':rows,'count':len(rows),'scope':'RGBA probes in independent source coordinate canvas; no claim of complete external-effect reconstruction'})
 contact=Image.new('RGBA',(1000,math.ceil(len(previews)/4)*220),'#1e2634')
 for i,tile in enumerate(previews):contact.alpha_composite(tile,((i%4)*250,(i//4)*220))
 contact.convert('RGB').save(ROOT/'reports/compact-animation-contact.jpg',quality=90)

if __name__=='__main__':main()
