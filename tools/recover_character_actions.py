"""Additional native bitmap clips, explicit four-model batches; never overwrite known clips."""
import argparse, json, hashlib, sys
from pathlib import Path
import xml.etree.ElementTree as ET

def save(path, value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--project',required=True)
    ap.add_argument('--output',required=True);ap.add_argument('--ids',required=True);ap.add_argument('--pipeline')
    ap.add_argument('--complete-clipped',action='store_true',help='Also complete existing native clips whose timeline is shorter than the source')
    ap.add_argument('--actions',help='Optional exact comma-separated action names')
    args=ap.parse_args();ids=args.ids.split(',')
    if not 1<=len(ids)<=4 or len(set(ids))!=len(ids) or any(not x.isdigit() for x in ids):raise ValueError('One to four explicit model IDs required')
    project=Path(args.project).resolve();out=Path(args.output).resolve()
    sys.path.insert(0,str(project/'tools'))
    if args.pipeline:sys.path.insert(0,str(Path(args.pipeline).resolve()))
    from original_archive import OriginalArchive
    from entity_pipeline import convert,tags
    ar=OriginalArchive(args.source)
    if out.is_relative_to(ar.root):raise ValueError('Originals are read-only')
    cat={r['id']:r for r in json.loads((project/'public/assets/catalog/entities.json').read_bytes())['entities']}
    report_path=out/'report.json';report=json.loads(report_path.read_bytes()) if report_path.exists() else {'version':1,'models':{}}
    for ident in ids:
        row=cat[ident];mp=project/'public'/row['manifestUrl'].lstrip('/');manifest=json.loads(mp.read_bytes())
        logical=f'assets/battle/role/left/{ident}.swf';before=ar.record(logical)
        xml=next(p[6:] for k,p in tags(ar.raw(logical)) if k==87 and p[6:].lstrip().startswith(b'<actions'))
        root=ET.fromstring(xml);existing=manifest.get('modes',{}).get('battle',{}).get('animations',{})
        selected=set();deferred=[];markers=[]
        for a in root.findall('action'):
            name=a.get('name','');els=[e for e in a.iter('element') if not e.get('extname')]
            if args.actions and name not in args.actions.split(','):continue
            if name in existing:
                source_count=max((int(f.get('index','0'))+int(f.get('length','1')) for f in a.iter('frame')),default=0)
                prepared=existing[name];prepared_count=len(prepared.get('timeline',[])) or prepared['frames']
                if not args.complete_clipped or source_count<=prepared_count:continue
            if not els or 'point' in name.casefold() or a.find('.//pointElement') is not None:
                markers.append({'action':name,'kind':'anchor-or-no-local-bitmap','points':[dict(e.attrib) for e in a.iter('pointElement')]});continue
            features={k for e in els for k in e.attrib if k not in {'assetId','x','y','alpha','scaleX','scaleY','rotation'} and not (k=='blendMode' and e.get(k)=='normal')}
            if any(f.get('tween')=='true' and any(not e.get('extname') for e in f.findall('element')) for f in a.iter('frame')):features.add('tween-interpolation')
            if features:deferred.append({'action':name,'reason':'requires-native-feature-adapter','features':sorted(features)});continue
            selected.add(name)
        folder=out/'public'/row['manifestUrl'].lstrip('/');folder.parent.mkdir(parents=True,exist_ok=True)
        converted=convert(ar.path(logical),folder.parent/'battle',row['manifestUrl'].rsplit('/',1)[0]+'/battle','battle',only=selected,compact=True,pixel_budget=8_000_000,source_pixel_budget=32_000_000) if selected else {'animations':{},'issues':[]}
        added=[];completed=[]
        for name,anim in converted['animations'].items():
            anim['sourceEvidence']=before;anim['rendererRevision']='complete-native-skill-ground-origins-v1' if name in existing else 'additional-actions-ground-origins-v1'
            anim['sourceAction']=name
            anim['events']=[{'frame':int(f.get('index','0')),**{k:v for k,v in f.attrib.items() if k not in ('index','length')}} for f in root.find(f"action[@name='{name}']").iter('frame') if any(k in f.attrib for k in ('event','sound'))]
            proof={'action':name,'status':anim['status'],'frames':len(anim['timeline']),'uniqueFrames':anim['frames'],'externalEffects':anim.get('externalEffects',[])}
            if name in existing:
                import shutil
                backup=out/'backups'/ident/name;backup.mkdir(parents=True,exist_ok=True)
                save(backup/'animation.json',existing[name]);shutil.copy2(project/'public'/existing[name]['url'].lstrip('/'),backup/'before.png')
                completed.append({**proof,'before':existing[name]})
            else:added.append(proof)
            manifest['modes']['battle']['animations'][name]=anim
        for name in sorted(selected-set(converted['animations'])):deferred.append({'action':name,'reason':'budget-or-unresolved-bitmap','details':[i for i in converted['issues'] if i.get('action')==name]})
        # Keep the prior actions.xml intact; additions are sourced from the new immutable evidence.
        (folder.parent/'battle/actions.xml').unlink(missing_ok=True)
        if added or completed:save(folder,manifest)
        assert ar.record(logical)==before
        report['models'][ident]={'name':row['name'],'manifest':row['manifestUrl'],'source':before,'added':added,'completedClippedActions':completed,'deferred':deferred,'markers':markers,'existingActionsPreserved':not completed,'mechanicalUnlocksChanged':False}
        save(report_path,report);print(json.dumps({'model':ident,'added':len(added),'completed':len(completed),'deferred':len(deferred),'markers':len(markers)}),flush=True)

if __name__=='__main__':main()
