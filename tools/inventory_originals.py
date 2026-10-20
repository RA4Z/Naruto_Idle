"""Resumable read-only archive inventory; hashes streamed by one worker."""
import argparse, collections, datetime, hashlib, json, os
from pathlib import Path
from original_archive import OriginalArchive

PROJECT=Path(__file__).resolve().parents[1]

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);args=ap.parse_args()
    archive=OriginalArchive(args.source)
    out=PROJECT/'assets-extraidos/manifestos';out.mkdir(parents=True,exist_ok=True)
    journal=out/'original-inventory.jsonl';previous={}
    if journal.exists():
        for line in journal.read_text(encoding='utf-8').splitlines():
            try:
                row=json.loads(line);previous[row['relativePath']]=row
            except json.JSONDecodeError: pass
    expected={r['tag']+'/'+p:r for p,r in archive.rows.items()}
    stats=collections.Counter();extensions=collections.Counter();total=0;present=set();hashed=0;duplicates=collections.defaultdict(list)
    with journal.open('a',encoding='utf-8') as log:
        for base, dirs, files in os.walk(archive.cdn,followlinks=False):
            dirs[:]=sorted(d for d in dirs if not (Path(base)/d).is_symlink())
            for name in sorted(files):
                p=Path(base)/name
                if p.is_symlink(): continue
                rel=p.relative_to(archive.cdn).as_posix();stat=p.stat();old=previous.get(rel)
                if old and old.get('bytes')==stat.st_size and old.get('mtimeNs')==stat.st_mtime_ns:
                    row=old;stats['reusedHashes']+=1
                else:
                    h=hashlib.sha256()
                    with p.open('rb') as stream:
                        for chunk in iter(lambda:stream.read(256*1024),b''): h.update(chunk)
                    if p.stat().st_mtime_ns!=stat.st_mtime_ns: raise RuntimeError('Source changed during inventory: '+rel)
                    row={'relativePath':rel,'bytes':stat.st_size,'mtimeNs':stat.st_mtime_ns,'sha256':h.hexdigest(),'state':'discovered'}
                    log.write(json.dumps(row,ensure_ascii=False)+'\n');log.flush();hashed+=1
                present.add(rel);extensions[p.suffix.lower() or '(none)']+=1;total+=stat.st_size;duplicates[row['sha256']].append(rel)
                if rel not in expected: stats['notInCurrentResourceManifest']+=1
                elif expected[rel].get('size')!=stat.st_size: stats['declaredSizeDiffers']+=1
                if len(present)%5000==0: print(json.dumps({'filesScanned':len(present),'newHashes':hashed}),flush=True)
    missing=[{'path':row['path'],'tag':row['tag']} for path,row in expected.items() if path not in present]
    groups=[{'sha256':h,'paths':paths} for h,paths in duplicates.items() if len(paths)>1]
    (out/'duplicate-originals.json').write_text(json.dumps(groups,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceRootLocal':str(archive.root),'inventoryScope':'recovered-web/cdn',
            'otherRootsPending':['flashlib','build','src','historical staging payloads'],
            'sizeNote':'Declared sizes and stored sizes differ for observed wrappers/compression; this counter alone does not establish corruption.',
            'manifestDeclaredAssets':len(archive.rows),'manifestDeclaredBytes':archive.manifest.get('declared_bytes'),
            'physicalFiles':len(present),'physicalBytes':total,'extensions':dict(extensions),'statistics':dict(stats),
            'missingManifestAssets':missing,'duplicateContentGroups':len(groups),'duplicatePaths':sum(len(g['paths']) for g in groups),
            'fullLocalInventory':'assets-extraidos/manifestos/original-inventory.jsonl','fullLocalDuplicateIndex':'assets-extraidos/manifestos/duplicate-originals.json',
            'policy':'single worker, streamed hashes, no source changes; discovered is not integrated',
            'integrationReports':['native-foreground-recovery.json','external-symbol-repairs.json','merge-validation.json'],
            'notYetIntegratedCategories':['remaining maps','middleground objects','unmapped jutsus and audio','original UI and loading artwork','item/quest/dialogue content mappings']}
    (PROJECT/'reports/original-inventory-summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:result[k] for k in ['physicalFiles','physicalBytes','duplicateContentGroups']}),flush=True)
if __name__=='__main__':main()
