import json
from pathlib import Path
from collections import Counter,defaultdict
ROOT=Path(__file__).resolve().parent.parent;LOG=ROOT/'assets-extraidos/manifestos/library-extraction.jsonl'
rows={}
for line in LOG.read_text(encoding='utf8').splitlines():
 try:r=json.loads(line);rows[r['source']]=r
 except ValueError:pass
statuses=Counter(r['status'] for r in rows.values());hashes=defaultdict(list)
for r in rows.values():
 if r.get('sha256'):hashes[r['sha256']].append(r['original_path'])
duplicates=[{'sha256':h,'sources':p} for h,p in hashes.items() if len(p)>1]
summary={'attempted_originals':len(rows),'status_counts':dict(statuses),'embedded_images':sum(r.get('embedded_images',0) for r in rows.values()),'embedded_mp3':sum(r.get('embedded_sounds',0) for r in rows.values()),'output_files':sum(len(r.get('outputs',[])) for r in rows.values()),'duplicate_groups':len(duplicates),'blocked':[{'source':r['source'],'error':r.get('error'),'warnings':r.get('warnings')} for r in rows.values() if r['status']=='blocked'],'scope':'ready-original means original bytes copied and recognized where applicable, not every data/container format is loadable in Phaser. Partial SWF means some embedded media extracted, not all bitmaps or animations reconstructed.'}
(ROOT/'reports/library-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8');(ROOT/'assets-extraidos/manifestos/duplicates.json').write_text(json.dumps(duplicates,ensure_ascii=False),encoding='utf8');print(json.dumps({k:v for k,v in summary.items() if k!='blocked'}))
