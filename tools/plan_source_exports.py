"""Plan every exported effect action, including graphics without skill bindings."""
import argparse,gzip,hashlib,json,sys
from pathlib import Path
from mme_config import read_config
from recover_bound_effects import cached_layer

def main():
    ap=argparse.ArgumentParser()
    for key in ('source','project','prepared','output'):ap.add_argument('--'+key,type=Path,required=True)
    args=ap.parse_args();sys.path.insert(0,str(args.project/'tools'))
    from original_archive import OriginalArchive
    archive=OriginalArchive(args.source);audit=json.loads(gzip.decompress((args.project/'reports/character-effect-inventory.json.gz').read_bytes()))
    index=json.loads((args.prepared/'index.json').read_bytes());jobs=[];sources=[];data_only=[];blocked=[];already=0
    for source in audit['effects']:
        logical=source['path'];evidence=archive.record(logical);actions=[]
        if source['format']=='static-display-list':
            actions=[name for name,symbol in source['symbols'].items() if str(symbol) in source['spriteFrameCounts']]
        else:
            try:root,_,_=read_config(archive.raw(logical))
            except (ValueError,KeyError) as error:
                blocked.append({'source':evidence,'reason':str(error),'state':'source-format-adapter-required'});continue
            for action in root.findall('action'):
                name=action.get('name')
                if not name:continue
                if not any(True for _ in action.iter('element')):
                    data_only.append({'source':evidence,'action':name,'fps':root.get('frameRate'),'points':[dict(p.attrib) for p in action.iter('pointElement')],'state':'nonvisual-source-data-extracted'});continue
                actions.append(name)
        sources.append({'source':evidence,'format':source['format'],'exportedVisualActions':actions})
        for action in dict.fromkeys(actions):
            if cached_layer(index,evidence,action,args.prepared):already+=1;continue
            key='source:'+hashlib.sha256(logical.encode()).hexdigest()[:16]+':'+hashlib.sha256(action.encode()).hexdigest()[:12]
            jobs.append({'key':key,'resource':logical,'action':action,'source':evidence})
    result={'version':1,'scope':'Every exported sprite action or preferred MME visual action. Synthetic source keys are not skill IDs; no gameplay unlock is inferred.',
            'sources':sources,'dataOnly':data_only,'blockedSources':blocked,'alreadyPreparedActions':already,'pendingActions':len(jobs),
            'batches':[{'batch':i//4+1,'jobs':jobs[i:i+4]} for i in range(0,len(jobs),4)],
            'constraints':{'maxActionsPerBatch':4,'maxBatchesPerCycle':6,'workerCount':1,'sourceExecution':False}}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'sourceFiles':len(sources),'alreadyPreparedActions':already,'pendingActions':len(jobs),'batches':len(result['batches']),'dataOnlyActions':len(data_only),'blockedSources':len(blocked)}))

if __name__=='__main__':main()
