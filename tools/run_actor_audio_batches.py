"""Recover native attack/death audio in at most six sequential four-model batches."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
from original_archive import OriginalArchive
from recover_entity_audio import recover
ROOT = Path(__file__).resolve().parents[1]


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',required=True)
    parser.add_argument('--max-batches',type=int,default=1);args=parser.parse_args()
    if not 1<=args.max_batches<=6:raise SystemExit('At most six serial batches per cycle')
    archive=OriginalArchive(args.source)
    catalog=json.loads((ROOT/'public/assets/catalog/entities.json').read_bytes())['entities']
    eligible=[]
    for row in catalog:
        ident=row['id']
        if not re.fullmatch(r'[0-9]{8}',ident) or f'assets/battle/role/left/{ident}.swf' not in archive.rows:continue
        manifest=json.loads((ROOT/'public'/row['manifestUrl'].lstrip('/')).read_bytes())
        actions=manifest.get('modes',{}).get('battle',{}).get('animations',{})
        if 'A_1hit' in actions and 'C_dead' in actions:eligible.append(ident)
    path=ROOT/'reports/actor-audio-delivery.json'
    report=json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'failedModels':{}}
    known=json.loads((ROOT/'public/assets/presentation.json').read_bytes()).get('entityAudio',{})
    priority=['11000701','11000801','11000901','11001401','11001501','11001201','11001301','11000101','11000211','11000301']
    pending=sorted((i for i in eligible if i not in known and i not in report['failedModels']),key=lambda i:(priority.index(i) if i in priority else 99,i))
    for start in range(0,min(len(pending),args.max_batches*4),4):
        ids=pending[start:start+4]
        # Each model publishes only after all its native resources are checked.
        # Isolated failures keep the dependency visible without aborting the cycle.
        for ident in ids:
            try:recover(args.source,[ident],archive=archive)
            except (KeyError,ValueError,OSError,StopIteration) as error:
                report['failedModels'][ident]={'reason':type(error).__name__+': '+str(error),'state':'blocked-not-substituted'}
        subprocess.run(['node','--experimental-transform-types','--import','./tools/resolve-test-imports.mjs','tools/validate_actor_audio.mjs'],cwd=ROOT,check=True)
        known=json.loads((ROOT/'public/assets/presentation.json').read_bytes()).get('entityAudio',{})
        report.update(eligibleModels=len(eligible),integratedModels=len(set(eligible)&set(known)),
                      remainingModels=len(set(eligible)-set(known)-set(report['failedModels'])),
                      scope='Native attack/death events only for models with both runtime animations. Partial missing packages are recorded per actor; no jutsu rules or reserved availability changed.',workers=1)
        path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'batchChecked':ids,'remaining':report['remainingModels'],'blocked':len(report['failedModels'])}),flush=True)
    known=json.loads((ROOT/'public/assets/presentation.json').read_bytes()).get('entityAudio',{})
    report.update(eligibleModels=len(eligible),integratedModels=len(set(eligible)&set(known)),
                  remainingModels=len(set(eligible)-set(known)-set(report['failedModels'])),workers=1,
                  scope='Native attack/death events only for models with both runtime animations. Missing packages stay explicit; no other actions, jutsu rules or reserved availability changed.')
    validation_path=ROOT/'reports/actor-audio-validation.json'
    if validation_path.exists():
        validation=json.loads(validation_path.read_text(encoding='utf-8'))
        report.update(partialModels=sum(r['unresolvedEvents']>0 for r in validation['results']),
                      unresolvedEvents=validation['unresolvedEvents'],silentEvents=validation.get('silentEvents',0))
    report['state']='eligible-models-processed-with-explicit-dependencies' if report['remainingModels']==0 else 'partial'
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report.get(k) for k in ('eligibleModels','integratedModels','remainingModels')}),flush=True)


if __name__=='__main__':main()
