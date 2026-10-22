"""Sequential metadata-only audit. No bitmap decode or bulk regeneration."""
from pathlib import Path
import json,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
def main():
 catalog=json.loads((ROOT/'public/assets/catalog/entities.json').read_text(encoding='utf-8'));rows=[];scanned=0
 for entry in catalog['entities']:
  manifest_path=ROOT/'public'/entry['manifestUrl'].lstrip('/');m=json.loads(manifest_path.read_text(encoding='utf-8'))
  for mode,data in m.get('modes',{}).items():
   xml=manifest_path.parent/mode/'actions.xml'
   if not xml.exists():continue
   scanned+=1
   try:root=ET.parse(xml).getroot()
   except ET.ParseError:continue
   assets={a.get('id') for a in root.findall('asset')}
   for action in root.findall('action'):
    name=action.get('name');prepared=data.get('animations',{}).get(name)
    if not prepared or prepared.get('rendererRevision') in {'external-symbol-namespace-v1','external-symbol-compact-frame-origin-v2'}:continue
    external=[e.get('extname') for e in action.iter('element') if e.get('extname') and e.get('assetId') in assets]
    if external:rows.append({'id':entry['id'],'name':entry['name'],'mode':mode,'action':name,'external':sorted(set(external))})
 report={'policy':'sequential metadata only; no regeneration','xmlScanned':scanned,'actionsPendingReview':len(rows),'modelsPendingReview':len({r['id'] for r in rows}),'pending':rows}
 (ROOT/'reports/external-symbol-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({k:v for k,v in report.items() if k!='pending'}))
if __name__=='__main__':main()
