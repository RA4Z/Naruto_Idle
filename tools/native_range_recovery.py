"""Resumable static intervals and full-canvas lossless sequences; no source execution."""
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import struct
import time
import uuid
from PIL import Image
from atomic_json import write_json_atomic
from bounded_process import run_bounded


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def renderer_fingerprint(classes, reference_classes, ffdec):
    return {'rangeClassSha256':sha(Path(classes)/'StaticSwfRenderRange.class'),
        'referenceClassSha256':sha(Path(reference_classes)/'StaticSwfRender.class'),
        'geometrySha256':sha(Path(__file__).with_name('source_canvas_geometry.py')),
        'jarsSha256':{path.name:sha(path) for path in sorted((Path(ffdec)/'lib').glob('*.jar'))}}


def contained(root, relative):
    relative = PurePosixPath(relative)
    if relative.is_absolute() or '..' in relative.parts or any(c in str(relative) for c in ('\\', ':')):
        raise ValueError('Generated range path escapes work root')
    path = (Path(root)/str(relative)).resolve()
    if not path.is_relative_to(Path(root).resolve()):
        raise ValueError('Generated range path follows external link')
    return path


def canvas_size(metadata):
    from source_canvas_geometry import native_canvas_size,conservative_canvas_size
    guarded_width,guarded_height=conservative_canvas_size(metadata['rectTwips'])
    if max(guarded_width,guarded_height)>8192 or guarded_width*guarded_height>16_000_000:
        raise ValueError('Original canvas exceeds unchanged decoder budget')
    return native_canvas_size(metadata['rectTwips'])


def validate_metadata(metadata, facts):
    if (metadata.get('symbolId')!=facts['symbolId'] or metadata.get('frameCount')!=facts['authoredFrames']
            or metadata.get('fps')!=facts['fps'] or metadata.get('staticOnly') is not True
            or metadata.get('renderer')!='JPEXS-26.4.0'):
        raise ValueError('Range renderer differs from original source facts')
    return canvas_size(metadata)


def inspect_range(root, folder, start, end, facts):
    root,folder = Path(root).resolve(),Path(folder).resolve()
    relative = folder.relative_to(root).as_posix()
    metadata = json.loads((folder/'render.json').read_bytes())
    size = validate_metadata(metadata,facts)
    interval = json.loads((folder/'range.json').read_bytes())
    if interval != {'start':start,'endExclusive':end,'sourceExecution':False}:
        raise ValueError('Completed range does not match requested interval')
    points = json.loads((folder/'named-instances.json').read_bytes())
    if points != [p for p in facts['namedInstances'] if start<=p['frame']<end]:
        raise ValueError('Range named points differ from source facts')
    names = {f'{frame:04d}.png' for frame in range(start,end)}
    if {p.name for p in folder.glob('*.png')} != names:
        raise ValueError('Range has missing, additional or duplicate frame files')
    frames = []
    for frame in range(start,end):
        path = folder/f'{frame:04d}.png'
        with Image.open(path) as image:
            image = image.convert('RGBA')
            if list(image.size)!=size:
                raise ValueError('Range changed full source coordinate plane')
            rgba = hashlib.sha256(image.tobytes()).hexdigest()
        frames.append({'frame':frame,'path':(PurePosixPath(relative)/path.name).as_posix(),
            'fileSha256':sha(path),'rgbaSha256':rgba})
    return {'start':start,'endExclusive':end,'metadata':metadata,
        'metadataFiles':{(PurePosixPath(relative)/name).as_posix():sha(folder/name)
            for name in ('render.json','named-instances.json','range.json')},'frames':frames}


def verified_frames(root, ledger, identity):
    if ledger.get('identity')!=identity:
        raise ValueError('Range resume source, facts or renderer fingerprint changed')
    output = []
    metadata = None
    for interval in ledger.get('ranges',[]):
        if interval['start']!=len(output) or interval['endExclusive']<=interval['start']:
            raise ValueError('Range coverage has a gap, overlap or reordered interval')
        if interval['endExclusive']-interval['start']>32:
            raise ValueError('Range exceeds bounded interval size')
        if metadata is not None and interval['metadata']!=metadata:
            raise ValueError('Source metadata changed between ranges')
        metadata = interval['metadata']
        validate_metadata(metadata,identity['facts'])
        if len(interval['frames'])!=interval['endExclusive']-interval['start']:
            raise ValueError('Range frame proof incomplete')
        for relative,digest in interval['metadataFiles'].items():
            if sha(contained(root,relative))!=digest:
                raise ValueError('Range metadata artifact changed')
        for record in interval['frames']:
            if record['frame']!=len(output) or sha(contained(root,record['path']))!=record['fileSha256']:
                raise ValueError('Range frame changed or is out of order')
            output.append(record)
    if len(output)>identity['facts']['authoredFrames']:
        raise ValueError('Ranges exceed original timeline')
    return output,metadata


def render_intervals(root, ledger, identity, *, java, classpath, decoded, deadline,
                     interval_frames=16, range_timeout=180):
    if not 1<=interval_frames<=32 or not 30<=range_timeout<=180:
        raise ValueError('Explicit bounded interval and renderer timeout required')
    root = Path(root)
    frames,metadata = verified_frames(root,ledger,identity)
    count = identity['facts']['authoredFrames']
    while len(frames)<count and deadline-time.monotonic()>range_timeout+25:
        start,end = len(frames),min(count,len(frames)+interval_frames)
        folder = root/'attempts'/f'{start:04d}-{end:04d}-{uuid.uuid4().hex}'
        command = [java,'-Djava.awt.headless=true','-Xmx1024m','-cp',classpath,
            'StaticSwfRenderRange',decoded,str(identity['facts']['symbolId']),folder,str(start),str(end)]
        result = run_bounded(command,log=root/'logs'/f'{start:04d}-{end:04d}.log',seconds=range_timeout)
        if result:
            raise RuntimeError('Range renderer exited without a complete proof; preserve attempt for review')
        record = inspect_range(root,folder,start,end,identity['facts'])
        if metadata is not None and record['metadata']!=metadata:
            raise ValueError('Source coordinate plane changed between ranges')
        ledger['ranges'].append(record)
        write_json_atomic(root/'range-ledger.json',ledger)
        frames.extend(record['frames']);metadata=record['metadata']
        print(json.dumps({'state':'range-verified','start':start,'endExclusive':end,'total':count}),flush=True)
    return frames,metadata


def pack_intervals(root, folder, ledger, identity, deadline):
    root,folder = Path(root),Path(folder)
    frames,metadata = verified_frames(root,ledger,identity)
    if len(frames)!=identity['facts']['authoredFrames']:
        return None
    folder.mkdir(parents=True,exist_ok=True)
    size = canvas_size(metadata)
    packed = ledger.setdefault('packed',{})
    # Existing compressed bytes were independently decoded before the receipt
    # was written. Byte hashes pin those exact lossless artifacts across runs.
    for rgba,item in packed.items():
        path = contained(folder,item['file'])
        if sha(path)!=item['fileSha256'] or item['rgbaSha256']!=rgba or item['size']!=size:
            raise ValueError('Resumed compressed frame artifact changed')
    for record in frames:
        rgba = record['rgbaSha256']
        if rgba in packed:
            continue
        if deadline-time.monotonic()<45:
            return None
        with Image.open(contained(root,record['path'])) as source:
            image=source.convert('RGBA')
        if list(image.size)!=size or hashlib.sha256(image.tobytes()).hexdigest()!=rgba:
            raise ValueError('Original rendered range RGBA changed before packing')
        name='frame-'+hashlib.sha256(struct.pack('<II',*size)+image.tobytes()).hexdigest()[:24]+'.webp'
        target=folder/name
        if target.exists():
            # Only an interrupted, unreceipted write can exist here; validate it
            # against the original render rather than silently overwriting it.
            with Image.open(target) as stored:
                if stored.size!=tuple(size) or hashlib.sha256(stored.convert('RGBA').tobytes()).hexdigest()!=rgba:
                    raise ValueError('Unreceipted frame is damaged; explicit review required')
        else:
            temporary=folder/(name+'.'+uuid.uuid4().hex+'.pending')
            image.save(temporary,format='WEBP',lossless=True,exact=True,method=4)
            with Image.open(temporary) as stored:
                if stored.size!=tuple(size) or hashlib.sha256(stored.convert('RGBA').tobytes()).hexdigest()!=rgba:
                    raise ValueError('Lossless range frame pixels changed')
            temporary.replace(target)
        image.close()
        packed[rgba]={'file':name,'fileSha256':sha(target),'rgbaSha256':rgba,'size':size}
        write_json_atomic(root/'range-ledger.json',ledger)
    unique=list(dict.fromkeys(record['rgbaSha256'] for record in frames))
    # Reject unrelated or stale packed receipts, including impossible orphan frames.
    if set(packed)!=set(unique):
        raise ValueError('Compressed frame receipts do not match rendered timeline')
    indices={rgba:index for index,rgba in enumerate(unique)}
    files=[packed[rgba]['file'] for rgba in unique]
    hashes=[record['rgbaSha256'] for record in frames]
    visible=False
    for rgba in unique:
        with Image.open(folder/packed[rgba]['file']) as image:
            visible|=image.convert('RGBA').getbbox() is not None
    if not visible:
        raise ValueError('All source frames are transparent; independent nonvisual review required')
    proof={'nativeFrames':len(frames),'uniqueFrames':len(files),'nativeCanvasSize':size,
        'allFramesPixelExact':True,'originalCoordinatesPreserved':True,'sourcePixelScale':1,
        'frameRgbaSha256':hashes,'encoding':'lossless-webp',
        'scope':'Every complete source frame from bounded static-render intervals serialized without '
            'trimming, resizing or timeline changes. Source extraction only; production runtime adapter required.'}
    left,top=[value/20 for value in metadata['rectTwips'][:2]]
    data={'version':1,'state':'source-frames-complete-runtime-adapter-pending','rendererSource':metadata,
        'fps':metadata['fps'],'frameFiles':files,'timeline':[indices[h] for h in hashes],
        'frameSize':size,'sourceBounds':metadata['rectTwips'],'origin':[-left/size[0],-top/size[1]],
        'sourcePixelScale':1,'validation':proof}
    write_json_atomic(folder/'manifest.json',data)
    return data,proof
