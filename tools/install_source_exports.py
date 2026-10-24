"""Publish verified source-only graphics without changing live skill bindings."""
import argparse,copy,gzip,hashlib,json,re,shutil,sys
from pathlib import Path,PurePosixPath

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def entry_digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()

def contained(root,relative):
    value=PurePosixPath(relative)
    if value.is_absolute() or '..' in value.parts or any(c in str(value) for c in ('\\',':','?','#')):raise ValueError('Source artifact path escapes its root')
    target=(root/str(value)).resolve()
    if not target.is_relative_to(root.resolve()):raise ValueError('Source artifact follows an external link')
    return target

def publish(project,stage,archive,ids,proof_paths,*,source_kind='battle-effect-exported-sprite'):
    if source_kind not in ('battle-effect-exported-sprite','scene-exported-sprite','role-left-exported-sprite','role-mme-action'):raise ValueError('Explicit supported source kind required')
    if not 1<=len(ids)<=24 or len(ids)!=len(set(ids)) or any(not re.fullmatch(r'source:[0-9a-f]{16}:[0-9a-f]{12}',i) for i in ids):raise ValueError('Choose up to 24 exact source-only IDs')
    project=project.resolve();stage=stage.resolve()
    if project.is_relative_to(archive.root) or stage.is_relative_to(archive.root):raise ValueError('Originals are read-only')
    index_path=project/'public/assets/effects/native/index.json';before_bytes=index_path.read_bytes();before=json.loads(before_bytes);current=copy.deepcopy(before)
    prepared=json.loads((stage/'index.json').read_bytes());proofs={}
    for path in proof_paths:
        for row in json.loads(path.read_bytes())['rows']:
            if row['id'] not in ids:continue
            if not all(row.get(k) is True for k in ('allSourceRenderedFramesReconstructed','artifactsSha256Match','originalArchiveVerified')):raise ValueError('Incomplete original-frame proof')
            key=(row['id'],row['action'],row['plane'])
            if key in proofs and proofs[key]!=row:raise ValueError('Conflicting source frame proofs')
            proofs[key]=row
    current.setdefault('sourceExports',{});copy_plan={};added=[];already=[];frames=0
    for ident in ids:
        entry=prepared['sourceExports'][ident]
        if entry.get('sourceOnly') is not True or entry.get('bindingOrigin')!='exported-source-action-not-a-skill-id':raise ValueError('Not a source-only review entry')
        logical=entry['source']['path'];action=entry['definition']['frontAction']
        expected='source:'+hashlib.sha256(logical.encode()).hexdigest()[:16]+':'+hashlib.sha256(action.encode()).hexdigest()[:12]
        if ident!=expected or entry['id']!=ident:raise ValueError('Exact source/action identity differs')
        if source_kind=='battle-effect-exported-sprite':
            if not logical.startswith('assets/battle/effect/') or entry.get('sourceKind','battle-effect-exported-sprite')!=source_kind:raise ValueError('Battle source kind/path differs; scenes require explicit publication')
        elif source_kind=='scene-exported-sprite':
            from scene_export_contract import validate_scene_entry
            validate_scene_entry(archive,entry)
        elif source_kind=='role-mme-action':
            from role_mme_contract import validate_role_mme_entry
            validate_role_mme_entry(archive,entry)
        else:
            from role_export_contract import validate_role_entry
            validate_role_entry(archive,entry)
        for evidence in (entry['source'],entry['sourceConfig']):
            if archive.record(evidence['path'])!=evidence:raise ValueError('Original source changed')
        if len(entry['layers'])!=1:raise ValueError('Source exports must preserve one exact exported action')
        for layer in entry['layers']:
            if layer['action']!=action:raise ValueError('Source action binding changed')
            proof=proofs.get((ident,action,layer['plane']))
            if proof is None or proof.get('sourceEntrySha256')!=entry_digest(entry):raise ValueError('Missing or stale exact-entry source proof')
            if source_kind=='scene-exported-sprite' and proof.get('sourceSceneExportMatch') is not True:raise ValueError('Independent original scene export proof required')
            if source_kind in ('role-left-exported-sprite','role-mme-action') and proof.get('sourceRoleExportMatch') is not True:raise ValueError('Independent original role export proof required')
            if proof.get('sourcePixelScale')!=1:raise ValueError('Original pixel scale is required')
            if layer.get('sourceSequence'):
                relative=PurePosixPath(layer['sourceSequence']['manifestPath'])
                if relative.name!='manifest.json':raise ValueError('Unexpected source sequence manifest')
                source_folder=contained(stage,relative.parent)
                target_folder=contained(project/'asset-source/native-effects',relative.parent)
                sequence=json.loads((source_folder/'manifest.json').read_bytes())
                if len(sequence['timeline'])!=proof['frames'] or sequence['state']!='source-frames-complete-runtime-adapter-pending':raise ValueError('Source sequence timing/state differs')
                required_names={'manifest.json',*sequence['frameFiles']}
            else:
                url=layer['animation']['url'];prefix='/assets/effects/native/'
                if not url.startswith(prefix):raise ValueError('Unexpected native review URL')
                relative=PurePosixPath(url.removeprefix(prefix)).parent
                source_folder=contained(stage,relative)
                target_folder=contained(project/'public/assets/effects/native',relative)
                animation=layer['animation']
                if animation.get('sourcePixelScale')!=1 or len(animation['timeline'])!=proof['frames']:raise ValueError('Native timeline or pixel scale differs')
                required_names={'manifest.json'}
                for reference in [animation['url'],animation['packedAtlasUrl'],*animation.get('atlasPageUrls',[])]:
                    if not reference.startswith(prefix) or PurePosixPath(reference.removeprefix(prefix)).parent!=relative:raise ValueError('Native bundle reference escapes its folder')
                    required_names.add(PurePosixPath(reference).name)
            if not required_names<=set(layer['artifactsSha256']):raise ValueError('Native bundle artifact proof is incomplete')
            for name,sha in layer['artifactsSha256'].items():
                if Path(name).name!=name or Path(name).suffix.lower() not in ('.json','.webp','.png') or not re.fullmatch('[0-9a-f]{64}',sha):raise ValueError('Unexpected generated review artifact')
                source=contained(source_folder,name);target=contained(target_folder,name)
                if digest(source)!=sha:raise ValueError('Staged review artifact changed')
                if target.exists() and digest(target)!=sha:raise ValueError('Existing published artifact differs; preserve it')
                previous=copy_plan.get(target)
                if previous is not None and previous[1]!=sha:raise ValueError('Artifact target collision')
                copy_plan[target]=(source,sha)
            frames+=proof['frames']
        if ident in current['sourceExports']:
            if current['sourceExports'][ident]!=entry:raise ValueError('Existing review entry changed; preserve it')
            already.append(ident)
        else:current['sourceExports'][ident]=copy.deepcopy(entry);added.append(ident)
    restored=copy.deepcopy(current)
    for ident in added:del restored['sourceExports'][ident]
    if 'sourceExports' not in before:del restored['sourceExports']
    if restored!=before:raise ValueError('A live binding or unrelated index field changed')
    if index_path.read_bytes()!=before_bytes:raise ValueError('Index changed during source review')
    copied=0
    for target,(source,sha) in copy_plan.items():
        target.parent.mkdir(parents=True,exist_ok=True)
        if not target.exists():shutil.copy2(source,target);copied+=1
        if digest(target)!=sha:raise ValueError('Published review artifact verification failed')
    if index_path.read_bytes()!=before_bytes:raise ValueError('Index changed during artifact copying')
    if added:
        temporary=index_path.with_suffix('.json.tmp');temporary.write_text(json.dumps(current,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');temporary.replace(index_path)
    return {'version':1,'sourceExecution':False,'mechanicalUnlocksChanged':False,'existingBindingsPreserved':True,'added':added,'alreadyCurrent':already,'sourceFramesVerified':frames,'copiedFiles':copied,'indexBeforeSha256':hashlib.sha256(before_bytes).hexdigest(),'indexAfterSha256':digest(index_path)}

def main():
    ap=argparse.ArgumentParser()
    for name in ('project','staging','source'):ap.add_argument('--'+name,type=Path,required=True)
    ap.add_argument('--source-kind',choices=('battle-effect-exported-sprite','scene-exported-sprite','role-left-exported-sprite','role-mme-action'),default='battle-effect-exported-sprite');ap.add_argument('--proofs',type=Path,nargs='+',required=True);ap.add_argument('--ids',required=True);ap.add_argument('--label',required=True);args=ap.parse_args()
    if not args.label.isalnum():raise ValueError('Simple report label required')
    sys.path.insert(0,str(args.project/'tools'))
    from original_archive import OriginalArchive
    result=publish(args.project,args.staging,OriginalArchive(args.source),args.ids.split(','),args.proofs,source_kind=args.source_kind)
    path=args.project/'reports'/('native-source-exports-install-'+args.label+'.json.gz');path.parent.mkdir(parents=True,exist_ok=True)
    with gzip.GzipFile(filename=str(path),mode='wb',mtime=0) as stream:stream.write((json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode())
    print(json.dumps({'report':str(path),'added':len(result['added']),'alreadyCurrent':len(result['alreadyCurrent']),'sourceFramesVerified':result['sourceFramesVerified'],'copiedFiles':result['copiedFiles'],'existingBindingsPreserved':True}))

if __name__=='__main__':main()
