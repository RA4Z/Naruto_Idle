"""Dimensions, signatures, hashes and source IDs for extracted media, without guessing animations."""
import concurrent.futures,hashlib,io,json,re
from pathlib import Path
from collections import defaultdict
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent;BASE=ROOT/'assets-extraidos/manifestos';rows={}
for line in (BASE/'library-extraction.jsonl').read_text(encoding='utf8').splitlines():
 try:r=json.loads(line);rows[r['source']]=r
 except ValueError:pass
items=[]
for r in rows.values():
 for out in r.get('outputs',[]):
  if Path(out).suffix.lower() in ('.png','.jpg','.jpeg','.bmp','.gif','.mp3'):items.append((r,out))
def inspect(item):
 r,out=item;path=ROOT/out;internal=re.search(r'(?:bitmap|sound)-(\d+)',path.name);entry={'source':r['source'],'source_sha256':r.get('sha256'),'original_path':r['original_path'],'output':out,'category':r['category'],'internal_id':internal.group(1) if internal else None,'source_timeline_fps':r.get('fps'),'animation':None,'direction':None,'origin':None,'duration':None,'character':None,'status':'standalone-media' if internal else 'ready-original'}
 try:
  data=path.read_bytes();entry['sha256']=hashlib.sha256(data).hexdigest();entry['bytes']=len(data)
  if data[:3] in (b'FWS',b'CWS',b'ZWS'):entry.update(format='SWF-container',status='requires-renderer')
  elif path.suffix.lower()!='.mp3':
   with Image.open(io.BytesIO(data)) as im:entry.update(dimensions=list(im.size),format=im.format,alpha_channel=im.mode in ('RGBA','LA') or 'transparency' in im.info)
  else:entry['format']='MP3'
 except Exception as exc:entry.update(status='blocked',error=str(exc))
 return entry
duplicates=defaultdict(list);count=0;blocked=0
with (BASE/'media.jsonl').open('w',encoding='utf8') as output,concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 for entry in pool.map(inspect,items):
  output.write(json.dumps(entry,ensure_ascii=False)+'\n');count+=1;blocked+=entry['status']=='blocked'
  if entry.get('sha256'):duplicates[entry['sha256']].append(entry['output'])
  if count%10000==0:print(json.dumps({'catalogued':count,'total':len(items)}),flush=True)
groups=[{'sha256':h,'outputs':paths} for h,paths in duplicates.items() if len(paths)>1]
(BASE/'media-duplicates.json').write_text(json.dumps(groups,ensure_ascii=False),encoding='utf8');summary={'catalogued_media':count,'blocked_media':blocked,'duplicate_groups':len(groups),'scope':'Internal bitmap animation, direction and origin remain null unless supplied by a separate reconstructed animation manifest. Original action XML and binary metadata are preserved.'};(ROOT/'reports/media-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf8');print(json.dumps(summary))
