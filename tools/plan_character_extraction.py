"""Plan safe additional clips in both modes; anchors/features remain explicit."""
import argparse,collections,gzip,json
from pathlib import Path

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--project',type=Path,required=True);ap.add_argument('--battle-output',type=Path,required=True)
    ap.add_argument('--world-output',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);args=ap.parse_args()
    audit=json.loads(gzip.decompress((args.project/'reports/character-effect-inventory.json.gz').read_bytes()))
    batches=[];classified=[];counts=collections.Counter()
    for mode,out in [('battle',args.battle_output),('world',args.world_output)]:
        done=json.loads((out/'report.json').read_bytes())['models'] if (out/'report.json').exists() else {}
        candidates=[]
        for model in audit['characters']:
            data=model['modes'].get(mode)
            if not data:continue
            safe=[]
            for action in data['actions']:
                if action['integrated']:continue
                reason='anchor-or-no-local-bitmap' if not action['hasLocalBitmapReferences'] or 'point' in action['name'].casefold() else 'feature-adapter-required' if action['elementFeatures'] else None
                if reason:classified.append({'id':model['id'],'mode':mode,'action':action['name'],'reason':reason,'features':action['elementFeatures']})
                else:safe.append(action['name'])
            if safe and model['id'] not in done:candidates.append({'id':model['id'],'name':model['name'],'actions':safe})
        candidates.sort(key=lambda row:int(row['id']));counts[mode+'Models']=len(candidates);counts[mode+'ActionNames']=sum(len(c['actions']) for c in candidates)
        for i in range(0,len(candidates),4):batches.append({'batch':len(batches)+1,'mode':mode,'ids':[r['id'] for r in candidates[i:i+4]],'models':candidates[i:i+4]})
    result={'version':1,'scope':'Additional local bitmap actions, source-proven linear tween permitted; source XML and features rechecked during conversion. Planning is not extraction.',
            'pending':dict(counts),'batches':batches,'classified':classified,'constraints':{'workerCount':1,'maxIdsPerBatch':4,'maxBatchesPerCycle':6,'sourceExecution':False}}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'pending':dict(counts),'batches':len(batches),'classifiedActionNames':len(classified)}))

if __name__=='__main__':main()
