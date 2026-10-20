"""Copy only selected original loading artwork, preserving every source byte."""
from pathlib import Path
import argparse,io,json,xml.etree.ElementTree as ET
from PIL import Image
from original_archive import OriginalArchive
ROOT=Path(__file__).resolve().parents[1]
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--ids',required=True);args=ap.parse_args();ids=args.ids.split(',')
 if not 1<=len(ids)<=3 or len(set(ids))!=len(ids) or any(not i.isdigit() for i in ids):raise SystemExit('Explicit batch of up to three loading IDs required')
 a=OriginalArchive(args.source)
 if ROOT.is_relative_to(a.root) or a.root.is_relative_to(ROOT):raise SystemExit('Original and project roots must be separate')
 folder=ROOT/'public/assets/loading';folder.mkdir(parents=True,exist_ok=True);rows=[]
 for ident in ids:
  name=f'assets/loading/{ident}.jpg';record=a.record(name);raw=a.raw(name)
  with Image.open(io.BytesIO(raw)) as image:
   if image.format!='JPEG':raise ValueError('Original loading file is not JPEG')
   width,height=image.size
  (folder/f'{ident}.jpg').write_bytes(raw);assert a.record(name)==record
  rows.append({'id':ident,'url':f'/assets/loading/{ident}.jpg','width':width,'height':height,'source':record})
 index_path=folder/'index.json';existing=json.loads(index_path.read_text(encoding='utf-8'))['images'] if index_path.exists() else []
 combined={r['id']:r for r in existing+rows};images=list(combined.values())
 index_path.write_text(json.dumps({'version':1,'images':images,'policy':'original bytes; cyclic artwork in new idle loading UI'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 tips_source='config/LoadingTips.xml';tips=[dict(item.attrib,status='review-only') for item in ET.fromstring(a.data(tips_source)).iter('item')]
 (folder/'source-tips-review.json').write_text(json.dumps({'source':a.record(tips_source),'policy':'Original mechanics not yet implemented are not displayed as idle instructions.','tips':tips},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 report={'availableOriginalArtworks':sum(p.startswith('assets/loading/') for p in a.rows),'integratedArtworks':len(images),'remainingArtworks':sum(p.startswith('assets/loading/') for p in a.rows)-len(images),'images':rows,'sourceTipsForReview':len(tips),'originalGameplayTipsDisplayed':False,'state':'integrated-awaiting-tests'}
 (ROOT/'reports/loading-art-recovery.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:report[k] for k in ['integratedArtworks','remainingArtworks','sourceTipsForReview']}))
if __name__=='__main__':main()
