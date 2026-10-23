"""Bounded native effect extraction from exact Effect.xml resource/symbol bindings."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import xml.etree.ElementTree as ET
from pack_native_frames import pack
from pack_native_sequence import pack_sequence


def save(path,data):
    path.parent.mkdir(parents=True,exist_ok=True);temporary=path.with_suffix(path.suffix+'.tmp')
    temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');temporary.replace(path)

def source_action_data(root,evidence,name):
    """Keep original keyframes, events and points for future world attachments."""
    action=next((a for a in root.findall('action') if a.get('name')==name),None)
    if action is None:raise ValueError('Exact MME source action absent: '+name)
    needed={e.get('assetId') for e in action.iter('element')}
    return {'configurationEvidence':evidence,'fps':root.get('frameRate'),'action':name,
            'coordinateModel':'original-MME-keyframes-not-world-attachments',
            'actionXml':ET.tostring(action,encoding='unicode'),
            'assetRegistrations':[dict(a.attrib) for a in root.findall('asset') if a.get('id') in needed],
            'externalNames':sorted({e.get('extname') for e in action.iter('element') if e.get('extname')}),
            'namedPoints':[{'layer':dict(layer.attrib),'frame':dict(frame.attrib),'point':dict(point.attrib)} for layer in action.findall('layer') for frame in layer.findall('frame') for point in frame.findall('pointElement')]}


def cached_layer(index,source,action,output,renderer_fingerprint=None):
    """Reuse only exact source/action pairs whose persisted artifacts still match."""
    for entry in [*index['effects'].values(),*index.get('sourceBundles',{}).values(),*index.get('sourceExports',{}).values()]:
        if entry.get('source')!=source:continue
        for layer in entry['layers']:
            if layer['action']!=action or not layer['validation'].get('allFramesPixelExact'):continue
            if renderer_fingerprint is not None and layer['validation'].get('rendererSemanticFingerprint')!=renderer_fingerprint:continue
            relative=Path(layer['sourceSequence']['manifestPath']).parent if layer.get('sourceSequence') else Path(layer['animation']['url'].removeprefix('/assets/effects/native/')).parent
            if relative.is_absolute() or '..' in relative.parts:continue
            folder=output/relative
            artifacts=layer.get('artifactsSha256',{})
            if not artifacts:continue
            if all(Path(name).name==name and (folder/name).is_file() and hashlib.sha256((folder/name).read_bytes()).hexdigest()==digest for name,digest in artifacts.items()):
                return copy.deepcopy(layer)
    return None


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--project',required=True)
    parser.add_argument('--output',required=True);parser.add_argument('--work',required=True);parser.add_argument('--java',required=True)
    parser.add_argument('--ffdec',required=True);parser.add_argument('--classes',required=True)
    selection=parser.add_mutually_exclusive_group(required=True);selection.add_argument('--ids');selection.add_argument('--jobs',type=Path,help='One to four explicit exported source action jobs; never a skill ID')
    parser.add_argument('--atlas-format',choices=('png','webp'),default='png')
    parser.add_argument('--allow-pages',action='store_true',help='Split large atlases into bounded lossless pages instead of reducing resolution')
    parser.add_argument('--discard-native-frames',action='store_true',help='Remove only generated PNG intermediates after a verified atlas is persisted')
    args=parser.parse_args();ids=args.ids.split(',') if args.ids else []
    if args.ids and (not 1<=len(ids)<=4 or len(set(ids))!=len(ids) or any(not re.fullmatch(r'\d+',i) for i in ids)):raise ValueError('One to four explicit effect IDs required')
    sys.path.insert(0,str(Path(args.project).resolve()/'tools'))
    from original_archive import OriginalArchive
    from entity_pipeline import tags
    from swf_bytes import decode
    archive=OriginalArchive(args.source);output=Path(args.output).resolve();work=Path(args.work).resolve()
    if output.is_relative_to(archive.root) or work.is_relative_to(archive.root):raise ValueError('Originals are read-only')
    config='assets/battle/Effect.xml';config_record=archive.record(config)
    definitions={row.get('id'):row for row in ET.fromstring(archive.data(config))}
    if args.jobs:
        jobs=json.loads(args.jobs.read_bytes())
        if not isinstance(jobs,list) or not 1<=len(jobs)<=4:raise ValueError('One to four explicit source action jobs required')
        definitions={}
        for job in jobs:
            logical,action=job['resource'],job['action']
            if not isinstance(logical,str) or not logical.startswith('assets/battle/effect/') or logical not in archive.rows or not isinstance(action,str) or not 1<=len(action)<=512:raise ValueError('Invalid exported source action job')
            key='source:'+hashlib.sha256(logical.encode()).hexdigest()[:16]+':'+hashlib.sha256(action.encode()).hexdigest()[:12]
            if key in definitions:raise ValueError('Duplicate source action job')
            definitions[key]=ET.Element('effect',{'id':key,'type':'0','res':logical,'frontAction':action,'sourceOnly':'true','name':Path(logical).stem+' / '+action})
        ids=list(definitions)

    index_path=output/'index.json';index=json.loads(index_path.read_text(encoding='utf-8')) if index_path.exists() else {'version':1,'effects':{},'deferred':{}}
    index.setdefault('sourceBundles',{});index.setdefault('sourceExports',{})
    profile=work/'jpexs-profile';profile.mkdir(parents=True,exist_ok=True)
    environment=os.environ.copy();environment['APPDATA']=str(profile);environment['LOCALAPPDATA']=str(profile)
    for ident in ids:
        row=definitions[ident];logical=row.get('res','');entry={'id':ident,'definition':dict(row.attrib),'sourceConfig':config_record,'layers':[]}
        try:
            if row.get('type')!='0' or logical not in archive.rows or not logical.startswith('assets/battle/effect/'):
                raise ValueError('Binding is procedural, shared, or missing; needs a specific adapter')
            before=archive.record(logical);raw=archive.raw(logical);records=list(tags(raw));entry['source']=before
            if args.jobs:entry.update({'sourceOnly':True,'bindingOrigin':'exported-source-action-not-a-skill-id','sourceConfig':before})
            xml=next((p[6:] for k,p in records if k==87 and p[6:].lstrip().startswith(b'<actions')),None)
            symbols={};sprite_ids=set()
            for kind,payload in records:
                if kind==39:sprite_ids.add(struct.unpack_from('<H',payload)[0])
                if kind==76:
                    count=struct.unpack_from('<H',payload)[0];position=2
                    for _ in range(count):
                        symbol=struct.unpack_from('<H',payload,position)[0];position+=2;end=payload.index(b'\0',position)
                        symbols[payload[position:end].decode()]=symbol;position=end+1
            source_key=hashlib.sha256(logical.encode()).hexdigest()[:16];source_work=work/source_key
            source_work.mkdir(parents=True,exist_ok=True);decoded=source_work/'source.swf';decoded.write_bytes(decode(raw))
            native_root=source_config=None
            if xml:
                from mme_config import read_config
                native_root,_,source_config=read_config(raw,action_names={row.get(field) for field in ('backAction','frontAction') if row.get(field)})
            for field,plane in (('backAction','back'),('frontAction','front')):
                action=row.get(field)
                if not action:continue
                token=hashlib.sha256(action.encode()).hexdigest()[:12];folder=output/source_key/token;url=f'/assets/effects/native/{source_key}/{token}'
                renderer_fingerprint=None
                if xml:
                    components=[Path(args.classes,'BitmapTimelineRender.class').read_bytes(),archive.record('flash/core/naruto.core.swf')['sha256'].encode()]
                    components.extend((Path(__file__).parent/name).read_bytes() for name in ('native_bitmap.py','mme_config.py','native_tween.py','static_amf3.py'))
                    renderer_fingerprint=hashlib.sha256(b'\0'.join(components)).hexdigest()
                reused=cached_layer(index,before,action,output,renderer_fingerprint)
                if reused:
                    if native_root is not None:reused['sourceActionData']=source_action_data(native_root,source_config,action)
                    reused['plane']=plane;entry['layers'].append(reused);continue
                configuration_evidence=None
                if xml:
                    from native_bitmap import prepare_spec
                    native_folder=source_work/('mme-'+token);spec=source_work/(token+'-expanded.xml')
                    configuration_evidence=prepare_spec(raw,action,spec)
                    command=[args.java,'-Djava.awt.headless=true','-Duser.home='+str(profile),'-Xmx1024m','-cp',str(Path(args.classes).resolve())+os.pathsep+str(Path(args.ffdec).resolve()/'lib/*'),
                             'BitmapTimelineRender',str(decoded),str(spec),str(native_folder)]
                    points=[]
                else:
                    symbol=symbols.get(action)
                    if symbol not in sprite_ids:raise ValueError('Exact exported sprite binding absent: '+action)
                    native_folder=source_work/str(symbol)
                    command=[args.java,'-Djava.awt.headless=true','-Duser.home='+str(profile),'-Xmx1024m','-cp',str(Path(args.classes).resolve())+os.pathsep+str(Path(args.ffdec).resolve()/'lib/*'),
                             'StaticSwfRender',str(decoded),str(symbol),str(native_folder)]
                subprocess.run(command,check=True,timeout=180,capture_output=True,env=environment)
                if not xml:points=json.loads((native_folder/'named-instances.json').read_text(encoding='utf-8'))
                layer={'plane':plane,'action':action,'namedInstances':points}
                if native_root is not None:layer['sourceActionData']=source_action_data(native_root,source_config,action)
                try:
                    animation,proof=pack(native_folder,folder,url,atlas_format=args.atlas_format,allow_pages=args.allow_pages)
                    layer['animation']=animation;artifact_folder=folder
                    names=tuple(Path(u).name for u in animation.get('atlasPageUrls',[animation['url']]))+('effect-atlas.json','manifest.json')
                except ValueError as budget_error:
                    if not any(message in str(budget_error) for message in ('Packed atlas exceeds explicit pixel budget','Multi-page atlas exceeds','A single native frame exceeds')):raise
                    artifact_folder=folder/'source-sequence';sequence,proof=pack_sequence(native_folder,artifact_folder)
                    layer['sourceSequence']={'manifestPath':(artifact_folder/'manifest.json').relative_to(output).as_posix(),'runtimeAdapterRequired':True,'atlasLimitReason':str(budget_error)}
                    names=tuple(sequence['frameFiles'])+('manifest.json',)
                if configuration_evidence:
                    if 'animation' in layer:layer['animation']['rendering']='MME-data-JPEXS-26.4.0-static-display-list'
                    proof['scope']='Reconstructed display list from preferred source MME graphics data and original core semantics, rendered statically by JPEXS. Not an AVM/player capture or proof of background-dependent blend composition.'
                    proof['rendererSemanticFingerprint']=renderer_fingerprint
                    layer.update({'configurationEvidence':configuration_evidence,'rendererSemanticEvidence':archive.record('flash/core/naruto.core.swf')})
                layer['validation']=proof
                manifest=json.loads((artifact_folder/'manifest.json').read_bytes());manifest.update({'validation':proof,'source':before})
                if 'animation' in layer:manifest['animations']={'effect':layer['animation']}
                if configuration_evidence:manifest['configurationEvidence']=configuration_evidence
                if 'sourceActionData' in layer:manifest['sourceActionData']=layer['sourceActionData']
                save(artifact_folder/'manifest.json',manifest)
                layer['artifactsSha256']={name:hashlib.sha256((artifact_folder/name).read_bytes()).hexdigest() for name in names}
                if args.discard_native_frames:
                    if not native_folder.resolve().is_relative_to(work):raise ValueError('Generated frame folder escapes work root')
                    for intermediate in native_folder.glob('*.png'):intermediate.unlink()
                entry['layers'].append(layer)
            if not entry['layers']:raise ValueError('No bound front/back animation; needs label or procedural adapter')
            assert archive.record(logical)==before
            if any('sourceSequence' in layer for layer in entry['layers']):
                entry['state']='source-frames-complete-runtime-adapter-pending'
                index['sourceExports' if args.jobs else 'sourceBundles'][ident]=entry
                index['effects'].pop(ident,None)
                index['deferred'][ident]={'id':ident,'definition':dict(row.attrib),'state':entry['state'],'reason':'Full lossless source frames extracted; streaming/tiled runtime adapter required instead of an oversized atlas'}
            else:
                entry['state']='native-assets-prepared-source-review' if args.jobs else 'native-assets-prepared-binding-review'
                index['sourceExports' if args.jobs else 'effects'][ident]=entry;index['deferred'].pop(ident,None);index['sourceBundles'].pop(ident,None)
            print(json.dumps({'effect':ident,'layers':[x['action'] for x in entry['layers']],'state':entry['state']}),flush=True)
        except (ValueError,KeyError,subprocess.SubprocessError,OSError,ET.ParseError,struct.error) as error:
            detail=error.stderr.decode('utf-8',errors='replace')[-1600:] if isinstance(error,subprocess.CalledProcessError) and error.stderr else None
            index['deferred'][ident]={'id':ident,'definition':dict(row.attrib),'reason':type(error).__name__+': '+str(error),'rendererDetail':detail,'state':'not-substituted'}
            print(json.dumps(index['deferred'][ident],ensure_ascii=False),flush=True)
        save(index_path,index)
    assert archive.record(config)==config_record


if __name__=='__main__':main()
