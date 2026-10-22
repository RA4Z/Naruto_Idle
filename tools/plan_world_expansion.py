"""Metadata-only curation. Safe scenario exploration does not imply story completion."""
from pathlib import Path
import argparse, collections, json, xml.etree.ElementTree as ET
from original_archive import OriginalArchive
from prepare_world import native_navigation

ROOT=Path(__file__).resolve().parents[1]

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);args=p.parse_args()
    archive=OriginalArchive(args.source)
    scenes=[{c.tag:c.text for c in n} for n in ET.fromstring(archive.data('config/world/SceneCFG.xml')).findall('row')]
    ids=sorted({path.split('/')[3] for path in archive.rows if path.startswith('assets/scene/map/')})
    existing={m['id'] for m in json.loads((ROOT/'public/assets/maps/index.json').read_text(encoding='utf-8'))['maps']}
    specs_path=ROOT/'tools/world-expansion-specs.json'
    specs=json.loads(specs_path.read_text(encoding='utf-8')) if specs_path.exists() else {};preflight=[]
    for ident in ids:
        associated=[s for s in scenes if s.get('mapId')==ident]
        world=[s for s in associated if s.get('type')=='1' and s.get('name')]
        collection='world' if world else 'scenario' if associated else 'unidentified'
        if world:
            name=world[0]['name'];kind='lobby';enemies=[]
            # Only established non-narrative enemy families in suitable terrain.
            if any(w in name.lower() for w in ('floresta','caverna','penhasco','árvores mortas')):
                kind='adventure';enemies=['19000301','19000701']
            elif any(w in name.lower() for w in ('samurai','campo de neve','país do ferro')):
                kind='adventure';enemies=['19002301']
            description=('Explore a área original recuperada. Encontros adaptados para o idle.' if enemies else 'Área original recuperada para exploração segura. Sem encontros de missão configurados.')
        else:
            name=('Cenário' if associated else 'Cenário não identificado')+' '+ident
            kind='exploration';enemies=[]
            labels=list(dict.fromkeys(s['name'] for s in associated if s.get('name')))
            description='Exploração do cenário original; a missão original não é executada aqui.'
            if labels:description+=' Referências: '+'; '.join(labels[:3])+('.' if len(labels)<=3 else '; outras registradas no manifesto.')
            if not associated:description='Cenário original sem nome/contexto confirmado. Exploração segura, sem recompensas ou missão inventada.'
        nav=native_navigation(archive.data(f'assets/scene/map/{ident}/MapInfo.map'))
        blocked=[]
        if len(nav['cells'])<50:blocked.append('walkable-component-too-small')
        if nav['sourceWidth']*nav['sourceHeight']>16000000 or max(nav['sourceWidth'],nav['sourceHeight'])>8192:blocked.append('raster-budget')
        row={'id':ident,'collection':collection,'alreadyIntegrated':ident in existing,'walkableCells':len(nav['cells']),'dimensions':[nav['sourceWidth'],nav['sourceHeight']],'blocked':blocked}
        preflight.append(row)
        if ident not in existing and not blocked:
            specs.setdefault(ident,{'name':name,'kind':kind,'enemies':enemies,'description':description,'collection':collection,'sourceScenes':associated})
    (ROOT/'tools/world-expansion-specs.json').write_text(json.dumps(specs,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    report={'policy':'metadata only; selected version from delivered inventory; scenarios are not implemented campaigns','sourceKind':'exported-inventory' if archive.delivery else 'original-cdn','discovered':len(ids),'alreadyIntegrated':len(existing),'planned':len(specs),'pending':sum(i not in existing for i in specs),'collections':dict(collections.Counter(x['collection'] for x in preflight)),'maps':preflight}
    (ROOT/'reports/world-delivery-preflight.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='maps'}))

if __name__=='__main__':main()
