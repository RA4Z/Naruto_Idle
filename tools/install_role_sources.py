"""Publish alternative role graphics for review, outside the live entity catalog."""
import argparse,copy,gzip,hashlib,json,shutil,sys
from pathlib import Path
from install_source_exports import contained,entry_digest
from recover_role_sources import source_key
from mme_config import read_config
from validate_native_effects import validate_action_metadata

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def publish(project,stage,archive,ids,proof_paths):
    if not 1<=len(ids)<=4 or len(set(ids))!=len(ids):raise ValueError('One to four explicit role source IDs required')
    project=project.resolve();stage=stage.resolve()
    if project.is_relative_to(archive.root) or stage.is_relative_to(archive.root):raise ValueError('Originals are read-only')
    live_catalog=project/'public/assets/catalog/entities.json';catalog_before=live_catalog.read_bytes()
    index_path=project/'asset-source/role-source-exports/index.json';index_before=index_path.read_bytes() if index_path.exists() else None
    current=json.loads(index_before) if index_before else {'version':1,'sourceOnly':True,'models':{}};before=copy.deepcopy(current)
    extraction=json.loads((stage/'report.json').read_bytes());proofs={}
    if extraction.get('sourceOnly') is not True or extraction.get('mechanicalUnlocksChanged') is not False:raise ValueError('Source-only role staging required')
    for path in proof_paths:
        report=json.loads(path.read_bytes())
        if report.get('allTimelineFrames') is not True:raise ValueError('Full source timeline proof required')
        for proof in report['actions']:
            key=(proof['id'],proof['mode'],proof['action'])
            if key in proofs and proofs[key]!=proof:raise ValueError('Conflicting role pixel proofs')
            proofs[key]=proof
    copy_plan={};added=[];already=[];frames=0;actions=0
    for ident in ids:
        row=extraction['models'][ident];evidence=row['source']
        if source_key(evidence['path'])!=ident or archive.record(evidence['path'])!=evidence:raise ValueError('Role source identity or original bytes changed')
        relative='assets/para-revisao/fontes-alternativas/'+ident;manifest_url='/'+relative+'/manifest.json'
        if row['manifest']!=manifest_url:raise ValueError('Unexpected role review manifest path')
        staged_manifest=contained(stage/'public',relative+'/manifest.json');payload=staged_manifest.read_bytes();manifest=json.loads(payload)
        if manifest.get('sourceOnly') is not True or manifest['id']!=ident or manifest['sourceEvidence']!=evidence or set(manifest['modes'])-{'source'}:raise ValueError('Source-only role manifest differs')
        if any(key in manifest for key in ('capabilities','collection','starter','reserved')):raise ValueError('Alternative source must not declare gameplay identity')
        source_root,_,configuration=read_config(archive.raw(evidence['path']))
        if manifest['sourceConfiguration']!=configuration:raise ValueError('Role preferred configuration changed')
        if set(manifest['authoredActions'])!={action.get('name') for action in source_root.findall('action')}:raise ValueError('Authored role action metadata is incomplete')
        for name,metadata in manifest['authoredActions'].items():validate_action_metadata(source_root,configuration,name,metadata)
        folder=contained(stage/'public',relative);target_folder=contained(project/'public',relative)
        assets={target_folder/'manifest.json':(staged_manifest,hashlib.sha256(payload).hexdigest())}
        definitions=manifest['modes'].get('source',{}).get('animations',{})
        if set(definitions)!=set(row['preparedActions']):raise ValueError('Prepared source role action set changed')
        groups=[set(definitions),set(manifest['dataOnlyActions']),{item['action'] for item in manifest['deferredActions']}]
        if set.union(*groups)!=set(manifest['authoredActions']) or sum(map(len,groups))!=len(set.union(*groups)):raise ValueError('Source role actions are missing or ambiguously classified')
        model_frames=0
        for name,definition in definitions.items():
            proof=proofs.get((ident,'source',name))
            if proof is None or not all(proof.get(key) is True for key in ('timingAndTimelineMatch','groundOffsetsAndPixelsMatch','sourceHashesPreserved')):raise ValueError('Missing independent source role proof')
            if proof.get('animationDefinitionSha256')!=entry_digest(definition):raise ValueError('Source animation definition changed after validation')
            if proof['sampledTimelineFrames']!=list(range(len(definition['timeline']))):raise ValueError('Incomplete role source timeline coverage')
            if definition['sourceEvidence']!=evidence or definition['sourceConfiguration']!=configuration or definition['sourceAction']!=name:raise ValueError('Role animation source binding differs')
            core=definition['configurationPreferenceEvidence']
            if core['path']!='flash/core/naruto.core.swf' or archive.record(core['path'])!=core:raise ValueError('Original role graphics semantics changed')
            url=definition['url'];prefix='/'+relative+'/'
            if not url.startswith(prefix):raise ValueError('Role sprite leaves its source review folder')
            rest=url.removeprefix(prefix);source=contained(folder,rest);target=contained(target_folder,rest)
            if source.suffix.lower()!='.png' or digest(source)!=proof['atlasSha256']:raise ValueError('Prepared role pixels changed')
            assets[target]=(source,proof['atlasSha256']);model_frames+=len(definition['timeline'])
        for target,pair in assets.items():
            if target.exists() and digest(target)!=pair[1]:raise ValueError('Existing role review file changed; preserve it')
            if target in copy_plan and copy_plan[target][1]!=pair[1]:raise ValueError('Role review output collision')
            copy_plan[target]=pair
        record={'source':evidence,'sourceGroup':manifest['sourceGroup'],'manifest':manifest_url,'manifestSha256':hashlib.sha256(payload).hexdigest(),'preparedActions':list(definitions),'dataOnlyActions':manifest['dataOnlyActions'],'deferredActions':manifest['deferredActions'],'sourceFramesVerified':model_frames,'sourceOnly':True}
        if ident in current['models']:
            if current['models'][ident]!=record:raise ValueError('Existing source role review changed; preserve it')
            already.append(ident)
        else:current['models'][ident]=record;added.append(ident)
        frames+=model_frames;actions+=len(definitions)
    reverted=copy.deepcopy(current)
    for ident in added:del reverted['models'][ident]
    if reverted!=before:raise ValueError('An unrelated source review field changed')
    if live_catalog.read_bytes()!=catalog_before or (index_path.read_bytes() if index_path.exists() else None)!=index_before:raise ValueError('Catalog or source index changed concurrently')
    copied=0
    for target,(source,sha) in copy_plan.items():
        target.parent.mkdir(parents=True,exist_ok=True)
        if not target.exists():shutil.copy2(source,target);copied+=1
        if digest(target)!=sha:raise ValueError('Published role source pixels/metadata changed')
    if live_catalog.read_bytes()!=catalog_before or (index_path.read_bytes() if index_path.exists() else None)!=index_before:raise ValueError('Catalog or source index changed while copying')
    if added:
        index_path.parent.mkdir(parents=True,exist_ok=True);temporary=index_path.with_suffix('.tmp');temporary.write_text(json.dumps(current,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');temporary.replace(index_path)
    return {'version':1,'sourceOnly':True,'mechanicalUnlocksChanged':False,'liveCatalogUnchanged':True,'liveCatalogSha256':hashlib.sha256(catalog_before).hexdigest(),'added':added,'alreadyCurrent':already,'preparedActions':actions,'sourceFramesVerified':frames,'copiedFiles':copied}

def main():
    ap=argparse.ArgumentParser()
    for name in ('project','staging','source'):ap.add_argument('--'+name,type=Path,required=True)
    ap.add_argument('--ids',required=True);ap.add_argument('--proofs',type=Path,nargs='+',required=True);ap.add_argument('--label',required=True);args=ap.parse_args()
    if not args.label.isalnum():raise ValueError('Simple source role report label required')
    sys.path.insert(0,str(args.project/'tools'))
    from original_archive import OriginalArchive
    result=publish(args.project,args.staging,OriginalArchive(args.source),args.ids.split(','),args.proofs)
    path=args.project/'reports'/('role-source-install-'+args.label+'.json.gz');path.parent.mkdir(parents=True,exist_ok=True)
    with gzip.GzipFile(filename=str(path),mode='wb',mtime=0) as stream:stream.write((json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode())
    print(json.dumps(result))

if __name__=='__main__':main()
