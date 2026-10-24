"""Bounded static extraction of explicitly planned scene visuals, separate from battle jobs."""
import argparse,hashlib,json,os,shutil,subprocess,sys
from pathlib import Path
from atomic_json import write_json_atomic
from pack_native_frames import pack
from pack_native_sequence import pack_sequence
from scene_export_contract import scene_export_facts
from swf_bytes import decode


def main():
    ap=argparse.ArgumentParser()
    for name in ('source','project','output','work','java','ffdec','classes'):ap.add_argument('--'+name,required=True)
    ap.add_argument('--jobs',type=Path,required=True)
    ap.add_argument('--render-timeout',type=int,default=180)
    args=ap.parse_args()
    if not 30<=args.render_timeout<=900:raise ValueError('Explicit renderer budget30..900seconds required')
    jobs=json.loads(args.jobs.read_bytes())
    if not isinstance(jobs,list) or not 1<=len(jobs)<=4 or len({j['key'] for j in jobs})!=len(jobs):raise ValueError('One to four exact scene jobs required')
    sys.path.insert(0,str(Path(args.project).resolve()/'tools'))
    from original_archive import OriginalArchive
    archive=OriginalArchive(args.source);output=Path(args.output).resolve();work=Path(args.work).resolve()
    if output.is_relative_to(archive.root) or work.is_relative_to(archive.root):raise ValueError('Original sources are read-only')
    # Validate every job against original bytes before producing any output.
    facts={job['key']:scene_export_facts(archive,job) for job in jobs}
    output.mkdir(parents=True,exist_ok=True);work.mkdir(parents=True,exist_ok=True)
    index_path=output/'index.json'
    index=json.loads(index_path.read_bytes()) if index_path.exists() else {'version':1,'effects':{},'sourceBundles':{},'sourceExports':{},'deferred':{}}
    if any(job['key'] in index['sourceExports'] for job in jobs):raise ValueError('Existing scene export requires explicit review; never overwrite')
    profile=work/'jpexs-profile';profile.mkdir(parents=True,exist_ok=True)
    environment=os.environ.copy();environment['APPDATA']=str(profile);environment['LOCALAPPDATA']=str(profile)
    for job in jobs:
        if shutil.disk_usage(output).free<8_000_000_000:raise RuntimeError('Below8GB free; checkpoint preserved, no new scene rendering')
        ident=job['key'];fact=facts[ident];source=job['source'];source_key,token=ident.split(':')[1:]
        source_work=work/source_key;source_work.mkdir(exist_ok=True)
        native=source_work/str(fact['symbolId']);folder=output/source_key/token
        entry={'id':ident,'sourceOnly':True,'sourceKind':'scene-exported-sprite',
               'bindingOrigin':'exported-source-action-not-a-skill-id','source':source,'sourceConfig':source,
               'sourceExport':fact,'definition':{'id':ident,'type':'0','res':job['resource'],'frontAction':job['action'],
               'sourceOnly':'true','sourceKind':'scene-exported-sprite','name':Path(job['resource']).stem+' / '+job['action']},'layers':[]}
        try:
            decoded=source_work/'source.swf';decoded.write_bytes(decode(archive.raw(job['resource'])))
            command=[args.java,'-Djava.awt.headless=true','-Duser.home='+str(profile),'-Xmx1024m','-cp',
                     str(Path(args.classes).resolve())+os.pathsep+str(Path(args.ffdec).resolve()/'lib/*'),
                     'StaticSwfRender',str(decoded),str(fact['symbolId']),str(native)]
            subprocess.run(command,check=True,timeout=args.render_timeout,capture_output=True,env=environment)
            metadata=json.loads((native/'render.json').read_bytes());points=json.loads((native/'named-instances.json').read_bytes())
            if metadata['symbolId']!=fact['symbolId'] or metadata['frameCount']!=fact['authoredFrames'] or metadata['fps']!=fact['fps'] or points!=fact['namedInstances']:
                raise ValueError('Scene renderer metadata differs from independent original source facts')
            layer={'plane':'front','action':job['action'],'namedInstances':points}
            try:
                animation,proof=pack(native,folder,f'/assets/effects/native/{source_key}/{token}',atlas_format='webp',allow_pages=True)
                layer['animation']=animation;artifact_folder=folder
                names=tuple(Path(url).name for url in animation.get('atlasPageUrls',[animation['url']]))+('effect-atlas.json','manifest.json')
            except ValueError as error:
                if not any(text in str(error) for text in ('Packed atlas exceeds explicit pixel budget','Multi-page atlas exceeds','A single native frame exceeds')):raise
                artifact_folder=folder/'source-sequence';sequence,proof=pack_sequence(native,artifact_folder)
                layer['sourceSequence']={'manifestPath':(artifact_folder/'manifest.json').relative_to(output).as_posix(),'runtimeAdapterRequired':True,'atlasLimitReason':str(error)}
                names=tuple(sequence['frameFiles'])+('manifest.json',)
            layer['validation']=proof
            manifest=json.loads((artifact_folder/'manifest.json').read_bytes())
            manifest.update({'source':source,'validation':proof,'sourceKind':entry['sourceKind'],'sourceExport':fact})
            if layer.get('animation'):manifest['animations']={'effect':layer['animation']}
            write_json_atomic(artifact_folder/'manifest.json',manifest)
            layer['artifactsSha256']={name:hashlib.sha256((artifact_folder/name).read_bytes()).hexdigest() for name in names}
            if archive.record(job['resource'])!=source:raise ValueError('Original scene bytes changed during rendering')
            entry['layers']=[layer];entry['state']='source-frames-complete-runtime-adapter-pending' if layer.get('sourceSequence') else 'native-assets-prepared-source-review'
            index['sourceExports'][ident]=entry;index['deferred'].pop(ident,None)
            # Drop only generated intermediates after persisted artifact hashes exist.
            if not native.resolve().is_relative_to(work):raise ValueError('Generated scene frames escape work root')
            for frame in native.glob('*.png'):
                try:frame.unlink()
                except PermissionError:pass  # Leave locked generated intermediates; do not change source readiness.
            print(json.dumps({'id':ident,'state':entry['state'],'frames':fact['authoredFrames']}),flush=True)
        except (ValueError,OSError,KeyError,subprocess.SubprocessError) as error:
            detail=error.stderr.decode('utf-8',errors='replace')[-1600:] if isinstance(error,subprocess.CalledProcessError) and error.stderr else None
            index['deferred'][ident]={'id':ident,'source':source,'sourceKind':'scene-exported-sprite','reason':type(error).__name__+': '+str(error),'rendererDetail':detail,'state':'not-substituted'}
            print(json.dumps(index['deferred'][ident]),flush=True)
        write_json_atomic(index_path,index)

if __name__=='__main__':main()
