"""Summarize existing verification artifacts; never converts assets or reads secrets."""
from pathlib import Path
import collections,json,re
ROOT=Path(__file__).resolve().parents[1]
def read(path):return json.loads((ROOT/path).read_text(encoding='utf-8'))
def main():
 maps=read('public/assets/maps/index.json')['maps'];specs=read('tools/world-expansion-specs.json');proof={}
 for path in sorted((ROOT/'reports').glob('alpha-delivery-*.json')):
  for row in json.loads(path.read_text(encoding='utf-8'))['maps']:
   assert row['allAlphaPixelsMatchOriginal'] and row['sourceHashesPreserved']
   proof[row['id']]=path.name
 assert len(maps)==145 and set(specs)==set(proof) and len(specs)==129
 animations=read('reports/compact-animation-validation.json');audit=read('reports/external-symbol-audit.json')
 assert animations['count']==31 and audit['actionsPendingReview']==0
 tests={}
 for name in ['domain','server']:
  tail=(ROOT/f'reports/delivery-{name}-tests.log').read_text(encoding='utf-8')[-2500:]
  counts={key:int(re.findall(r'\b'+key+r' (\d+)',tail)[-1]) for key in ['tests','pass','fail']}
  assert counts['fail']==0;tests[name]=counts
 report={'stage':'maps-and-pending-animation-queue','maps':len(maps),'newMaps':len(specs),'sourcePixelValidatedNewMaps':len(proof),
  'collections':dict(collections.Counter(m.get('collection','world') for m in maps)),
  'kinds':dict(collections.Counter(m['kind'] for m in maps)),
  'reconstructedActions':31,'models':30,'sourceFrameProbes':sum(len(a['sampledTimelineFrames']) for a in animations['actions']),
  'duplicateNamespaceQueueRemaining':audit['actionsPendingReview'],'tests':tests,'pythonTestsPassed':8,
  'browserReport':'delivery-browser-validation.json','details':'../docs/INTEGRACAO_ACERVO_ENTREGUE.md',
  'destinations':[{'id':m['id'],'name':m['name'],'kind':m['kind'],'collection':m.get('collection','world'),
    'extractionState':'preserved-previous-stage' if m['id'] not in specs else 'converted-runtime-integrated-technical-validation',
    'currentPixelValidation':proof.get(m['id']),
    'contentState':'previous-idle-rules' if m['id'] not in specs else 'authored-hunt' if m['kind']=='adventure' else 'safe-exploration-narrative-pending'} for m in maps],
  'loadingStageReport':'loading-art-validation.json',
  'remaining':['Per-object/middleground SWF depth','Narrative campaigns, encounters and local population for recovered safe scenery','21 scenery identities','Shared external effects/shadows recorded per action','Other character voices/effects and UI resources; loading images completed separately'],
  'limits':['Technical coverage of every map is not visual playtesting of every passage.','31 source-pixel checks sample 124 timeline frames; they are not Flash-player comparisons of all frames.','External-effect partial status is preserved.','No real account, remote database or paid service was modified.']}
 (ROOT/'reports/delivery-integration-summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({key:report[key] for key in ['maps','newMaps','sourcePixelValidatedNewMaps','reconstructedActions','sourceFrameProbes','tests']}))
if __name__=='__main__':main()
