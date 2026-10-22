"""Lossless variable-rectangle atlas, preserving native registration per frame."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from PIL import Image


def shelf_layout(sizes,width):
    positions={};x=y=row_height=0
    for index in sorted(range(len(sizes)),key=lambda i:(-sizes[i][1],-sizes[i][0],i)):
        w,h=sizes[index]
        if w+2>width:return None
        if x+w+2>width:y+=row_height;x=0;row_height=0
        positions[index]=(x+1,y+1);x+=w+2;row_height=max(row_height,h+2)
    return positions,y+row_height


def pack(folder,output,url,pixel_budget=16_000_000):
    metadata=json.loads((folder/'render.json').read_text(encoding='utf-8'))
    if not metadata.get('staticOnly'):raise ValueError('Static provenance missing')
    files=sorted(folder.glob('*.png'))
    if len(files)!=metadata['frameCount'] or not 1<=len(files)<=480:raise ValueError('Native timeline incomplete')
    left,top,right,bottom=[v/20 for v in metadata['rectTwips']]
    frames=[];keys={};timeline=[];positions=[];probe_hashes=[];source_size=None
    for file in files:
        with Image.open(file) as raw:
            image=raw.convert('RGBA')
        if source_size is not None and image.size!=source_size:raise ValueError('Native coordinate plane changed')
        source_size=image.size;probe_hashes.append(hashlib.sha256(image.tobytes()).hexdigest())
        box=image.getbbox()
        if box:
            crop=image.crop(box);position=(left+box[0],top+box[1])
        else:crop=Image.new('RGBA',(1,1));position=(0.,0.)
        # Registration belongs in the key: equal pixels at different native
        # positions must not inherit the first pose's origin.
        key=(crop.size,hashlib.sha256(crop.tobytes()).digest(),position)
        if key not in keys:
            keys[key]=len(frames);frames.append(crop);positions.append(position)
        timeline.append(keys[key])
    if not any(frame.getbbox() for frame in frames):raise ValueError('All source frames are transparent')
    sizes=[frame.size for frame in frames];layouts=[]
    for width in (128,256,512,1024,2048,4096,8192):
        layout=shelf_layout(sizes,width)
        if layout is not None and 0<layout[1]<=8192 and width*layout[1]<=pixel_budget:
            layouts.append((width*layout[1],abs(width-layout[1]),width,layout))
    if not layouts:raise ValueError('Packed atlas exceeds explicit pixel budget; no automatic downscaling')
    _,_,width,(packed,height)=min(layouts,key=lambda row:(row[0],row[1]))
    atlas=Image.new('RGBA',(width,height));atlas_frames={};origins=[]
    for i,image in enumerate(frames):
        x,y=packed[i];w,h=image.size;atlas.alpha_composite(image,(x,y))
        atlas_frames[str(i)]={'frame':{'x':x,'y':y,'w':w,'h':h},'rotated':False,'trimmed':False,
                              'spriteSourceSize':{'x':0,'y':0,'w':w,'h':h},'sourceSize':{'w':w,'h':h}}
        px,py=positions[i];origins.append([-px/w,-py/h])
    output.mkdir(parents=True,exist_ok=True)
    atlas.save(output/'effect.png',compress_level=2)
    atlas_data={'frames':atlas_frames,'meta':{'image':'effect.png','size':{'w':width,'h':height},'scale':'1'}}
    (output/'effect-atlas.json').write_text(json.dumps(atlas_data,separators=(',',':'))+'\n',encoding='utf-8')
    animation={'url':url+'/effect.png','packedAtlasUrl':url+'/effect-atlas.json','frameWidth':max(w for w,h in sizes),
               'frameHeight':max(h for w,h in sizes),'frames':len(frames),'timeline':timeline,'fps':metadata['fps'],
               'origin':origins[0],'frameOrigins':origins,'frameSizes':sizes,'frameLayout':'native-packed-ground-origins-v1',
               'sourcePixelScale':1,'status':'ready','nativeFrameCount':len(files),'sourceBounds':metadata['rectTwips'],
               'rendering':'JPEXS-26.4.0-static-display-list','staticOnly':True}
    # Reconstruct EVERY native frame on the original coordinate plane from the
    # persisted atlas. This catches trimming, rectangle, origin and dedup errors.
    with Image.open(output/'effect.png') as stored:
        for index,unique in enumerate(timeline):
            rect=atlas_frames[str(unique)]['frame'];x,y,w,h=[rect[k] for k in ('x','y','w','h')]
            crop=stored.crop((x,y,x+w,y+h));canvas=Image.new('RGBA',source_size)
            if crop.getbbox():
                px,py=positions[unique];canvas.alpha_composite(crop,(round(px-left),round(py-top)))
            if hashlib.sha256(canvas.tobytes()).hexdigest()!=probe_hashes[index]:raise ValueError(f'Native source pixels differ at frame {index}')
    proof={'nativeFrames':len(files),'uniqueFrames':len(frames),'nativeCanvasSize':source_size,'allFramesPixelExact':True,'originalCoordinatesPreserved':True,
           'atlasPixels':width*height,'estimatedDecodedBytes':width*height*4,'sourcePixelScale':1,'frameRgbaSha256':probe_hashes}
    (output/'manifest.json').write_text(json.dumps({'animations':{'effect':animation},'rendererSource':metadata,'validation':proof},indent=2)+'\n',encoding='utf-8')
    return animation,proof


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--frames',required=True);parser.add_argument('--output',required=True);parser.add_argument('--url',required=True)
    args=parser.parse_args();animation,proof=pack(Path(args.frames),Path(args.output),args.url)
    print(json.dumps({k:v for k,v in proof.items() if k!='frameRgbaSha256'}))


if __name__=='__main__':main()
