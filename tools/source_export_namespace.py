"""Isolate unpublished source-only bundles instead of replacing an existing asset."""
import copy,hashlib,json,re,shutil,uuid
from pathlib import Path,PurePosixPath
from atomic_json import write_json_atomic


def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def entry_digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()


def contained(root,relative):
    value=PurePosixPath(relative)
    if value.is_absolute() or '..' in value.parts or any(c in str(value) for c in ('\\',':')):
        raise ValueError('Source bundle escapes intended root')
    path=(Path(root)/str(value)).resolve()
    if not path.is_relative_to(Path(root).resolve()):raise ValueError('Source bundle follows external link')
    return path


def prepare_source_export_namespaces(project,stage,ids):
    project,stage=Path(project).resolve(),Path(stage).resolve()
    index_path=stage/'index.json';index=json.loads(index_path.read_bytes())
    published=json.loads((project/'public/assets/effects/native/index.json').read_bytes())
    working=copy.deepcopy(index);prepared=[];prefix='/assets/effects/native/'
    # Check every input before changing any entry or generated bundle.
    for key in ids:
        entry=working['sourceExports'][key]
        if (not re.fullmatch(r'source:[a-f0-9]{16}:[a-f0-9]{12}',key) or entry.get('sourceOnly') is not True
                or key in published.get('sourceExports',{})):
            raise ValueError('Namespace isolation only accepts unpublished exact source-only entries')
        before=entry_digest(entry);changes=[]
        for layer in entry['layers']:
            sequence=layer.get('sourceSequence')
            if sequence:
                relative=PurePosixPath(sequence['manifestPath']).parent
                target_root=project/'asset-source/native-effects'
            else:
                url=layer['animation']['url']
                if not url.startswith(prefix):raise ValueError('Unexpected native source URL')
                relative=PurePosixPath(url.removeprefix(prefix)).parent
                target_root=project/'public/assets/effects/native'
            folder=contained(stage,relative);conflicts=[]
            for name,sha in layer['artifactsSha256'].items():
                if Path(name).name!=name or Path(name).suffix not in ('.json','.png','.webp'):
                    raise ValueError('Unexpected source artifact filename')
                source=contained(folder,name);target=contained(target_root,relative/name)
                if digest(source)!=sha:raise ValueError('Prepared source artifact changed')
                if target.exists() and digest(target)!=sha:
                    conflicts.append({'path':target.relative_to(project).as_posix(),
                        'preservedSha256':digest(target),'preparedSha256':sha})
            if conflicts:
                source_key,action_key=key.split(':')[1:]
                new_relative=PurePosixPath('source-exports')/source_key/action_key/before[:16]
                if sequence:new_relative/='source-sequence'
                changes.append((layer,relative,new_relative,folder,conflicts))
        if changes:prepared.append((key,entry,before,changes))
    audit=[]
    for key,entry,before,changes in prepared:
        rows=[]
        for layer,old_relative,new_relative,folder,conflicts in changes:
            original_layer=copy.deepcopy(layer)
            destination=contained(stage,new_relative)
            temporary=stage/('.namespace-attempt-'+uuid.uuid4().hex);temporary.mkdir()
            for name in layer['artifactsSha256']:shutil.copyfile(folder/name,temporary/name)
            sequence=layer.get('sourceSequence')
            if sequence:sequence['manifestPath']=(new_relative/'manifest.json').as_posix()
            else:
                animation=layer['animation'];old_prefix=prefix+old_relative.as_posix()+'/'
                new_prefix=prefix+new_relative.as_posix()+'/'
                for field in ('url','packedAtlasUrl'):
                    if not animation[field].startswith(old_prefix):raise ValueError('Native reference escapes original bundle')
                    animation[field]=new_prefix+animation[field][len(old_prefix):]
                if 'atlasPageUrls' in animation:
                    if not all(url.startswith(old_prefix) for url in animation['atlasPageUrls']):
                        raise ValueError('Page reference escapes original bundle')
                    animation['atlasPageUrls']=[new_prefix+url[len(old_prefix):] for url in animation['atlasPageUrls']]
                manifest=json.loads((temporary/'manifest.json').read_bytes())
                manifest['animations']={'effect':copy.deepcopy(animation)}
                write_json_atomic(temporary/'manifest.json',manifest)
            output_hashes={name:digest(temporary/name) for name in layer['artifactsSha256']}
            destination.mkdir(parents=True,exist_ok=True)
            for name,sha in output_hashes.items():
                target=destination/name
                if target.exists() and digest(target)!=sha:
                    raise ValueError('Existing isolated bundle differs; preserve for review')
            for name in output_hashes:
                target=destination/name
                if not target.exists():shutil.copyfile(temporary/name,target)
            assert temporary.resolve().is_relative_to(stage)
            for name,sha in output_hashes.items():
                if digest(temporary/name)!=sha or digest(destination/name)!=sha:
                    raise ValueError('Isolated copy proof changed; preserve temporary files')
            for name in output_hashes:(temporary/name).unlink()
            temporary.rmdir()
            layer['artifactsSha256']=output_hashes
            assert layer['validation']==original_layer['validation'],'Namespace changes cannot alter pixel proofs'
            # Published files are only read, even when they are unused by combat.
            for conflict in conflicts:assert digest(project/conflict['path'])==conflict['preservedSha256']
            rows.append({'action':layer['action'],'plane':layer['plane'],'oldArtifactRoot':old_relative.as_posix(),
                'isolatedArtifactRoot':new_relative.as_posix(),'preservedPublishedArtifacts':conflicts,
                'frameRgbaProofUnchanged':True,'frames':layer['validation']['nativeFrames']})
        entry['sourceNamespaceReview']={'scope':'Unpublished source-only bundle isolated; existing published bytes preserved',
            'originalPreparedEntrySha256':before,'layers':rows}
        audit.append({'id':key,'source':entry['source'],'beforeEntrySha256':before,
            'afterEntrySha256':entry_digest(entry),'layers':rows})
    if audit:write_json_atomic(index_path,working)
    return {'state':'source-bundle-namespaces-reviewed','changed':audit,
        'publishedIndexChanged':False,'rasterRetried':False}
