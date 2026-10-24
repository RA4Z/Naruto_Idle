"""Lossless source bundle when a clip exceeds the live atlas memory ceiling.

One frame is decoded at a time. This is an extracted source asset, explicitly
requiring a streaming/tiled runtime adapter before use in world combat.
"""
import hashlib,json,struct
from pathlib import Path
from PIL import Image

def _pack_sequence_serial(native,output,*,reuse_verified=False,encoding_method=4):
    metadata=json.loads((native/'render.json').read_bytes());files=sorted(native.glob('*.png'))
    if not metadata.get('staticOnly') or len(files)!=metadata['frameCount'] or not 1<=len(files)<=480:raise ValueError('Incomplete static source timeline')
    output.mkdir(parents=True,exist_ok=True);keys={};frame_files=[];timeline=[];hashes=[];canvas=None;visible=False
    for source in files:
        with Image.open(source) as raw:image=raw.convert('RGBA')
        if canvas is not None and image.size!=canvas:raise ValueError('Native coordinate plane changed')
        canvas=image.size;width,height=canvas
        if max(canvas)>8192 or width*height>16_000_000:raise ValueError('Source frame exceeds bounded decoder memory')
        visible|=image.getbbox() is not None;pixels=image.tobytes();rgba=hashlib.sha256(pixels).hexdigest();hashes.append(rgba)
        if rgba not in keys:
            filename='frame-'+hashlib.sha256(struct.pack('<II',width,height)+pixels).hexdigest()[:24]+'.webp';target=output/filename
            if not reuse_verified or not target.is_file():image.save(target,lossless=True,exact=True,method=encoding_method)
            with Image.open(target) as stored:
                if hashlib.sha256(stored.convert('RGBA').tobytes()).hexdigest()!=rgba:raise ValueError('Source sequence pixels changed')
            keys[rgba]=len(frame_files);frame_files.append(filename)
        timeline.append(keys[rgba]);image.close()
    if not visible:raise ValueError('All source frames are transparent')
    left,top=[v/20 for v in metadata['rectTwips'][:2]]
    proof={'nativeFrames':len(files),'uniqueFrames':len(frame_files),'nativeCanvasSize':list(canvas),'allFramesPixelExact':True,
           'originalCoordinatesPreserved':True,'sourcePixelScale':1,'frameRgbaSha256':hashes,'encoding':'lossless-webp',
           'scope':'Every full source-rendered RGBA frame serialized without trimming, resizing or timeline changes. Source extraction only; a bounded streaming/tiled runtime adapter is required.'}
    data={'version':1,'state':'source-frames-complete-runtime-adapter-pending','rendererSource':metadata,'fps':metadata['fps'],
          'frameFiles':frame_files,'timeline':timeline,'frameSize':list(canvas),'sourceBounds':metadata['rectTwips'],
          'origin':[-left/width,-top/height],'sourcePixelScale':1,'validation':proof}
    (output/'manifest.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return data,proof


def pack_sequence(native,output,*,workers=None):
    from parallel_sequence_encode import encode_sequence,sequence_method
    from functools import partial
    return encode_sequence(Path(native),Path(output),partial(_pack_sequence_serial,encoding_method=sequence_method()),workers=workers)
