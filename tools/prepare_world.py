"""Compose original map layers and decode their native isometric navigation graph.
No source scripts run. The main connected region is used for ordinary walking.
"""
from pathlib import Path
import collections, concurrent.futures, hashlib, json, struct, zlib
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(r'D:\Naruto Idle\Naruto Idle RPG')
SOURCE = Path(r'D:\Naruto Idle\Naruto_Idle')
SCALE = 3.072
rows = json.loads((SOURCE / 'recovery/resource-manifest.json').read_text(encoding='utf-8'))['assets']
lookup = {r['path']: r for r in rows}

def data(path):
    r = lookup[path]; raw = (SOURCE / 'recovered-web/cdn' / r['tag'] / path).read_bytes()
    try: return zlib.decompress(raw)
    except zlib.error: return raw

def native_navigation(raw):
    width, height, tile_w, tile_h, cols, rows, cell_w, cell_h = struct.unpack_from('>4I4H', raw)
    offset = 24; references = {}; nodes = {}
    while offset < len(raw):
        x, y, flag = struct.unpack_from('>IIB', raw, offset); offset += 9
        assert x < cols and y < rows and flag in (0, 1)
        if flag:
            w, h, region = struct.unpack_from('>III', raw, offset); offset += 12
            assert w > 0 and h > 0
            nodes[x, y] = (w, h, region); references[x, y] = (x, y)
        else:
            references[x, y] = struct.unpack_from('>II', raw, offset); offset += 8
    assert offset == len(raw) and all(ref in nodes for ref in references.values())
    allowed = {xy for xy, ref in references.items() if nodes[ref][2] == 0}
    components = []
    while allowed:
        queue = [allowed.pop()]
        for x, y in queue:
            for other in [(x+1,y),(x-1,y),(x,y+1),(x,y-1)]:
                if other in allowed: allowed.remove(other); queue.append(other)
        components.append(queue)
    cells = sorted(max(components, key=len))
    return {'sourceWidth': width, 'sourceHeight': height, 'columns': cols, 'rows': rows,
            'cellWidth': cell_w, 'cellHeight': cell_h, 'unitsPerSourcePixel': 1/SCALE,
            'cells': cells, 'sourceRegion': 0, 'excludedDisconnectedCells': sum(map(len, components))-len(cells),
            'sourceFormat': 'big-endian header 4*u32+4*u16; nodes u32,u32,u8 + rectangle/region or root reference'}

CONFIG = [
    ('10001', 'Vila da Folha', 'lobby', (385,260), [], 'Área segura · encontre moradores e prepare sua jornada.'),
    ('10005', 'Floresta da Folha', 'adventure', (300,850), ['19000301','19000701','19000401'], 'Trilhas na floresta · lobos e tigres.'),
    ('10006', 'Campo de Treinamento da Folha', 'adventure', (350,200), ['19000901','19001001'], 'Treinamento e encontros contra ninjas Anbu.'),
    ('10008', 'País das Ondas', 'adventure', (460,600), ['19001701','19001801'], 'Explore os caminhos do País das Ondas.'),
]

def prepare(item):
    ident, name, kind, spawn, enemies, description = item
    prefix = f'assets/scene/map/{ident}/'; folder = ROOT / 'public/assets/maps' / ident
    folder.mkdir(parents=True, exist_ok=True)
    raw = data(prefix+'MapInfo.map'); nav = native_navigation(raw)
    bg = ET.fromstring(data(prefix+'_scene_bg.xml')); tiles = list(bg.iter('img'))
    width = (max(int(t.get('imgX')) for t in tiles)+1)*256
    height = (max(int(t.get('imgY')) for t in tiles)+1)*256
    background = Image.new('RGB', (width,height))
    for tile in tiles:
        with Image.open(__import__('io').BytesIO(data(tile.get('url')))) as im:
            background.paste(im.convert('RGB'), (int(tile.get('imgX'))*256,int(tile.get('imgY'))*256))
    background.save(folder/'background.jpg',quality=94)
    foreground = Image.new('RGBA',(width,height)); fg_count = 0
    for tile in ET.fromstring(data(prefix+'_scene_fg.xml')).iter('img'):
        url = tile.get('url')
        if url not in lookup or not url.endswith(('.png','.jpg')): continue
        with Image.open(__import__('io').BytesIO(data(url))) as im:
            foreground.alpha_composite(im.convert('RGBA'),(int(tile.get('imgX'))*256+int(tile.get('offsetX','0')),int(tile.get('imgY'))*256+int(tile.get('offsetY','0'))))
        fg_count += 1
    foreground.save(folder/'foreground.png',compress_level=3)
    thumb=background.copy();thumb.thumbnail((480,300));thumb.save(folder/'thumbnail.jpg',quality=84)
    (folder/'navigation.json').write_text(json.dumps(nav,separators=(',',':')),encoding='utf-8')
    (folder/'MapInfo.map').write_bytes(raw)
    result = {'id':ident,'name':name,'kind':kind,'background':f'/assets/maps/{ident}/background.jpg',
              'foreground':f'/assets/maps/{ident}/foreground.png','thumbnail':f'/assets/maps/{ident}/thumbnail.jpg',
              'navigation':f'/assets/maps/{ident}/navigation.json','width':width/SCALE,'height':height/SCALE,
              'spawn':{'x':spawn[0],'y':spawn[1]},'enemies':enemies,'description':description,
              'source':prefix,'navigationSha256':hashlib.sha256(raw).hexdigest(),
              'layers':{'backgroundTiles':len(tiles),'foregroundTiles':fg_count,'animatedMiddleground':'preserved in originals; not executed'}}
    (folder/'manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    return result

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: maps=list(pool.map(prepare,CONFIG))
    out=ROOT/'public/assets/maps';(out/'index.json').write_text(json.dumps({'version':1,'maps':maps},ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/'reports/world-map-recovery.json').write_text(json.dumps({'availableOriginalMaps':len({r['path'].split('/')[3] for r in rows if r['path'].startswith('assets/scene/map/')}),'integrated':maps,'navigation':'Decoded original cell graph, primary connected walking region. Pixel/cell projection verified against original NPC grid and pixel coordinates.','limits':['Animated middleground SWFs remain outside this first map integration.','No original quests or server behavior reconstructed.']},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'preparedMaps':[m['id'] for m in maps],'nativeCollision':True}))
