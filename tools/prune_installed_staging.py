"""Prune only generated PNG duplicates verified in the project AND local LFS."""
import argparse,gzip,hashlib,json,re
from pathlib import Path

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def asset(root,url):
    if not url.startswith('/assets/') or any(c in url for c in ('\\',':','?','#')):raise ValueError('Invalid generated asset URL')
    path=(root/'public'/url.lstrip('/')).resolve()
    if not path.is_relative_to((root/'public').resolve()):raise ValueError('Generated path escapes staging/public')
    return path

def prune(project,stage,milestone,apply=False):
    project=project.resolve();stage=stage.resolve()
    if project==stage or not (stage/'report.json').is_file():raise ValueError('A separate generated staging tree is required')
    installed=json.loads(gzip.decompress(milestone.read_bytes()));current=json.loads((stage/'report.json').read_bytes())
    known={(ident,row.get('mode','battle'),a['action']):a for ident,row in installed['models'].items() for a in row['added']}
    keep=set();candidates=[];skipped=[];lfs_verified=set();seen=set()
    for ident,row in current['models'].items():
        if not row['added']:continue
        manifest=json.loads(asset(stage,row['manifest']).read_bytes());mode=row.get('mode','battle')
        for action in row['added']:
            name=action['action'];bitmap=asset(stage,manifest['modes'][mode]['animations'][name]['url'])
            if (ident,mode,name) not in known:keep.add(bitmap)
            else:candidates.append((bitmap,known[(ident,mode,name)]))
    verified=[]
    for bitmap,item in candidates:
        if bitmap in seen or bitmap in keep:continue
        seen.add(bitmap)
        if not bitmap.is_file():continue
        sha=item['atlasSha256'];target=asset(project,item['url'])
        if not re.fullmatch(r'[0-9a-f]{64}',sha) or bitmap.suffix.lower()!='.png':raise ValueError('Unexpected temporary bitmap record')
        lfs=project/'.git/lfs/objects'/sha[:2]/sha[2:4]/sha
        if not target.is_file() or not lfs.is_file():skipped.append({'file':str(bitmap),'reason':'Both verified copies are required'});continue
        if digest(bitmap)!=sha or digest(target)!=sha:skipped.append({'file':str(bitmap),'reason':'Staged/project bytes differ from installed proof'});continue
        if sha not in lfs_verified:
            if digest(lfs)!=sha:skipped.append({'file':str(bitmap),'reason':'LFS object hash differs'});continue
            lfs_verified.add(sha)
        stat=bitmap.stat();verified.append({'file':str(bitmap),'canonicalUrl':item['url'],'sha256':sha,'bytes':stat.st_size,'mtimeNs':stat.st_mtime_ns})
    removed=[]
    if apply:
        for item in verified:
            bitmap=Path(item['file']);stat=bitmap.stat()
            if stat.st_size!=item['bytes'] or stat.st_mtime_ns!=item['mtimeNs'] or digest(bitmap)!=item['sha256']:
                skipped.append({'file':str(bitmap),'reason':'Generated file changed before pruning'});continue
            try:bitmap.unlink()
            except OSError as error:skipped.append({'file':str(bitmap),'reason':str(error)});continue
            removed.append(item)
    return {'version':1,'applied':apply,'milestoneSha256':digest(milestone),'safeCandidates':len(verified),'candidateBytes':sum(i['bytes'] for i in verified),
            'removed':removed,'removedBytes':sum(i['bytes'] for i in removed),'keptUninstalledPaths':len(keep),'skipped':skipped,
            'policy':'Only generated staging PNG duplicates matching installed proof, project bytes and immutable local LFS object. No source, manifest, report, backup or project/LFS file deleted.'}

def main():
    ap=argparse.ArgumentParser()
    for name in ('project','staging','milestone','report'):ap.add_argument('--'+name,type=Path,required=True)
    ap.add_argument('--apply',action='store_true');args=ap.parse_args()
    result=prune(args.project,args.staging,args.milestone,args.apply)
    args.report.parent.mkdir(parents=True,exist_ok=True)
    with gzip.GzipFile(filename=str(args.report),mode='wb',mtime=0) as stream:stream.write((json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n').encode())
    print(json.dumps({k:v for k,v in result.items() if k not in ('removed','skipped')}|{'removedFiles':len(result['removed']),'skippedFiles':len(result['skipped'])}))

if __name__=='__main__':main()
