"""Reproduce MapTile alpha compositing with source masks, never authored ground cutouts.
One map at a time. Preserves background, navigation, IDs and all original inputs.
"""
from pathlib import Path
import argparse, json, hashlib, io, shutil, xml.etree.ElementTree as ET
from PIL import Image
from original_archive import OriginalArchive

PROJECT = Path(__file__).resolve().parents[1]

def compose_foreground(background_tiles, front_tiles, alpha, size, read_image):
    result = Image.new('RGBA', size)
    mask = Image.new('L', size)
    mask.paste(alpha.convert('RGBA').getchannel('A'), (0, 0))
    lookup = {(int(t['imgX']), int(t['imgY'])): t for t in background_tiles}
    for front in front_tiles:
        col, row = int(front['imgX']), int(front['imgY'])
        tile = lookup[col, row]
        ox, oy = int(front['offsetX']), int(front['offsetY'])
        width, height = int(front['width']), int(front['height'])
        if not 0 <= ox < 256 or not 0 <= oy < 256 or ox+width > 256 or oy+height > 256:
            raise ValueError('Front rectangle outside original tile')
        x, y = col*256+ox, row*256+oy
        with read_image(tile['url']) as source:
            piece = source.convert('RGBA').crop((ox, oy, ox+width, oy+height))
        piece.putalpha(mask.crop((x, y, x+width, y+height)))
        result.alpha_composite(piece, (x, y))
    return result

def recover(archive, ident, project):
    folder = project / 'public/assets/maps' / ident
    manifest = json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
    prefix = f'assets/scene/map/{ident}/'
    bg_path, fg_path, alpha_path = [prefix + p for p in ['_scene_bg.xml','_scene_fg.xml','alphaMap.png']]
    bg = [n.attrib for n in ET.fromstring(archive.data(bg_path)).iter('img')]
    fg = [n.attrib for n in ET.fromstring(archive.data(fg_path)).iter('img')]
    sources = [bg_path,fg_path,alpha_path]+sorted({n['url'] for n in bg if any(n['imgX']==f['imgX'] and n['imgY']==f['imgY'] for f in fg)})
    before = [archive.record(p) for p in sources]
    with Image.open(project/'public'/manifest['background'].lstrip('/')) as background:
        size = background.size
    with Image.open(io.BytesIO(archive.raw(alpha_path))) as alpha:
        image = compose_foreground(bg,fg,alpha,size,lambda name: Image.open(io.BytesIO(archive.raw(name))))
    empty_native_layer = not fg and alpha.convert('RGBA').getchannel('A').getbbox() is None
    if image.getbbox() is None and not empty_native_layer:
        raise ValueError('Unexpected empty foreground despite native rectangles')
    backup = project/'assets-extraidos/mapas/before-native-alpha'/ident
    backup.mkdir(parents=True,exist_ok=True)
    for name in ['foreground.png','manifest.json']:
        if not (backup/name).exists(): shutil.copy2(folder/name,backup/name)
    image.save(folder/'foreground.png',compress_level=6)
    image.save(folder/'foreground.webp',format='WEBP',lossless=True,exact=True,method=4)
    with Image.open(folder/'foreground.webp') as optimized:
        assert optimized.convert('RGBA').tobytes()==image.tobytes(), 'Lossless foreground mismatch'
    runtime_path=project/'public/assets/catalog/runtime-images.json'
    replacements=json.loads(runtime_path.read_text(encoding='utf-8')) if runtime_path.exists() else {}
    source_url=f'/assets/maps/{ident}/foreground.png'
    replacements[source_url]={'url':f'/assets/maps/{ident}/foreground.webp','sourceSha256':hashlib.sha256((folder/'foreground.png').read_bytes()).hexdigest(),
                              'originalBytes':(folder/'foreground.png').stat().st_size,'bytes':(folder/'foreground.webp').stat().st_size,
                              'width':size[0],'height':size[1],'lossless':True}
    runtime_path.write_text(json.dumps(replacements,indent=2)+'\n',encoding='utf-8')
    histogram = image.getchannel('A').histogram()
    info = {'method':'native-alpha-map-and-original-tile-rectangles-v1',
            'foregroundRects':len(fg),'opaqueGroundCutouts':False,'emptyNativeLayer':empty_native_layer,
            'alphaLevels':[i for i,n in enumerate(histogram) if n],
            'nontransparentPixels':sum(histogram[1:]),'dimensions':list(size),
            'sha256':hashlib.sha256((folder/'foreground.png').read_bytes()).hexdigest(),
            'reference':'map/images/MapTile.as processImageRender: BitmapData.copyPixels with alphaBitmapData',
            'limits':['Native global translucent front layer; not per-object Y sorting.',
                      'Middleground SWF objects require a separate conversion.']}
    info['optimizedRuntime']=replacements[source_url]
    alpha_bytes=archive.raw(alpha_path)
    (folder/'native-alpha.png').write_bytes(alpha_bytes)
    with Image.open(io.BytesIO(alpha_bytes)) as native_alpha:
        alpha_size=native_alpha.size
    manifest['nativeAlpha']={'url':f'/assets/maps/{ident}/native-alpha.png','width':alpha_size[0],'height':alpha_size[1],
                             'sha256':hashlib.sha256(alpha_bytes).hexdigest()}
    manifest['layers']['foregroundTiles']=len(fg)
    manifest['layers']['nativeForeground'] = info
    (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    assert before == [archive.record(p) for p in sources], 'Original source changed'
    return {'id':ident,'state':'integrated-awaiting-browser-validation','foreground':info,'sources':before,
            'virtualPngReferences':len(fg),'missingForegroundDependencies':[]}, manifest

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--source',required=True);ap.add_argument('--ids',required=True);ap.add_argument('--limit',type=int,default=4)
    args=ap.parse_args();ids=args.ids.split(',')
    if not 1<=len(ids)<=args.limit<=4 or any(not i.isdigit() for i in ids): raise SystemExit('Explicit batch of 1..4 map IDs required')
    archive=OriginalArchive(args.source)
    if PROJECT.is_relative_to(archive.root) or archive.root.is_relative_to(PROJECT): raise SystemExit('Original and project roots must be separate')
    index_path=PROJECT/'public/assets/maps/index.json';index=json.loads(index_path.read_text(encoding='utf-8'));by_id={m['id']:m for m in index['maps']};results=[]
    for ident in ids:
        row,manifest=recover(archive,ident,PROJECT);results.append(row);by_id[ident]=manifest
        print(ident, row['foreground']['alphaLevels'],row['foreground']['nontransparentPixels'],flush=True)
    index['maps']=[by_id[m['id']] for m in index['maps']]
    index_path.write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    report={'policy':'one map at a time; original masks only; source hashes preserved','maps':results}
    (PROJECT/'reports/native-foreground-recovery.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__': main()
