"""Explicit, sequential world batches. Original files are read-only.
Existing map entries remain unchanged unless --refresh is explicitly provided.
"""
from pathlib import Path
import argparse,collections,hashlib,io,json,shutil,struct,zlib
import xml.etree.ElementTree as ET
from PIL import Image
from original_archive import OriginalArchive
from recover_native_foreground import recover

PROJECT=Path(__file__).resolve().parents[1]
SCALE=3.072
SPECS={
 '10001':{'enemies':[],'kind':'lobby','description':'Área segura da Vila da Folha.'},
 '10005':{'enemies':['19000301','19000701','19000401'],'kind':'adventure','description':'Trilhas e feras da floresta.'},
 '10006':{'enemies':['19000901','19001001'],'kind':'adventure','description':'Campo de treinamento ninja.'},
 '10008':{'enemies':['19001701','19001801'],'kind':'adventure','description':'Caminhos no País das Ondas.'},
 '10007':{'enemies':['19001701','19001801'],'kind':'adventure','description':'Patrulhe a Costa Verde e enfrente ninjas da Névoa.'},
 '10009':{'enemies':['19000301','19000701','19000901'],'kind':'adventure','description':'Explore a Floresta da Morte entre feras e ninjas Anbu.'},
 '30008':{'enemies':['19000301','19000701'],'kind':'adventure','description':'Explore as trilhas das profundezas da Floresta da Folha.'},
 '300131':{'enemies':['19000901','19001001'],'kind':'adventure','description':'Patrulhe os caminhos da Ponte Tenchi.'},
 '10010':{'enemies':['19000301','19000701'],'kind':'adventure','description':'Explore as trilhas da Floresta do País do Fogo.'},
 '10011':{'enemies':['19002301','19000901'],'kind':'adventure','description':'Patrulhe as estradas de Tanzaku e encontre samurais.'},
 '10020':{'enemies':['19000101','19000201'],'kind':'adventure','description':'Cruze as dunas do País do Vento entre ninjas da Areia.'},
 '10015':{'enemies':['19000101','19004301'],'kind':'adventure','description':'Explore o Deserto Quente e enfrente unidades da Areia.'},
}

def native_navigation(raw):
    width, height, tile_w, tile_h, cols, rows, cell_w, cell_h = struct.unpack_from('>4I4H', raw)
    offset = 24; references = {}; nodes = {}
    while offset < len(raw):
        x, y, flag = struct.unpack_from('>IIB', raw, offset); offset += 9
        assert x < cols and y < rows and flag in (0, 1)
        if flag:
            w, h, region = struct.unpack_from('>III', raw, offset); offset += 12
            assert 0 <= w < cols and 0 <= h < rows
            nodes[x, y] = (w, h, region); references[x, y] = (x, y)
        else:
            references[x, y] = struct.unpack_from('>II', raw, offset); offset += 8
    assert offset == len(raw) and all(ref in nodes for ref in references.values())
    # Every recorded cell is walkable (MapData.setData). Region IDs are arbitrary.
    # Restrict to the actual source raster before selecting a connected component.
    def in_bounds(xy):
        x,y=xy
        px=(x-y)*cell_w/2+width/2
        py=(x+y+1)*cell_h/2-width/4
        return 0<=px<width and 0<=py<height
    allowed={xy for xy in references if in_bounds(xy)}
    excluded_outside=len(references)-len(allowed)
    components=[]
    while allowed:
        queue=[allowed.pop()]
        for x,y in queue:
            for other in [(x+1,y),(x-1,y),(x,y+1),(x,y-1)]:
                if other in allowed:allowed.remove(other);queue.append(other)
        components.append(queue)
    if not components:raise ValueError('No walkable component inside map bounds')
    cells=sorted(max(components,key=len))
    regions=collections.Counter(nodes[references[xy]][2] for xy in cells)
    return {'sourceWidth':width,'sourceHeight':height,'columns':cols,'rows':rows,
            'cellWidth':cell_w,'cellHeight':cell_h,'unitsPerSourcePixel':1/SCALE,
            'cells':cells,'sourceRegion':regions.most_common(1)[0][0],'sourceRegions':sorted(regions),
            'excludedDisconnectedCells':sum(map(len,components))-len(cells),'excludedOutsideRaster':excluded_outside,
            'sourceFormat':'big-endian 4*u32+4*u16; every recorded cell is walkable; sign/root and region IDs are metadata'}


def scene_name(archive,ident):
    root=ET.fromstring(archive.data('config/world/SceneCFG.xml'))
    rows=[{c.tag:c.text for c in n} for n in root.findall('row')]
    matches=[n for n in rows if n.get('mapId')==ident and n.get('type')=='1' and n.get('name')]
    if not matches: raise ValueError('No confirmed original world scene name: '+ident)
    return matches[0]

def spawn_point(nav):
    points=[((((x-y)*nav['cellWidth'])/2+nav['sourceWidth']/2)/SCALE,
             (((x+y+1)*nav['cellHeight'])/2-nav['sourceWidth']/4)/SCALE) for x,y in nav['cells']]
    target=(nav['sourceWidth']*.5/SCALE,nav['sourceHeight']*.55/SCALE)
    return dict(zip(['x','y'],min(points,key=lambda p:(p[0]-target[0])**2+(p[1]-target[1])**2)))

def prepare(archive,ident):
    prefix=f'assets/scene/map/{ident}/';folder=PROJECT/'public/assets/maps'/ident;folder.mkdir(parents=True,exist_ok=True)
    raw=archive.data(prefix+'MapInfo.map');nav=native_navigation(raw);scene=scene_name(archive,ident)
    if len(nav['cells'])<50:raise ValueError('Walkable component too small for an integrated hunt map')
    tiles=[n.attrib for n in ET.fromstring(archive.data(prefix+'_scene_bg.xml')).iter('img')]
    width,height=nav['sourceWidth'],nav['sourceHeight']
    if not 0<width*height<=16000000 or max(width,height)>8192:raise ValueError('Map raster exceeds bounded batch budget')
    source_names=[prefix+'MapInfo.map',prefix+'_scene_bg.xml','config/world/SceneCFG.xml']+sorted({n['url'] for n in tiles})
    hashes=[archive.record(name) for name in source_names]
    image=Image.new('RGB',(width,height))
    for tile in tiles:
        with Image.open(io.BytesIO(archive.raw(tile['url']))) as block:
            image.paste(block.convert('RGB'),(int(tile['imgX'])*256,int(tile['imgY'])*256))
    image.save(folder/'background.png',compress_level=6)
    image.save(folder/'background.webp',format='WEBP',quality=90,method=4)
    thumb=image.copy();thumb.thumbnail((480,300));thumb.save(folder/'thumbnail.jpg',quality=84)
    Image.new('RGBA',image.size).save(folder/'foreground.png',compress_level=2)
    (folder/'navigation.json').write_text(json.dumps(nav,separators=(',',':'))+'\n',encoding='utf-8')
    intermediate=PROJECT/'assets-extraidos/mapas'/ident;intermediate.mkdir(parents=True,exist_ok=True)
    (intermediate/'MapInfo.map').write_bytes(raw)
    spec=SPECS[ident]
    manifest={'id':ident,'name':scene['name'],'kind':spec['kind'],'background':f'/assets/maps/{ident}/background.png',
              'foreground':f'/assets/maps/{ident}/foreground.png','thumbnail':f'/assets/maps/{ident}/thumbnail.jpg',
              'navigation':f'/assets/maps/{ident}/navigation.json','width':width/SCALE,'height':height/SCALE,
              'spawn':spawn_point(nav),'enemies':spec['enemies'],'description':spec['description'],'source':prefix,
              'sourceScene':scene,'navigationSha256':hashlib.sha256(raw).hexdigest(),
              'populationPolicy':'Six patrolling enemies; authored idle-RPG roster using recovered eligible models, not original encounter rules.',
              'spawnPolicy':'Authored point in the primary native walkable region, nearest the map center.',
              'layers':{'backgroundTiles':len(tiles),'foregroundTiles':0,'animatedMiddleground':'available in originals; pending conversion'}}
    (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    foreground,manifest=recover(archive,ident,PROJECT)
    replacements_path=PROJECT/'public/assets/catalog/runtime-images.json';replacements=json.loads(replacements_path.read_text(encoding='utf-8'))
    replacements[manifest['background']]={'url':f'/assets/maps/{ident}/background.webp','sourceSha256':hashlib.sha256((folder/'background.png').read_bytes()).hexdigest(),
                                         'originalBytes':(folder/'background.png').stat().st_size,'bytes':(folder/'background.webp').stat().st_size,'width':width,'height':height}
    replacements_path.write_text(json.dumps(replacements,indent=2)+'\n',encoding='utf-8')
    assert hashes==[archive.record(name) for name in source_names], 'Original source changed'
    return manifest,{'id':ident,'state':'integrated-awaiting-tests','sourceScene':scene,'sources':hashes,'foreground':foreground,
                     'limits':['Middleground animation pending','No per-object Y sorting','Enemy roster and idle rules are authored, not copied']}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--ids',required=True);ap.add_argument('--limit',type=int,default=4);ap.add_argument('--refresh',action='store_true');args=ap.parse_args()
    ids=args.ids.split(',')
    if not 1<=len(ids)<=args.limit<=4 or len(set(ids))!=len(ids) or any(i not in SPECS for i in ids):raise SystemExit('Use one explicit batch of up to four configured IDs')
    archive=OriginalArchive(args.source)
    if PROJECT.is_relative_to(archive.root) or archive.root.is_relative_to(PROJECT):raise SystemExit('Original and project roots must be separate')
    index_path=PROJECT/'public/assets/maps/index.json';index=json.loads(index_path.read_text(encoding='utf-8'));known={m['id'] for m in index['maps']}
    if not args.refresh and any(i in known for i in ids):raise SystemExit('Map already exists; review changes and use --refresh explicitly')
    backup=PROJECT/'assets-extraidos/mapas/world-batch-before';backup.mkdir(parents=True,exist_ok=True)
    if not (backup/'index.json').exists():shutil.copy2(index_path,backup/'index.json')
    if args.refresh:
        for ident in ids:
            folder=PROJECT/'public/assets/maps'/ident
            if folder.exists():
                stamp=hashlib.sha256((folder/'manifest.json').read_bytes()).hexdigest()[:12]
                snapshot=backup/ident/stamp;snapshot.mkdir(parents=True,exist_ok=True)
                for file in folder.iterdir():
                    if file.is_file() and not file.is_symlink() and not (snapshot/file.name).exists():shutil.copy2(file,snapshot/file.name)
    manifests={};rows=[]
    for ident in ids:
        manifest,row=prepare(archive,ident);manifests[ident]=manifest;rows.append(row);print(json.dumps({'id':ident,'name':manifest['name'],'spawn':manifest['spawn']},ensure_ascii=True),flush=True)
    index['maps']=[manifests.pop(m['id'],m) for m in index['maps']]+list(manifests.values())
    index_path.write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    report={'policy':'one map at a time; explicit IDs; existing entries and original files preserved','maps':rows}
    (PROJECT/('reports/world-expansion-'+('-'.join(ids))+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':main()
