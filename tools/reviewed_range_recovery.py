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
    return {'reviewedRangeClassSha256':sha(Path(classes)/'StaticSwfRenderReviewedRange.class'),
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
    if max(guarded_width,guarded_height)>8192 or guarded_width*guarded_height>32_000_000:
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
            'StaticSwfRenderReviewedRange',decoded,str(identity['facts']['symbolId']),folder,str(start),str(end),str(identity['maximumNativePixels'])]
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
