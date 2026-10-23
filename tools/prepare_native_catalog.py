"""Join original ninja -> skill -> action -> effect IDs without prefix inference."""
import argparse, gzip, hashlib, json, re, shutil, sys
from pathlib import Path
import xml.etree.ElementTree as ET

def save(path,value):
    path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def remap(value):
    if isinstance(value,str):return value.replace('/assets/native-effects/','/assets/effects/native/')
    if isinstance(value,list):return [remap(v) for v in value]
    if isinstance(value,dict):return {k:remap(v) for k,v in value.items()}
    return value

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--project',required=True);ap.add_argument('--effects',required=True);ap.add_argument('--audit',required=True);ap.add_argument('--output',required=True)
    args=ap.parse_args();project=Path(args.project).resolve();sys.path.insert(0,str(project/'tools'))
    from original_archive import OriginalArchive
    ar=OriginalArchive(args.source);out=Path(args.output).resolve()
    if out.is_relative_to(ar.root):raise ValueError('Originals are read-only')
    paths=['config/skill/ninjaSkillConfig.xml','assets/battle/SkillAction.xml','assets/battle/Effect.xml','config/battle/SkillInfos.xml']
    configs={p:ET.fromstring(ar.data(p)) for p in paths};evidence={p:ar.record(p) for p in paths}
    skills={e.get('id'):e for e in configs[paths[1]]};effects={e.get('id'):dict(e.attrib) for e in configs[paths[2]]};names={e.get('id'):e.get('name') for e in configs[paths[3]]}
    cat=json.loads((project/'public/assets/catalog/entities.json').read_bytes())['entities'];models={e['id']:e for e in cat};bindings={}
    for row in configs[paths[0]]:
        ident=row.get('ninjaId')
        if ident not in models:continue
        entries=[]
        for category in ('normals','specials','skills'):
            for sid in dict.fromkeys(re.findall(r'\d+',row.get(category,''))):
                if sid=='0':continue
                native=skills.get(sid);entry={'skillId':sid,'name':names.get(sid),'category':category,'star':row.get('star'),'actionFound':native is not None}
                if native is not None:
                    entry['action']=dict(native.attrib);entry['events']=[{'tag':c.tag,**c.attrib} for c in native]
                    entry['effects']=[{'role':c.tag,'id':c.get('id'),'definition':effects.get(c.get('id'))} for c in native if c.tag in ('SkillEffect','FullScreenEffect')]
                entries.append(entry)
        bindings.setdefault(ident,[]).extend(entries)
    audit=json.loads(Path(args.audit).read_bytes());audit['nativeBindings']={'sources':evidence,'models':bindings,'policy':'Exact ninjaId rows, all star rows preserved, no inferred prefix or gameplay unlock'}
    target=out/'reports/character-effect-inventory.json.gz';target.parent.mkdir(parents=True,exist_ok=True)
    with gzip.GzipFile(filename=str(target),mode='wb',mtime=0) as stream:stream.write((json.dumps(audit,ensure_ascii=False,separators=(',',':'))+'\n').encode())
    index=json.loads(Path(args.effects,'index.json').read_bytes())
    for effect in index['effects'].values():
        effect['bindings']=[]
        for ident,entries in bindings.items():
            for binding in entries:
                if not any(e['id']==effect['id'] and e['role']=='SkillEffect' for e in binding.get('effects',[])):continue
                row=models[ident];mp=project/'public'/row['manifestUrl'].lstrip('/');mode=mp.parent/'battle/actions.xml'
                if not mode.exists():continue
                root=ET.fromstring(mode.read_bytes());action=binding['action'].get('attackAction');a=next((a for a in root.findall('action') if a.get('name')==action),None)
                if a is None:continue
                events=[{'frame':int(f.get('index','0')),'event':f.get('event')} for f in a.iter('frame') if f.get('event')]
                starts=sorted({e['frame'] for e in events if 'playSkillEffect' in (e['event'] or '').split(';')})
                # Preserve every actual match. A preview is evidence, never a recruitment change.
                effect['bindings'].append({'modelId':ident,'name':row['name'],'manifestUrl':row['manifestUrl'],'skillId':binding['skillId'],'skillName':binding['name'],'category':binding['category'],'action':action,'fps':float(root.get('frameRate','24')),'startFrames':starts,'events':events,'stage':binding['action'],'source':evidence[paths[0]],'actionSource':evidence[paths[1]],'status':'source-plane-review'})
        for layer in effect['layers']:
            anim=layer['animation']
            for key in ('url','packedAtlasUrl'):
                if key in anim:anim[key]=anim[key].replace('/assets/native-effects/','/assets/effects/native/')
            relative=Path(anim['url'].removeprefix('/assets/effects/native/')).parent
            if relative.is_absolute() or '..' in relative.parts:raise ValueError('Invalid prepared effect URL')
            target_folder=out/'public/assets/effects/native'/relative;target_folder.mkdir(parents=True,exist_ok=True)
            names=tuple(Path(u).name for u in anim.get('atlasPageUrls',[anim['url']]))+('effect-atlas.json','manifest.json')
            for name in names:
                source=Path(args.effects)/relative/name;target=target_folder/name
                if name.endswith('.json'):save(target,remap(json.loads(source.read_bytes())))
                elif source.resolve()!=target.resolve():shutil.copy2(source,target)
            layer['artifactsSha256']={name:hashlib.sha256((target_folder/name).read_bytes()).hexdigest() for name in names}
        effect['bindingReview']='Original display plane only; original movement stage and named attachment points must be validated before changing world combat.'
    save(out/'public/assets/effects/native/index.json',index)
    save(out/'reports/character-effects-summary.json',{'sourceAudit':audit['summary'],'formats':audit['effectFormats'],'modelsWithExactSkillBindings':len(bindings),'preparedNativeEffects':len(index['effects']),'deferredPreparedEffects':index['deferred'],'policy':'Extracted != integrated. No AS executed. Alpha/blend/tween/external dependencies remain explicit. Compressed inventory contains every audited source and original ninja/skill binding.','sources':evidence})
    print(json.dumps({'modelsWithExactSkillBindings':len(bindings),'prepared':len(index['effects']),'bindings':{i:len(e['bindings']) for i,e in index['effects'].items()},'compressedBytes':(out/'reports/character-effect-inventory.json.gz').stat().st_size}))

if __name__=='__main__':main()
