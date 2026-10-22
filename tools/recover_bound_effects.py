"""Bounded native effect extraction from exact Effect.xml resource/symbol bindings."""
import argparse
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


def save(path,data):
    path.parent.mkdir(parents=True,exist_ok=True);temporary=path.with_suffix(path.suffix+'.tmp')
    temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');temporary.replace(path)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--project',required=True)
    parser.add_argument('--output',required=True);parser.add_argument('--work',required=True);parser.add_argument('--java',required=True)
    parser.add_argument('--ffdec',required=True);parser.add_argument('--classes',required=True);parser.add_argument('--ids',required=True)
    args=parser.parse_args();ids=args.ids.split(',')
    if not 1<=len(ids)<=4 or len(set(ids))!=len(ids) or any(not re.fullmatch(r'\d+',i) for i in ids):raise ValueError('One to four explicit effect IDs required')
    sys.path.insert(0,str(Path(args.project).resolve()/'tools'))
    from original_archive import OriginalArchive
    from entity_pipeline import tags,convert
    from swf_bytes import decode
    archive=OriginalArchive(args.source);output=Path(args.output).resolve();work=Path(args.work).resolve()
    if output.is_relative_to(archive.root) or work.is_relative_to(archive.root):raise ValueError('Originals are read-only')
    config='assets/battle/Effect.xml';config_record=archive.record(config)
    definitions={row.get('id'):row for row in ET.fromstring(archive.data(config))}
    index_path=output/'index.json';index=json.loads(index_path.read_text(encoding='utf-8')) if index_path.exists() else {'version':1,'effects':{},'deferred':{}}
    profile=work/'jpexs-profile';profile.mkdir(parents=True,exist_ok=True)
    environment=os.environ.copy();environment['APPDATA']=str(profile);environment['LOCALAPPDATA']=str(profile)
    for ident in ids:
        row=definitions[ident];logical=row.get('res','');entry={'id':ident,'definition':dict(row.attrib),'sourceConfig':config_record,'layers':[]}
        try:
            if row.get('type')!='0' or logical not in archive.rows or not logical.startswith('assets/battle/effect/'):
                raise ValueError('Binding is procedural, shared, or missing; needs a specific adapter')
            before=archive.record(logical);raw=archive.raw(logical);records=list(tags(raw));entry['source']=before
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
            for field,plane in (('backAction','back'),('frontAction','front')):
                action=row.get(field)
                if not action:continue
                token=hashlib.sha256(action.encode()).hexdigest()[:12];folder=output/source_key/token;url=f'/assets/effects/native/{source_key}/{token}'
                if xml:
                    root=ET.fromstring(xml);native=next((a for a in root.findall('action') if a.get('name')==action),None)
                    if native is None:raise ValueError('Native bitmap action not found: '+action)
                    features={k for e in native.iter('element') for k in e.attrib if k not in {'assetId','x','y','alpha','scaleX','scaleY','rotation'} and not (k=='blendMode' and e.get(k)=='normal')}
                    if features or any(f.get('tween')=='true' for f in native.iter('frame')):
                        raise ValueError('Bitmap action needs faithful feature adapter: '+str(sorted(features)))
                    converted=convert(decoded,folder,url,'effect',only={action},compact=True,pixel_budget=16_000_000,source_pixel_budget=32_000_000)
                    animation=converted['animations'][action]
                    if animation['status']!='ready':raise ValueError('Bitmap reconstruction has unresolved features')
                    proof={'nativeFrames':len(animation['timeline']),'sourcePixelScale':1,'renderer':'native-bitmap-affine','allFramesPixelExact':False,
                           'note':'Source transforms preserved; separate independent source-frame verification required'}
                    save(folder/'manifest.json',{'animations':{action:animation},'source':before,'validation':proof})
                    points=[]
                else:
                    symbol=symbols.get(action)
                    if symbol not in sprite_ids:raise ValueError('Exact exported sprite binding absent: '+action)
                    native_folder=source_work/str(symbol)
                    subprocess.run([args.java,'-Djava.awt.headless=true','-Duser.home='+str(profile),'-Xmx1024m','-cp',str(Path(args.classes).resolve())+os.pathsep+str(Path(args.ffdec).resolve()/'lib/*'),
                                    'StaticSwfRender',str(decoded),str(symbol),str(native_folder)],check=True,timeout=180,capture_output=True,env=environment)
                    animation,proof=pack(native_folder,folder,url)
                    points=json.loads((native_folder/'named-instances.json').read_text(encoding='utf-8'))
                artifacts={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.iterdir() if p.name in ('effect.png','effect-atlas.json','manifest.json')}
                entry['layers'].append({'plane':plane,'action':action,'animation':animation,'validation':proof,'namedInstances':points,'artifactsSha256':artifacts})
            if not entry['layers']:raise ValueError('No bound front/back animation; needs label or procedural adapter')
            assert archive.record(logical)==before
            entry['state']='native-assets-prepared-binding-review';index['effects'][ident]=entry;index['deferred'].pop(ident,None)
            print(json.dumps({'effect':ident,'layers':[x['action'] for x in entry['layers']],'state':entry['state']}),flush=True)
        except (ValueError,KeyError,subprocess.SubprocessError) as error:
            index['deferred'][ident]={'id':ident,'definition':dict(row.attrib),'reason':type(error).__name__+': '+str(error),'state':'not-substituted'}
            print(json.dumps(index['deferred'][ident],ensure_ascii=False),flush=True)
        save(index_path,index)
    assert archive.record(config)==config_record


if __name__=='__main__':main()
