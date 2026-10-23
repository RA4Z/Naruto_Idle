"""Remove only generated effect rasters identical to published bytes AND local Git LFS."""
import argparse,gzip,hashlib,json,re
from pathlib import Path,PurePosixPath

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def prune(project,stage,apply=False):
    project=project.resolve();stage=stage.resolve()
    if project==stage or project.is_relative_to(stage) or stage.is_relative_to(project):raise ValueError('Independent generated staging root required')
    staged=json.loads((stage/'index.json').read_bytes())
    installed=json.loads((project/'public/assets/effects/native/index.json').read_bytes())
    removed=[];candidates=[];skipped=[];seen=set()
    for section in ('effects','sourceBundles','sourceExports'):
        for ident,entry in staged.get(section,{}).items():
            if installed.get(section,{}).get(ident)!=entry:continue
            for layer in entry['layers']:
                sequence=layer.get('sourceSequence')
                if sequence:relative=PurePosixPath(sequence['manifestPath']).parent;target_root=project/'asset-source/native-effects'
                else:
                    prefix='/assets/effects/native/';url=layer['animation']['url']
                    if not url.startswith(prefix):raise ValueError('Unexpected review raster URL')
                    relative=PurePosixPath(url.removeprefix(prefix)).parent;target_root=project/'public/assets/effects/native'
                if relative.is_absolute() or '..' in relative.parts or any(c in str(relative) for c in ('\\',':')):raise ValueError('Generated relative path escapes root')
                for name,digest in layer['artifactsSha256'].items():
                    if Path(name).suffix.lower() not in ('.webp','.png'):continue
                    if Path(name).name!=name or not re.fullmatch('[0-9a-f]{64}',digest):raise ValueError('Unexpected generated artifact record')
                    temporary=(stage/str(relative)/name).resolve();target=(target_root/str(relative)/name).resolve()
                    if not temporary.is_relative_to(stage) or not target.is_relative_to(target_root.resolve()):raise ValueError('Artifact follows an external link')
                    if temporary in seen or not temporary.is_file():continue
                    seen.add(temporary);lfs=project/'.git/lfs/objects'/digest[:2]/digest[2:4]/digest
                    if not target.is_file() or not lfs.is_file():skipped.append({'file':str(temporary),'reason':'Published file and local LFS copy both required'});continue
                    snapshot=temporary.stat()
                    if any(sha(p)!=digest for p in (temporary,target,lfs)):skipped.append({'file':str(temporary),'reason':'SHA mismatch; preserved'});continue
                    item={'file':str(temporary),'publishedFile':str(target),'sha256':digest,'bytes':snapshot.st_size,'id':ident}
                    candidates.append(item)
                    if apply:
                        current=temporary.stat()
                        if (current.st_size,current.st_mtime_ns)!=(snapshot.st_size,snapshot.st_mtime_ns) or sha(temporary)!=digest:raise ValueError('Generated file changed before deletion')
                        temporary.unlink();removed.append(item)
    return {'version':1,'applied':apply,'candidates':candidates,'removed':removed,'removedBytes':sum(i['bytes'] for i in removed),'skipped':skipped,
            'policy':'Generated raster copies only; exact installed entry and SHA equality with published file plus local LFS. Original sources, manifests, reports, published files and Git/LFS objects preserved. Revalidate retained installed copies, not pruned staging rasters.'}

def main():
    ap=argparse.ArgumentParser()
    for key in ('project','staging','report'):ap.add_argument('--'+key,type=Path,required=True)
    ap.add_argument('--apply',action='store_true');args=ap.parse_args()
    result=prune(args.project,args.staging,args.apply);args.report.parent.mkdir(parents=True,exist_ok=True)
    with gzip.GzipFile(filename=str(args.report),mode='wb',mtime=0) as f:f.write(json.dumps(result,ensure_ascii=False,separators=(',',':')).encode())
    print(json.dumps({'removedFiles':len(result['removed']),'removedBytes':result['removedBytes'],'skippedFiles':len(result['skipped'])}))

if __name__=='__main__':main()
