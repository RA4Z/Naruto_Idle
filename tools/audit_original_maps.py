"""Metadata-only map coverage, including virtual front PNG references."""
from pathlib import Path
import argparse,collections,json,xml.etree.ElementTree as ET
from original_archive import OriginalArchive
ROOT=Path(__file__).resolve().parents[1]

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);args=ap.parse_args();a=OriginalArchive(args.source)
    ids=sorted({p.split('/')[3] for p in a.rows if p.startswith('assets/scene/map/')});maps=[]
    active={m['id'] for m in json.loads((ROOT/'public/assets/maps/index.json').read_text(encoding='utf-8'))['maps']}
    for ident in ids:
        prefix=f'assets/scene/map/{ident}/';layers={};missing=[]
        for layer in ['bg','mg','fg']:
            path=prefix+f'_scene_{layer}.xml'
            if path not in a.rows:layers[layer]={'state':'configuration-missing'};missing.append(path);continue
            try:
                nodes=list(ET.fromstring(a.data(path)).iter('img'))
            except (OSError,ET.ParseError) as error:
                layers[layer]={'state':'blocked','reason':str(error)};missing.append(path);continue
            urls={n.get('url') for n in nodes}
            virtual=urls-set(a.rows) if layer=='fg' and prefix+'alphaMap.png' in a.rows else set()
            unavailable=urls-set(a.rows)-virtual
            missing.extend(sorted(unavailable))
            layers[layer]={'references':len(nodes),'uniqueResources':len(urls),'formats':dict(collections.Counter(Path(p).suffix for p in urls)),
                           'virtualFrontPngReferences':len(virtual),'missing':sorted(unavailable)}
        maps.append({'id':ident,'state':'integrated' if ident in active else 'discovered-pending-integration',
                     'layers':layers,'navigationAvailable':prefix+'MapInfo.map' in a.rows,
                     'nativeAlphaAvailable':prefix+'alphaMap.png' in a.rows,'missingDependencies':missing,
                     'limits':['Middleground transforms and object depth not yet integrated']})
    r={'mapsDiscovered':len(maps),'mapsIntegrated':len(active),'sourceForegroundRule':'Virtual PNGs are generated from background JPEG tile rectangles and alphaMap, as observed in MapTile.as.',
       'packageFormat':'_scene_*.cfg/.bin samples are AMF3 metadata, not embedded PNG packs; XML metadata is available.',
       'maps':maps}
    (ROOT/'reports/original-map-audit.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'mapsDiscovered':len(maps),'mapsIntegrated':len(active),'mapsWithMissingDependencies':sum(bool(m['missingDependencies']) for m in maps)}))
if __name__=='__main__':main()
