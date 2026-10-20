"""Correct the known SWF-with-BMP-name classification without rereading all pixels."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
path=ROOT/'assets-extraidos/manifestos/media.jsonl';temporary=path.with_suffix('.jsonl.tmp');count=blocked=containers=0
with path.open(encoding='utf8') as source,temporary.open('w',encoding='utf8') as output:
 for line in source:
  row=json.loads(line)
  if row.get('original_path')=='assets/user/userHead.bmp':
   row.update(status='requires-renderer',format='SWF-container');row.pop('error',None)
  blocked+=row.get('status')=='blocked';containers+=row.get('status')=='requires-renderer';count+=1
  output.write(json.dumps(row,ensure_ascii=False)+'\n')
temporary.replace(path)
summary_path=ROOT/'reports/media-summary.json';summary=json.loads(summary_path.read_text(encoding='utf8'));summary.update(catalogued_media=count,blocked_media=blocked,requires_renderer=containers);summary_path.write_text(json.dumps(summary,indent=2),encoding='utf8');print(json.dumps(summary))
