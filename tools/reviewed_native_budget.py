"""Explicit offline-only canvas review; runtime atlas/sequence budgets stay unchanged."""
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile
from PIL import Image
from static_effect_export_contract import static_effect_export_facts
from swf_bytes import decode


def probe_original_bounds(archive, job, *, java, ffdec, classes, work, project):
    if not all((java,ffdec,classes,work)):
        raise ValueError('Reviewed native canvases require --java, --ffdec, --bounds-classes and --budget-work')
    work=Path(work).resolve()
    if work.is_relative_to(archive.root) or work.is_relative_to(Path(project).resolve()):
        raise ValueError('Private metadata work must stay outside original archive and Git checkout')
    work.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(dir=work,prefix='source-bounds-') as temporary:
        folder=Path(temporary).resolve()
        assert folder.is_relative_to(work),'Temporary cleanup target escapes intended work root'
        source=folder/'source.swf';source.write_bytes(decode(archive.raw(job['resource'])))
        command=[str(java),'-Xmx512m','-cp',str(Path(classes).resolve())+os.pathsep+str(Path(ffdec).resolve()/'lib/*'),
            'ProbeSourceBounds',str(source),str(job['symbolId'])]
        result=subprocess.run(command,capture_output=True,timeout=30,check=True)
        probe=json.loads(result.stdout)
    if probe.get('sourceExecution') is not False or probe.get('rasterRendered') is not False or len(probe.get('rows',[]))!=1:
        raise ValueError('Independent original bounds metadata missing')
    return probe['rows'][0]


def reviewed_limit(archive,entry,probe):
    review=entry.get('offlineRenderBudget',{})
    limit=review.get('maximumNativePixels')
    if (archive is None or entry.get('sourceKind')!='battle-effect-exported-sprite'
            or entry.get('sourceOnly') is not True or type(limit) is not int
            or not 16_000_000<limit<=32_000_000
            or review.get('maximumRuntimePagePixels')!=16_000_000
            or review.get('maximumRuntimeAtlasPixels')!=64_000_000
            or review.get('scope')!='offline-native-render-and-proof-only'):
        raise ValueError('Explicit bounded offline review required; runtime budgets cannot grow')
    fact=entry['sourceExport']
    job={'key':entry['id'],'resource':entry['source']['path'],'action':entry['definition']['frontAction'],
        'source':entry['source'],'sourceKind':entry['sourceKind'],'symbolId':fact['symbolId'],
        'authoredFrames':fact['authoredFrames'],'rootFps':fact['fps']}
    original=static_effect_export_facts(archive,job)
    if original!=fact or entry['sourceConfig']!=entry['source']:
        raise ValueError('Reviewed source export facts changed')
    bounds=probe(job)
    if (bounds!=review.get('independentBounds') or bounds['symbolId']!=fact['symbolId']
            or bounds['frames']!=fact['authoredFrames'] or bounds['fps']!=fact['fps']
            or bounds['rasterRendered'] is not False or bounds['pixels']>limit
            or max(bounds['width'],bounds['height'])>8192):
        raise ValueError('Fresh independent original bounds differ from reviewed budget')
    if len(entry.get('layers',[]))!=1 or entry['layers'][0].get('sourceSequence'):
        raise ValueError('Reviewed recovery supports existing bounded atlases only')
    layer=entry['layers'][0];animation=layer.get('animation',{});proof=layer['validation']
    if (animation.get('sourceBounds')!=bounds['rectTwips'] or animation.get('fps')!=fact['fps']
            or layer.get('action')!=fact['exportName'] or layer.get('namedInstances')!=fact['namedInstances']
            or proof.get('nativeFrames')!=fact['authoredFrames']):
        raise ValueError('Reviewed atlas changed original timing, points or coordinate plane')
    x0,y0,x1,y1=bounds['rectTwips']
    if list(proof['nativeCanvasSize'])!=[math.floor((x1-x0)/20)+1,math.floor((y1-y0)/20)+1]:
        raise ValueError('Reviewed native raster allocation differs from original')
    pixels,pages=proof.get('atlasPixels'),proof.get('atlasPages')
    if (type(pixels) is not int or not 0<pixels<=64_000_000 or type(pages) is not int
            or not 1<=pages<=16 or pages!=len(animation.get('atlasPageUrls',[animation.get('url')]))):
        raise ValueError('Existing runtime atlas limits must be preserved')
    return limit


def preflight_atlas(root,ledger,identity,verified_frames,*,page_pixels=16_000_000,atlas_pixels=64_000_000):
    """Bound cropped unique RGBA storage before calling the existing atlas packer."""
    if not (0<page_pixels<=16_000_000 and 0<atlas_pixels<=64_000_000):
        raise ValueError('Preflight cannot increase runtime texture ceilings')
    frames,metadata=verified_frames(root,ledger,identity)
    if len(frames)!=identity['facts']['authoredFrames']:
        raise ValueError('Incomplete reviewed native timeline')
    left,top=[value/20 for value in metadata['rectTwips'][:2]]
    signatures=set();pixels=0;visible=False
    for record in frames:
        path=Path(root)/record['path']
        with Image.open(path) as source:image=source.convert('RGBA')
        if hashlib.sha256(image.tobytes()).hexdigest()!=record['rgbaSha256']:
            raise ValueError('Reviewed native pixels changed before atlas preflight')
        box=image.getbbox()
        if box:
            crop=image.crop(box);position=(left+box[0],top+box[1]);visible=True
        else:
            crop=Image.new('RGBA',(1,1));position=(0.,0.)
        if max(crop.size)>8190 or crop.width*crop.height>page_pixels:
            raise ValueError('Reviewed crop still requires a tiled runtime adapter')
        key=(crop.size,hashlib.sha256(crop.tobytes()).digest(),position)
        if key not in signatures:
            signatures.add(key);pixels+=crop.width*crop.height
            if pixels>atlas_pixels:
                raise ValueError('Reviewed crops exceed existing64MP atlas ceiling; preserve native frames')
        crop.close();image.close()
    if not visible:
        raise ValueError('Reviewed source is nonvisual; independent review required')
    return {'uniqueCrops':len(signatures),'uniqueCropPixels':pixels,
        'maximumRuntimePagePixels':page_pixels,'maximumRuntimeAtlasPixels':atlas_pixels}
