"""Explicit recovery for static scene/primary-role jobs; resumes only proven intervals."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import time


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('source','project','output','work','java','ffdec','classes','reference-classes','equivalence-proof'):
        parser.add_argument('--'+name,required=True)
    parser.add_argument('--jobs',type=Path,required=True)
    parser.add_argument('--seconds',type=int,default=580)
    parser.add_argument('--interval-frames',type=int,default=16)
    args=parser.parse_args()
    if not 240<=args.seconds<=600 or not 1<=args.interval_frames<=32:
        raise ValueError('Explicit240..600second slice and1..32frame intervals required')
    deadline=time.monotonic()+args.seconds
    sys.path.insert(0,str(Path(args.project).resolve()/'tools'))
    from atomic_json import write_json_atomic
    from original_archive import OriginalArchive
    from scene_export_contract import scene_export_facts
    from role_export_contract import role_export_facts
    from swf_bytes import decode
    # The local helper is pinned together with the renderer by the pilot proof.
    from native_range_recovery import renderer_fingerprint,sha,render_intervals,pack_intervals
    jobs=json.loads(args.jobs.read_bytes())
    if not isinstance(jobs,list) or not 1<=len(jobs)<=4 or len({j['key'] for j in jobs})!=len(jobs):
        raise ValueError('One to four exact static source jobs required')
    fingerprint=renderer_fingerprint(args.classes,args.reference_classes,args.ffdec)
    proof=json.loads(Path(args.equivalence_proof).read_bytes())
    if (proof.get('state')!='range-renderer-equivalent-to-whole-render'
            or proof.get('rendererFingerprint')!=fingerprint
            or proof.get('helperSha256')!=sha(Path(__file__).with_name('native_range_recovery.py'))
            or len(proof.get('cases',[]))<2
            or not all(case.get('allFramesPixelExact') is True and case.get('frames',0)>0 for case in proof['cases'])
            or not any(case.get('freshWholeRender') is True for case in proof['cases'])):
        raise ValueError('Independent whole-render equivalence proof is missing or stale')
    archive=OriginalArchive(args.source);work=Path(args.work).resolve();output=Path(args.output).resolve()
    if work.is_relative_to(archive.root) or output.is_relative_to(archive.root):
        raise ValueError('Original archive is read-only')
    facts={}
    for job in jobs:
        kind=job.get('sourceKind')
        if kind not in ('scene-exported-sprite','role-left-exported-sprite'):
            raise ValueError('Only explicit static scene or primary-role recovery is supported')
        facts[job['key']]=(scene_export_facts if kind=='scene-exported-sprite' else role_export_facts)(archive,job)
    work.mkdir(parents=True,exist_ok=True);output.mkdir(parents=True,exist_ok=True)
    index_path=output/'index.json'
    index=json.loads(index_path.read_bytes()) if index_path.exists() else {'version':1,'effects':{},'sourceBundles':{},'sourceExports':{},'deferred':{}}
    for job in jobs:
        if shutil.disk_usage(work).free<8_000_000_000:
            raise RuntimeError('Below8GB reserve; preserve range checkpoint')
        key=job['key'];fact=facts[key];source_key,token=key.split(':')[1:]
        root=work/source_key/token;root.mkdir(parents=True,exist_ok=True)
        identity={'job':job,'facts':fact,'rendererFingerprint':fingerprint,
            'helperSha256':sha(Path(__file__).with_name('native_range_recovery.py')),
            'equivalenceProofSha256':sha(args.equivalence_proof)}
        ledger_path=root/'range-ledger.json'
        ledger=json.loads(ledger_path.read_bytes()) if ledger_path.exists() else {'version':1,'identity':identity,'ranges':[],'packed':{}}
        if key in index['sourceExports']:
            raise ValueError('Existing completed range source requires explicit publication review; never overwrite')
        decoded_payload=decode(archive.raw(job['resource']));decoded=root/'source.swf'
        if decoded.exists() and decoded.read_bytes()!=decoded_payload:
            raise ValueError('Resumed decoded source changed')
        if not decoded.exists():decoded.write_bytes(decoded_payload)
        classpath=str(Path(args.classes).resolve())+os.pathsep+str(Path(args.ffdec).resolve()/'lib/*')
        frames,metadata=render_intervals(root,ledger,identity,java=args.java,classpath=classpath,
            decoded=decoded,deadline=deadline,interval_frames=args.interval_frames)
        folder=output/source_key/token/'source-sequence'
        result=pack_intervals(root,folder,ledger,identity,deadline)
        if result is None:
            write_json_atomic(root/'range-ledger.json',ledger)
            print(json.dumps({'id':key,'state':'range-checkpoint-incomplete-not-published',
                'renderedFrames':len(frames),'expectedFrames':fact['authoredFrames'],
                'encodedUniqueFrames':len(ledger.get('packed',{}))}),flush=True)
            return
        sequence,validation=result
        source=job['source'];kind=job['sourceKind']
        entry={'id':key,'sourceOnly':True,'sourceKind':kind,'source':source,'sourceConfig':source,
            'bindingOrigin':'exported-source-action-not-a-skill-id','sourceExport':fact,
            'definition':{'id':key,'type':'0','res':job['resource'],'frontAction':job['action'],
                'sourceOnly':'true','sourceKind':kind,'name':Path(job['resource']).stem+' / '+job['action']},
            'state':'source-frames-complete-runtime-adapter-pending','layers':[]}
        sequence.update({'source':source,'sourceKind':kind,'sourceExport':fact})
        write_json_atomic(folder/'manifest.json',sequence)
        layer={'plane':'front','action':job['action'],'namedInstances':fact['namedInstances'],
            'sourceSequence':{'manifestPath':(folder/'manifest.json').relative_to(output).as_posix(),
                'runtimeAdapterRequired':True,'atlasLimitReason':'Explicit full-source sequence for bounded range recovery; no atlas allocation'},
            'validation':validation,
            'artifactsSha256':{name:sha(folder/name) for name in [*sequence['frameFiles'],'manifest.json']}}
        entry['layers']=[layer]
        entry['rangeRecovery']={'rendererFingerprint':fingerprint,'helperSha256':identity['helperSha256'],
            'equivalenceProofSha256':identity['equivalenceProofSha256'],'sourceExecution':False,
            'completeRanges':[{'start':r['start'],'endExclusive':r['endExclusive']} for r in ledger['ranges']],
            'ledgerSha256':sha(ledger_path)}
        if archive.record(job['resource'])!=source:
            raise ValueError('Original source changed during recovery')
        index['sourceExports'][key]=entry
        write_json_atomic(index_path,index)
        print(json.dumps({'id':key,'state':'range-sequence-prepared-needs-independent-installed-proof',
            'frames':fact['authoredFrames'],'uniqueFrames':len(sequence['frameFiles'])}),flush=True)


if __name__=='__main__':main()
