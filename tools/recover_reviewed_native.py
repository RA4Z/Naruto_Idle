"""Recover audited larger static canvases only when existing runtime atlases still fit."""
import argparse,hashlib,json,os,shutil,sys,time
from pathlib import Path


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    for name in ('source','project','output','work','java','ffdec','classes','reference-classes','bounds-classes','equivalence-proof'):
        ap.add_argument('--'+name,required=True)
    ap.add_argument('--jobs',type=Path,required=True);ap.add_argument('--seconds',type=int,default=480)
    args=ap.parse_args()
    if not 240<=args.seconds<=600:raise ValueError('Explicit240..600second slice required')
    deadline=time.monotonic()+args.seconds
    sys.path.insert(0,str(Path(args.project).resolve()/'tools'))
    from original_archive import OriginalArchive
    from atomic_json import write_json_atomic
    from swf_bytes import decode
    from static_effect_export_contract import static_effect_export_facts
    from reviewed_range_recovery import renderer_fingerprint,sha,render_intervals,verified_frames,contained
    from reviewed_native_budget import probe_original_bounds,preflight_atlas
    from pack_native_frames import pack
    archive=OriginalArchive(args.source);output=Path(args.output).resolve();work=Path(args.work).resolve()
    if output.is_relative_to(archive.root) or work.is_relative_to(archive.root):raise ValueError('Original archive is read-only')
    jobs=json.loads(args.jobs.read_bytes())
    if not isinstance(jobs,list) or not 1<=len(jobs)<=4 or len({j['key'] for j in jobs})!=len(jobs):
        raise ValueError('One to four audited static effect jobs required')
    facts={j['key']:static_effect_export_facts(archive,j) for j in jobs}
    fingerprint=renderer_fingerprint(args.classes,args.reference_classes,args.ffdec)
    equivalence=json.loads(Path(args.equivalence_proof).read_bytes())
    if (equivalence.get('state')!='reviewed-renderer-equivalent-to-whole-render'
            or equivalence.get('rendererFingerprint')!=fingerprint
            or equivalence.get('helperSha256')!=sha(Path(__file__).with_name('reviewed_range_recovery.py'))
            or len(equivalence.get('cases',[]))<2 or not all(c.get('allFramesPixelExact') for c in equivalence['cases'])
            or not any(c.get('freshWholeRender') for c in equivalence['cases'])):
        raise ValueError('Reviewed renderer equivalence proof missing or stale')
    output.mkdir(parents=True,exist_ok=True);work.mkdir(parents=True,exist_ok=True)
    index_path=output/'index.json'
    index=json.loads(index_path.read_bytes()) if index_path.exists() else {'version':1,'effects':{},'sourceExports':{},'sourceBundles':{},'deferred':{}}
    for job in jobs:
        key=job['key'];fact=facts[key];source_key,token=key.split(':')[1:]
        if key in index['sourceExports']:raise ValueError('Existing reviewed export requires publication review, never overwrite')
        if shutil.disk_usage(work).free<8_000_000_000:raise RuntimeError('Below8GB reserve; preserve checkpoint')
        root=work/source_key/token;root.mkdir(parents=True,exist_ok=True)
        bounds=probe_original_bounds(archive,job,java=args.java,ffdec=args.ffdec,classes=args.bounds_classes,
            work=work/'bounds-probes',project=args.project)
        if not (16_000_000<bounds['pixels']<=32_000_000 and max(bounds['width'],bounds['height'])<=8192
                and bounds['symbolId']==fact['symbolId'] and bounds['frames']==fact['authoredFrames'] and bounds['fps']==fact['fps']):
            raise ValueError('Source does not match explicitly reviewed offline canvas scope')
        identity={'job':job,'facts':fact,'rendererFingerprint':fingerprint,'independentBounds':bounds,
            'maximumNativePixels':32_000_000,'helperSha256':sha(Path(__file__).with_name('reviewed_range_recovery.py')),
            'equivalenceProofSha256':sha(args.equivalence_proof)}
        ledger_path=root/'range-ledger.json'
        ledger=json.loads(ledger_path.read_bytes()) if ledger_path.exists() else {'version':1,'identity':identity,'ranges':[]}
        decoded=root/'source.swf';payload=decode(archive.raw(job['resource']))
        if decoded.exists() and decoded.read_bytes()!=payload:raise ValueError('Reviewed decoded source changed')
        if not decoded.exists():decoded.write_bytes(payload)
        frames,metadata=render_intervals(root,ledger,identity,java=args.java,
            classpath=str(Path(args.classes).resolve())+os.pathsep+str(Path(args.ffdec).resolve()/'lib/*'),
            decoded=decoded,deadline=deadline,interval_frames=16)
        if len(frames)!=fact['authoredFrames'] or deadline-time.monotonic()<120:
            write_json_atomic(ledger_path,ledger)
            print(json.dumps({'id':key,'state':'reviewed-native-checkpoint-not-published','frames':len(frames)}),flush=True);return
        try:preflight=preflight_atlas(root,ledger,identity,verified_frames)
        except ValueError as error:
            if not any(text in str(error) for text in ('requires a tiled runtime adapter','atlas ceiling')):raise
            index['deferred'][key]={'id':key,'source':job['source'],'state':'native-render-complete-runtime-atlas-review-pending',
                'reason':str(error),'frames':len(frames),'preservedNativeLedgerSha256':sha(ledger_path)}
            write_json_atomic(index_path,index);print(json.dumps(index['deferred'][key]),flush=True);return
        native=root/'complete-native';native.mkdir(exist_ok=True)
        expected={f'{r["frame"]:04d}.png' for r in frames}
        if {p.name for p in native.glob('*.png')}-expected:raise ValueError('Unexpected reviewed native frame in packing folder')
        for record in frames:
            source=contained(root,record['path']);target=native/f'{record["frame"]:04d}.png'
            if target.exists():
                if sha(target)!=record['fileSha256']:raise ValueError('Reviewed native link changed')
            else:
                try:os.link(source,target)
                except OSError:shutil.copyfile(source,target)
        write_json_atomic(native/'render.json',metadata);write_json_atomic(native/'named-instances.json',fact['namedInstances'])
        folder=output/source_key/token;url=f'/assets/effects/native/{source_key}/{token}'
        try:animation,validation=pack(native,folder,url,atlas_format='webp',allow_pages=True)
        except ValueError as error:
            if not any(text in str(error) for text in ('Packed atlas exceeds explicit pixel budget','Multi-page atlas exceeds','A single native frame exceeds')):raise
            index['deferred'][key]={'id':key,'source':job['source'],'state':'native-render-complete-runtime-atlas-review-pending',
                'reason':str(error),'frames':len(frames),'preservedNativeLedgerSha256':sha(ledger_path)}
            write_json_atomic(index_path,index);print(json.dumps(index['deferred'][key]),flush=True);return
        if validation['frameRgbaSha256']!=[r['rgbaSha256'] for r in frames]:
            raise ValueError('Reviewed atlas source proof differs from native range renders')
        entry={'id':key,'sourceOnly':True,'sourceKind':job['sourceKind'],'source':job['source'],'sourceConfig':job['source'],
            'bindingOrigin':'exported-source-action-not-a-skill-id','sourceExport':fact,
            'definition':{'id':key,'type':'0','res':job['resource'],'frontAction':job['action'],'sourceOnly':'true',
                'sourceKind':job['sourceKind'],'name':Path(job['resource']).stem+' / '+job['action']},
            'state':'native-assets-prepared-source-review',
            'offlineRenderBudget':{'scope':'offline-native-render-and-proof-only','maximumNativePixels':32_000_000,
                'maximumRuntimePagePixels':16_000_000,'maximumRuntimeAtlasPixels':64_000_000,'independentBounds':bounds,
                'equivalenceProofSha256':identity['equivalenceProofSha256'],'rendererFingerprint':fingerprint,'preflight':preflight},'layers':[]}
        manifest=json.loads((folder/'manifest.json').read_bytes())
        manifest.update({'source':job['source'],'sourceKind':job['sourceKind'],'sourceExport':fact,'validation':validation,
            'animations':{'effect':animation},'offlineRenderBudget':entry['offlineRenderBudget']})
        write_json_atomic(folder/'manifest.json',manifest)
        names=[Path(u).name for u in animation.get('atlasPageUrls',[animation['url']])]+['manifest.json','effect-atlas.json']
        entry['layers']=[{'plane':'front','action':job['action'],'namedInstances':fact['namedInstances'],
            'animation':animation,'validation':validation,'artifactsSha256':{name:sha(folder/name) for name in names}}]
        if archive.record(job['resource'])!=job['source']:raise ValueError('Original source changed during reviewed recovery')
        index['sourceExports'][key]=entry;index['deferred'].pop(key,None);write_json_atomic(index_path,index)
        print(json.dumps({'id':key,'state':'reviewed-atlas-prepared-needs-installed-proof','frames':fact['authoredFrames'],
            'fps':fact['fps'],'nativeCanvasSize':validation['nativeCanvasSize'],'runtimeAtlasPixels':validation['atlasPixels']}),flush=True)


if __name__=='__main__':main()
