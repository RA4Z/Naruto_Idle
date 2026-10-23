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


def pack(folder,output,url,pixel_budget=16_000_000,atlas_format='png',allow_pages=False):
    if atlas_format not in ('png','webp'):raise ValueError('Only lossless PNG or WebP supported')
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
    sizes=[frame.size for frame in frames]
    def layout(indices):
        options=[];page_sizes=[sizes[i] for i in indices]
        for width in (128,256,512,1024,2048,4096,8192):
            fit=shelf_layout(page_sizes,width)
            if fit is not None and 0<fit[1]<=8192 and width*fit[1]<=pixel_budget:
                options.append((width*fit[1],abs(width-fit[1]),width,fit))
        return min(options,key=lambda row:(row[0],row[1])) if options else None
    all_indices=list(range(len(frames)));whole=layout(all_indices)
    if whole:pages=[(all_indices,whole)]
    elif not allow_pages:raise ValueError('Packed atlas exceeds explicit pixel budget; no automatic downscaling')
    else:
        pages=[];current=[];current_layout=None
        for index in sorted(all_indices,key=lambda i:(-sizes[i][1],-sizes[i][0],i)):
            fit=layout(current+[index])
            if fit:current.append(index);current_layout=fit
            else:
                if not current:raise ValueError('A single native frame exceeds the page pixel budget')
                pages.append((current,current_layout));current=[index];current_layout=layout(current)
                if not current_layout:raise ValueError('A single native frame exceeds the page pixel budget')
        if current:pages.append((current,current_layout))
        if len(pages)>16 or sum(item[1][0] for item in pages)>64_000_000:
            raise ValueError('Multi-page atlas exceeds 16 pages or 64M total pixels; no automatic downscaling')
    output.mkdir(parents=True,exist_ok=True)
    atlas_frames={};origins=[None]*len(frames);frame_pages=[0]*len(frames);textures=[];image_names=[]
    for page,(indices,(_,_,width,(packed,height))) in enumerate(pages):
        atlas=Image.new('RGBA',(width,height));page_frames=[]
        for local,i in enumerate(indices):
            image=frames[i];x,y=packed[local];w,h=image.size;atlas.alpha_composite(image,(x,y))
            record={'frame':{'x':x,'y':y,'w':w,'h':h},'rotated':False,'trimmed':False,
                    'spriteSourceSize':{'x':0,'y':0,'w':w,'h':h},'sourceSize':{'w':w,'h':h}}
            atlas_frames[str(i)]=record;page_frames.append({'filename':str(i),**record})
            px,py=positions[i];origins[i]=[-px/w,-py/h];frame_pages[i]=page
        image_name=('effect' if len(pages)==1 else f'effect-{page}')+'.'+atlas_format;image_names.append(image_name)
        if atlas_format=='webp':atlas.save(output/image_name,lossless=True,exact=True,method=4)
        else:atlas.save(output/image_name,compress_level=2)
        textures.append({'image':image_name,'format':'RGBA8888','size':{'w':width,'h':height},'scale':1,'frames':page_frames})
        atlas.close()
    atlas_data={'frames':atlas_frames,'meta':{'image':image_names[0],'size':textures[0]['size'],'scale':'1'}}
    if len(pages)>1:atlas_data['textures']=textures
    (output/'effect-atlas.json').write_text(json.dumps(atlas_data,separators=(',',':'))+'\n',encoding='utf-8')
    animation={'url':url+'/'+image_names[0],'packedAtlasUrl':url+'/effect-atlas.json','frameWidth':max(w for w,h in sizes),
               'frameHeight':max(h for w,h in sizes),'frames':len(frames),'timeline':timeline,'fps':metadata['fps'],
               'origin':origins[0],'frameOrigins':origins,'frameSizes':sizes,'frameLayout':'native-packed-ground-origins-v1',
               'sourcePixelScale':1,'status':'ready','nativeFrameCount':len(files),'sourceBounds':metadata['rectTwips'],
               'rendering':'JPEXS-26.4.0-static-display-list','staticOnly':True}
    if len(pages)>1:animation.update({'multiAtlas':True,'atlasPageUrls':[url+'/'+name for name in image_names],'framePages':frame_pages})
    # Reconstruct EVERY native frame on the original coordinate plane from the
    # persisted atlas. This catches trimming, rectangle, origin and dedup errors.
    stored=None;loaded_page=-1
    try:
        for index,unique in enumerate(timeline):
            page=frame_pages[unique]
            if page!=loaded_page:
                if stored is not None:stored.close()
                with Image.open(output/image_names[page]) as raw:stored=raw.convert('RGBA')
                loaded_page=page
            rect=atlas_frames[str(unique)]['frame'];x,y,w,h=[rect[k] for k in ('x','y','w','h')]
            crop=stored.crop((x,y,x+w,y+h));canvas=Image.new('RGBA',source_size)
            if crop.getbbox():
                px,py=positions[unique];canvas.alpha_composite(crop,(round(px-left),round(py-top)))
            if hashlib.sha256(canvas.tobytes()).hexdigest()!=probe_hashes[index]:raise ValueError(f'Native source pixels differ at frame {index}')
    finally:
        if stored is not None:stored.close()
    proof={'nativeFrames':len(files),'uniqueFrames':len(frames),'nativeCanvasSize':source_size,'allFramesPixelExact':True,'originalCoordinatesPreserved':True,
           'atlasPages':len(pages),'atlasPixels':sum(page[1][0] for page in pages),'estimatedDecodedBytes':sum(page[1][0] for page in pages)*4,'sourcePixelScale':1,'frameRgbaSha256':probe_hashes,'atlasEncoding':'lossless-'+atlas_format}
    (output/'manifest.json').write_text(json.dumps({'animations':{'effect':animation},'rendererSource':metadata,'validation':proof},indent=2)+'\n',encoding='utf-8')
    return animation,proof


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--frames',required=True);parser.add_argument('--output',required=True);parser.add_argument('--url',required=True)
    args=parser.parse_args();animation,proof=pack(Path(args.frames),Path(args.output),args.url)
    print(json.dumps({k:v for k,v in proof.items() if k!='frameRgbaSha256'}))


if __name__=='__main__':main()
