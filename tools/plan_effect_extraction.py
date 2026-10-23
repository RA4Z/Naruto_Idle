"""Explicit, resumable batches; planning is never counted as rendered assets."""
import argparse,collections,gzip,json,sys
from pathlib import Path
import xml.etree.ElementTree as ET

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--project',type=Path,required=True)
    ap.add_argument('--prepared',type=Path,required=True);ap.add_argument('--output',type=Path,required=True)
    args=ap.parse_args();sys.path.insert(0,str(args.project/'tools'))
    from original_archive import OriginalArchive
    ar=OriginalArchive(args.source)
    audit=json.loads(gzip.decompress((args.project/'reports/character-effect-inventory.json.gz').read_bytes()))
    index=json.loads((args.prepared/'index.json').read_bytes())
    definitions={e.get('id'):dict(e.attrib) for e in ET.fromstring(ar.data('assets/battle/Effect.xml'))}
    sources={e['path']:e for e in audit['effects']};used=collections.Counter();initial=set()
    starters={'11000101','11000211','11000301','11000701','11000801','11000901','11001401','11001501','11001001','11000401'}
    for model,skills in audit['nativeBindings']['models'].items():
        for skill in skills:
            for effect in skill.get('effects',[]):
                used[effect['id']]+=1
                if model in starters:initial.add(effect['id'])
    pending=[];classified=[]
    for ident,row in definitions.items():
        if ident in index['effects']:continue
        source=sources.get(row.get('res'));actions=[row[k] for k in ('backAction','frontAction') if row.get(k)]
        reason=None
        if row.get('type')!='0':reason='procedural-adapter-required'
        elif not source:reason='not-a-local-effect-swf'
        elif source['format']=='bitmap-actions':reason='bitmap-native-feature-and-independent-proof-required'
        elif not actions:reason='no-bound-layer-action'
        elif any(a not in source.get('symbols',{}) or str(source['symbols'][a]) not in source.get('spriteFrameCounts',{}) for a in actions):reason='exact-exported-sprite-binding-absent'
        item={'id':ident,'source':row.get('res'),'actions':actions,'starterBinding':ident in initial,'bindingOccurrences':used[ident]}
        if reason:classified.append({**item,'state':'not-extracted','reason':reason})
        else:pending.append(item)
    pending.sort(key=lambda r:(not r['starterBinding'],-r['bindingOccurrences'],int(r['id'])))
    referenced={r.get('res') for r in definitions.values()}
    unbound=[{'source':s['path'],'format':s['format'],'exportedSymbols':s.get('symbols',{}),'state':'not-extracted-unbound-source'} for s in sources.values() if s['path'] not in referenced]
    result={'version':1,'scope':'Exact Effect.xml layer bindings. Every source is accounted for; unbound sources require separate inspection. A plan is not an extraction.',
            'sourceInventoryCount':len(sources),'preparedEffectIds':len(index['effects']),
            'preparedUniqueSources':len({e['source']['path'] for e in index['effects'].values()}),
            'renderablePendingIds':len(pending),'classifiedPendingIds':len(classified),'unboundSources':unbound,
            'batches':[{'batch':i//4+1,'ids':[r['id'] for r in pending[i:i+4]],'items':pending[i:i+4]} for i in range(0,len(pending),4)],
            'classified':classified,'constraints':{'workerCount':1,'maxIdsPerBatch':4,'maxBatchesPerCycle':6,'sourceExecution':False,'originalsReadOnly':True}}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k not in ('batches','classified','unboundSources')}))
    print(json.dumps({'unboundSources':len(unbound),'firstBatches':result['batches'][:6]},ensure_ascii=False))

if __name__=='__main__':main()
