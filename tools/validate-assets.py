import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
assets=json.loads((ROOT/'public/assets/manifest.json').read_text(encoding='utf8'));animations=json.loads((ROOT/'public/assets/animations.json').read_text(encoding='utf8'));missing=[];count=0
for asset in assets:
 if asset.get('url'):
  p=ROOT/'public'/asset['url'].lstrip('/');count+=1
  if not p.is_file():missing.append(str(p))
for name,data in animations.items():
 for action,config in data.get('animations',{}).items():
  p=ROOT/'public'/config['url'].lstrip('/');count+=1
  if not p.is_file():missing.append(str(p))
result={'referenced_files':count,'missing':missing};(ROOT/'reports/asset-validation.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result));assert not missing
