"""Recover explicit alternative role files into an isolated source-only catalog.

No character identity, capabilities, live manifest or recruitment is changed.
The existing bitmap renderer and independent all-frame validator are reused.
"""
import argparse,hashlib,json,shutil,subprocess,sys
from pathlib import Path

PREFIXES={'battle-left':'assets/battle/role/left/','battle-right':'assets/battle/role/right/','scene':'assets/role/npc/scene/npcres/'}

def source_key(logical):
    if not logical.endswith('.swf') or '..' in logical.split('/') or any(c in logical for c in ('\\',':','?','#')) or not any(logical.startswith(prefix) for prefix in PREFIXES.values()):raise ValueError('Explicit role source path required')
    return 'role-source-'+hashlib.sha256(logical.encode()).hexdigest()[:16]

def unsupported_action(action):
    unsupported=set()
    for element in action.iter('element'):
        if element.get('extname'):continue
        allowed={'assetId','x','y','alpha','scaleX','scaleY','rotation'}
        if element.get('blendMode')=='normal':allowed.add('blendMode')
        unsupported.update(set(element.attrib)-allowed)
    return sorted(unsupported)

def save(path,data):
    path.parent.mkdir(parents=True,exist_ok=True);temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');temporary.replace(path)

def main():
    ap=argparse.ArgumentParser()
    for name in ('source','project','output','jobs'):ap.add_argument('--'+name,type=Path,required=True)
    ap.add_argument('--revision',required=True);args=ap.parse_args();tool=Path(__file__).resolve().parent
    from original_archive import OriginalArchive
    from entity_pipeline import convert,BitmapCache
    from mme_config import read_config
    from recover_bound_effects import source_action_data
    from validate_native_effects import validate_action_metadata
    archive=OriginalArchive(args.source);out=args.output.resolve();jobs=json.loads(args.jobs.read_bytes())
    if out.is_relative_to(archive.root):raise ValueError('Originals are read-only')
    if not 1<=len(jobs)<=4 or len({job['source']['path'] for job in jobs})!=len(jobs):raise ValueError('One to four explicit role sources required')
    if not args.revision.replace('-','').isalnum():raise ValueError('Simple renderer revision required')
    out.mkdir(parents=True,exist_ok=True)
    if shutil.disk_usage(out).free<8_000_000_000:raise RuntimeError('Under 8 GB free; preserve source work')
    report_path=out/'report.json';report=json.loads(report_path.read_bytes()) if report_path.exists() else {'sourceOnly':True,'mechanicalUnlocksChanged':False,'models':{}}
    core=archive.record('flash/core/naruto.core.swf');cache=BitmapCache();batch_ids=[];expected=0
    for job in jobs:
        evidence=job['source'];logical=evidence['path'];key=source_key(logical);batch_ids.append(key)
        if key in report['models']:raise ValueError('Existing role source requires explicit review before repeating: '+logical)
        if archive.record(logical)!=evidence:raise ValueError('Planned role source changed')
        group=next(label for label,prefix in PREFIXES.items() if logical.startswith(prefix))
        if job['sourceGroup']!=group:raise ValueError('Role source group differs from the explicit plan')
        root,_,configuration=read_config(archive.raw(logical))
        if configuration!=job['configuration']:raise ValueError('Preferred role configuration changed')
        relative='assets/para-revisao/fontes-alternativas/'+key;url='/'+relative;folder=out/'public'/relative
        animations={};authored={};data_only=[];deferred=[]
        for action in root.findall('action'):
            name=action.get('name','')
            if not name:raise ValueError('Unnamed source action requires an explicit adapter')
            if name in authored:raise ValueError('Duplicate exact source action name requires an adapter')
            metadata=source_action_data(root,configuration,name)
            fresh,_,fresh_evidence=read_config(archive.raw(logical),action_names={name})
            validate_action_metadata(fresh,fresh_evidence,name,metadata);authored[name]=metadata
            elements=list(action.iter('element'))
            if not elements:data_only.append(name);continue
            unsupported=unsupported_action(action)
            if unsupported:deferred.append({'action':name,'reason':'native-color-or-feature-adapter-required','fields':unsupported});continue
            token=hashlib.sha256(name.encode()).hexdigest()[:16]
            try:
                data=convert(archive.path(logical),folder/token,url+'/'+token,'effect',only={name},pixel_budget=8_000_000,source_pixel_budget=32_000_000,compact=True,native_tween=True,image_cache=cache,preferred_config=True)
                if any(item.get('missing') or item.get('unsupported') for item in data['issues']):
                    deferred.append({'action':name,'reason':'unresolved-nonexternal-pixels','details':data['issues']});continue
                definition=data['animations'][name]
                definition.update(sourceEvidence=evidence,sourceAction=name,sourceConfiguration=configuration,configurationPreferenceEvidence=core,rendererRevision=args.revision)
                if any(frame.get('tween')=='true' for frame in action.iter('frame')):definition.update(interpolationEvidence=core,interpolation='mme-linear-contiguous-same-asset-v1')
                definition['events']=[{'frame':int(frame.get('index','0')),**{k:v for k,v in frame.attrib.items() if k not in ('index','length')}} for frame in action.iter('frame') if any(k in frame.attrib for k in ('event','sound'))]
                animations[name]=definition
            except ValueError as error:deferred.append({'action':name,'reason':str(error)})
        manifest={'id':key,'name':Path(logical).stem,'sourceOnly':True,'sourceGroup':group,'sourceEvidence':evidence,'sourceConfiguration':configuration,'authoredActions':authored,'dataOnlyActions':data_only,'deferredActions':deferred,'modes':{}}
        if animations:
            primary=next((animations[name] for name in ('idle_0','C_idle','stand') if name in animations),next(iter(animations.values())))
            manifest['modes']['source']={'animations':animations,'referenceHeight':primary['referenceHeight'],'status':'partial' if deferred or any(a['status']=='partial' for a in animations.values()) else 'ready'}
        save(folder/'manifest.json',manifest);expected+=len(animations)
        report['models'][key]={'source':evidence,'manifest':'/'+relative+'/manifest.json','preparedActions':list(animations),'dataOnlyActions':data_only,'deferredActions':deferred,'authoredMetadataVerified':True,'state':'awaiting-independent-frame-proof'}
        if archive.record(logical)!=evidence:raise ValueError('Original role source changed during conversion')
        save(report_path,report);print(json.dumps({'source':logical,'prepared':len(animations),'dataOnly':len(data_only),'deferred':len(deferred)}),flush=True)
    entries=[{'id':key,'name':Path(row['source']['path']).stem,'manifestUrl':row['manifest']} for key,row in report['models'].items()]
    save(out/'public/assets/catalog/entities.json',{'sourceOnly':True,'entities':entries})
    if expected:
        subprocess.run([sys.executable,'-X','utf8',str(tool/'validate_compact_actions.py'),'--source',str(args.source),'--project',str(out),'--revision',args.revision,'--expected',str(expected),'--all-frames','--no-contact','--report',args.revision],check=True,timeout=1800)
    for key in batch_ids:
        row=report['models'][key]
        row['state']='source-pixels-and-authored-metadata-reviewed' if row['preparedActions'] else 'source-metadata-only-raster-adapter-pending' if row['deferredActions'] else 'source-nonvisual-data-verified'
        row['pixelProof']='reports/'+args.revision+'.json' if row['preparedActions'] else None
    save(report_path,report);print(json.dumps({'state':'source-only-batch-reviewed','models':len(batch_ids),'preparedActions':expected,'mechanicalUnlocksChanged':False}),flush=True)

if __name__=='__main__':main()
