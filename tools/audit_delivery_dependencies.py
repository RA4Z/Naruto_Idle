"""Record concrete remaining dependencies without executing or inventing assets."""
import argparse
from collections import Counter
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from original_archive import OriginalArchive
from entity_pipeline import tags
ROOT=Path(__file__).resolve().parents[1]


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);args=parser.parse_args()
    archive=OriginalArchive(args.source);records={};empty=[]
    for name in ('assets/rumorPlot/plotimg/214315.jpg','assets/rumorPlot/plotimg/213065.jpg'):
        records[name]=archive.record(name)
        empty.append({'source':records[name],'state':'empty-delivered-source' if records[name]['bytes']==0 else 'requires-recheck',
                      'required':'A nonempty original from another verified source; no generated replacement'})
    name='assets/user/userHead.bmp';records[name]=archive.record(name)
    counts=Counter(kind for kind,payload in tags(archive.raw(name)))
    visual_tags={2,6,20,21,22,32,35,36,39,46,83,84,90}
    container={'source':records[name],'format':'SWF obfuscated as BMP','tagCounts':dict(counts),
               'embeddedVisualTags':sum(counts[k] for k in visual_tags),
               'hasActionScript':bool(counts[12] or counts[59] or counts[82]),
               'policy':'Static tag inspection only. No ActionScript executed. Do not claim that a generic static renderer recovers an avatar when no visual tags are embedded.'}
    config='assets/sound/soundConfig.xml';records[config]=archive.record(config)
    packages={p.get('id') for p in ET.fromstring(archive.data(config)).iter('package')}
    missing={}
    presentation=json.loads((ROOT/'public/assets/presentation.json').read_bytes())
    for ident,ref in presentation['entityAudio'].items():
        actor=json.loads((ROOT/'public'/ref['url'].lstrip('/')).read_bytes())
        for event in actor.get('unresolvedEvents',[]):
            row=missing.setdefault(event['sound'],{'models':[],'events':0,'packageInDeliveredConfig':event['sound'] in packages,'reason':event['reason']})
            row['events']+=1
            if ident not in row['models']:row['models'].append(ident)
    catalog=json.loads((ROOT/'public/assets/catalog/entities.json').read_bytes())['entities'];blocked=[]
    for row in catalog:
        if row['status']!='blocked':continue
        manifest=json.loads((ROOT/'public'/row['manifestUrl'].lstrip('/')).read_bytes())
        blocked.append({'id':row['id'],'name':row['name'],'manifest':row['manifestUrl'],'recordedIssues':manifest.get('issues',[]),
                        'state':'canonical-issue-not-reclassified','nextStep':'Inspect the specific source/actions/dependencies in a bounded batch; placeholder or transparent models must not receive invented pixels'})
    assert all(record==archive.record(name) for name,record in records.items())
    report={'scope':'Fresh checks of specific empty files, disguised container and remaining attack/death packages; existing blocked-model issues preserved, not newly proven irrecoverable.',
            'sourceHashesPreserved':True,'emptySources':empty,'disguisedContainer':container,
            'soundConfig':records[config],'missingSoundPackages':missing,'canonicalBlockedModels':blocked,
            'stillPending':['Shared external effects/shadows and jutsu presentation','Other action/world voices','Remaining UI resources and their usable integration','Per-object/middleground map depth and original physical links','Narrative context and encounters; extraction is not campaign implementation'],
            'completeArchiveExtraction':False}
    (ROOT/'reports/delivered-remaining-dependencies.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'emptyDeliveredFiles':sum(r['state']=='empty-delivered-source' for r in empty),'userHeadEmbeddedVisualTags':container['embeddedVisualTags'],'missingAudioPackages':len(missing),'canonicalBlockedModels':len(blocked),'completeArchiveExtraction':False}))


if __name__=='__main__':main()
