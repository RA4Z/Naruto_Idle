"""Install source-verified corrections with stale-edit and bitmap guards."""
import argparse,copy,gzip,hashlib,json,shutil,sys
from pathlib import Path

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def asset(root,url):
    if not url.startswith('/assets/') or any(c in url for c in ('\\','?', '#',':')):raise ValueError('Invalid asset URL')
    path=(root/'public'/url.lstrip('/')).resolve()
    if not path.is_relative_to((root/'public').resolve()):raise ValueError('Asset escapes public directory')
    return path

def main():
    ap=argparse.ArgumentParser()
    for name in ('source','project','staging'):ap.add_argument('--'+name,type=Path,required=True)
    ap.add_argument('--label',required=True);args=ap.parse_args()
    if not args.label.isalnum():raise ValueError('Simple report label required')
    project=args.project.resolve();stage=args.staging.resolve();sys.path.insert(0,str(project/'tools'))
    from original_archive import OriginalArchive
    from mme_config import read_config
    archive=OriginalArchive(args.source)
    if project.is_relative_to(archive.root) or stage.is_relative_to(archive.root):raise ValueError('Originals are read-only')
    extraction=json.loads((stage/'report.json').read_bytes());proofs={}
    for path in (stage/'reports').glob('*.json'):
        data=json.loads(path.read_bytes())
        if data.get('allTimelineFrames') is not True:continue
        for proof in data.get('actions',[]):
            if all(proof.get(k) is True for k in ('timingAndTimelineMatch','groundOffsetsAndPixelsMatch','sourceHashesPreserved')):
                proofs[(proof['id'],proof['mode'],proof['action'],proof.get('rendererRevision'),proof['atlasSha256'])]=proof
    report={'version':1,'label':args.label,'models':{},'corrected':0,'alreadyCurrent':0,'sourceFramesVerified':0,'mechanicalUnlocksChanged':False,'sourceExecution':False}
    for ident,row in extraction['models'].items():
        changes=row.get('replacedExistingActions',[])
        if not changes:continue
        evidence=row['source'];assert archive.record(evidence['path'])==evidence,'Source changed'
        _,_,configuration=read_config(archive.raw(evidence['path']),action_names={change['action'] for change in changes})
        path=asset(project,row['manifest']);before_bytes=path.read_bytes();current=json.loads(before_bytes);original=copy.deepcopy(current)
        candidate=json.loads(asset(stage,row['manifest']).read_bytes());mode=row['mode'];installed=[]
        for change in changes:
            name=change['action'];definition=copy.deepcopy(candidate['modes'][mode]['animations'][name])
            if definition.get('sourceConfiguration')!=configuration or definition.get('sourceEvidence')!=evidence or definition.get('sourceAction')!=name:raise ValueError('Correction is not pinned to the preferred original data')
            core=definition['configurationPreferenceEvidence'];assert archive.record(core['path'])==core,'Original core changed'
            bitmap=asset(stage,definition['url']);sha=digest(bitmap)
            key=(ident,mode,name,definition.get('rendererRevision'),sha);proof=proofs.get(key)
            if proof is None or proof.get('sourceConfiguration')!=configuration:raise ValueError('Missing preferred-source all-frame proof')
            if proof['sampledTimelineFrames']!=list(range(len(definition['timeline']))):raise ValueError('Incomplete source frame coverage')
            live=current['modes'][mode]['animations'][name];normalized=copy.deepcopy(definition);normalized['url']=live['url']
            if live==normalized and digest(asset(project,live['url']))==sha:
                report['alreadyCurrent']+=1;continue
            if live!=change['before']:raise ValueError('Current action was edited after extraction: '+ident+'/'+name)
            if digest(asset(project,live['url']))!=change['beforeBitmapSha256']:raise ValueError('Current bitmap changed after extraction')
            target=asset(project,definition['url'])
            if target.exists() and digest(target)!=sha:
                target=target.with_name(target.stem+'-preferred-'+sha[:12]+target.suffix)
                definition['url']='/'+target.relative_to(project/'public').as_posix()
            if target.exists() and digest(target)!=sha:raise ValueError('Content-addressed target collision')
            target.parent.mkdir(parents=True,exist_ok=True)
            if not target.exists():shutil.copy2(bitmap,target)
            if digest(target)!=sha:raise ValueError('Copied source pixels changed')
            current['modes'][mode]['animations'][name]=definition
            installed.append({'action':name,'before':change['before'],'beforeBitmapSha256':change['beforeBitmapSha256'],'after':definition,'atlasSha256':sha})
            report['corrected']+=1;report['sourceFramesVerified']+=len(definition['timeline'])
        if installed:
            reverted=copy.deepcopy(current)
            for item in installed:reverted['modes'][mode]['animations'][item['action']]=item['before']
            assert reverted==original,'A non-action field changed'
            if path.read_bytes()!=before_bytes:raise ValueError('Manifest was edited during installation')
            temporary=path.with_suffix('.json.tmp');temporary.write_text(json.dumps(current,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');temporary.replace(path)
        report['models'][ident]={'mode':mode,'manifest':row['manifest'],'source':evidence,'sourceConfiguration':configuration,'changes':installed,'nonActionFieldsPreserved':True}
    target=project/'reports'/('source-corrections-'+args.label+'.json.gz');target.parent.mkdir(parents=True,exist_ok=True)
    with gzip.GzipFile(filename=str(target),mode='wb',mtime=0) as stream:stream.write((json.dumps(report,ensure_ascii=False,separators=(',',':'))+'\n').encode())
    print(json.dumps({k:v for k,v in report.items() if k!='models'}))

if __name__=='__main__':main()
