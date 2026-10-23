"""Queue exact actions affected by original XML/preferred-data differences."""
import argparse,json,math,sys
from pathlib import Path
from mme_config import read_config

def main():
    ap=argparse.ArgumentParser()
    for key in ('source','project','audits','output'):ap.add_argument('--'+key,type=Path,required=True)
    args=ap.parse_args();sys.path.insert(0,str(args.project/'tools'))
    from original_archive import OriginalArchive
    archive=OriginalArchive(args.source);catalog={e['id']:e for e in json.loads((args.project/'public/assets/catalog/entities.json').read_bytes())['entities']}
    total=math.ceil(len(catalog)/4);jobs=[];blocked=[];already=0;seen=set();sources=matches=0
    for number in range(1,total+1):
        path=args.audits/f'config-parity-batch-{number:03d}.json'
        if not path.is_file():raise ValueError('Metadata audit incomplete; missing batch '+str(number))
        data=json.loads(path.read_bytes())
        for row in data['rows']:
            evidence=row['source'];assert archive.record(evidence['path'])==evidence
            mode='world' if evidence['path'].endswith('_outdoor.swf') else 'battle';key=(row['id'],mode)
            if key in seen:raise ValueError('Duplicate audited source model/mode')
            seen.add(key);sources+=1
            if row.get('semanticMatch') is True:matches+=1;continue
            if row.get('state')=='adapter-required':
                try:
                    root,_,configuration=read_config(archive.raw(evidence['path']));actions=[a.get('name') for a in root.findall('action')]
                except (ValueError,KeyError) as error:
                    blocked.append({'id':row['id'],'mode':mode,'source':evidence,'reason':type(error).__name__+': '+str(error)});continue
                reason='preferred-data-readable-without-XML-equivalence'
            else:
                actions=row['affectedActions'];configuration=row['preferredConfiguration'];reason='original-source-representations-differ'
            entry=catalog[row['id']];manifest=json.loads((args.project/'public'/entry['manifestUrl'].lstrip('/')).read_bytes())
            current=manifest.get('modes',{}).get(mode,{}).get('animations',{});selected=[]
            for name in actions:
                existing=current.get(name,{})
                if existing.get('sourceConfiguration')==configuration and existing.get('sourceEvidence')==evidence and existing.get('sourceAction')==name:already+=1
                else:selected.append(name)
            if selected:jobs.append({'id':row['id'],'mode':mode,'actions':selected,'source':evidence,'configuration':configuration,'reason':reason})
    result={'version':1,'auditedSourceFiles':sources,'equivalentSources':matches,'alreadyPreferredActions':already,'blockedSources':blocked,
            'pendingSourceModels':len(jobs),'pendingActions':sum(len(j['actions']) for j in jobs),
            'batches':[{'batch':i//4+1,'jobs':jobs[i:i+4]} for i in range(0,len(jobs),4)],
            'constraints':{'maxModelsPerBatch':4,'maxBatchesPerCycle':6,'workerCount':1,'sourceExecution':False},
            'scope':'Preferred graphics-data corrections only. No recruitment or capability changes; all generated actions require independent pixel validation before installation.'}
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k not in ('batches','blockedSources')}))

if __name__=='__main__':main()
