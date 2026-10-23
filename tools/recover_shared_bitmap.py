"""Recover up to four exact shared bitmap names from XML and preferred AMF data."""
import argparse,hashlib,json,os,shutil,struct,subprocess,sys,xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from static_amf3 import AMF3

def objects(value):
    seen=set();pending=[value]
    while pending:
        item=pending.pop()
        if not isinstance(item,(dict,list)) or id(item) in seen:continue
        seen.add(id(item))
        if isinstance(item,dict):yield item;pending.extend(item.values())
        else:pending.extend(item)


def main():
    ap=argparse.ArgumentParser()
    for key in ('source','project','output'):ap.add_argument('--'+key,type=Path,required=True)
    ap.add_argument('--resource',required=True);ap.add_argument('--names',required=True)
    for key in ('java','ffdec','classes','work'):ap.add_argument('--'+key,type=Path,required=True)
    args=ap.parse_args()
    names=args.names.split(',')
    if not 1<=len(names)<=4 or len(set(names))!=len(names):raise ValueError('One to four explicit shared names required')
    sys.path.insert(0,str(args.project/'tools'))
    from original_archive import OriginalArchive
    from entity_pipeline import tags
    from swf_bytes import decode
    archive=OriginalArchive(args.source);out=args.output.resolve()
    if out.is_relative_to(archive.root) or args.work.resolve().is_relative_to(archive.root):raise ValueError('Originals are read-only')
    before=archive.record(args.resource);raw=archive.raw(args.resource);records=list(tags(raw));symbols={};binaries={}
    args.work.mkdir(parents=True,exist_ok=True);decoded=args.work/'source.swf';decoded.write_bytes(decode(raw))
    profile=args.work/'profile';profile.mkdir(exist_ok=True);environment=os.environ.copy();environment['APPDATA']=str(profile.resolve());environment['LOCALAPPDATA']=str(profile.resolve())
    for kind,payload in records:
        if kind==87:binaries[struct.unpack_from('<H',payload)[0]]=payload[6:]
        if kind==76:
            position=2
            for _ in range(struct.unpack_from('<H',payload)[0]):
                ident=struct.unpack_from('<H',payload,position)[0];position+=2;end=payload.index(b'\0',position)
                symbols[payload[position:end].decode()]=ident;position=end+1
    xml=ET.fromstring(binaries[symbols['Config']]);amf_id=symbols.get('ConfigAMF');native=None
    if amf_id is not None:
        reader=AMF3(binaries[amf_id]);native=reader.read()
        if reader.position!=len(reader.data):raise ValueError('Trailing AMF graphics data needs inspection')
    index={'version':1,'assets':{},'source':before,'sourceExecution':False,'runtimeIntegration':'not-applied'}
    for name in names:
        xml_rows=[dict(a.attrib) for a in xml.findall('asset') if a.get('assetName')==name]
        matches=[a for a in objects(native) if a.get('assetName')==name] if native is not None else xml_rows
        if len(matches)!=1 or len(xml_rows)!=1:raise ValueError('Shared name missing or ambiguous: '+name)
        asset=matches[0];xm=xml_rows[0]
        if asset['className']!=xm['className'] or any(float(asset[k])!=float(xm[k]) for k in ('x','y')):
            raise ValueError('AMF/XML asset registration differs: '+name)
        symbol=symbols[asset['className']];native_png=args.work/f'{symbol}.png'
        subprocess.run([str(args.java.resolve()),'-Djava.awt.headless=true','-Duser.home='+str(profile.resolve()),'-Xmx1024m','-cp',
            str(args.classes.resolve())+os.pathsep+str(args.ffdec.resolve()/'lib/*'),'StaticBitmapExport',str(decoded.resolve()),str(symbol),str(native_png.resolve())],check=True,timeout=120,capture_output=True,env=environment)
        with Image.open(native_png) as raw_image:image=raw_image.convert('RGBA')
        w,h=image.size;pixels=image.tobytes();digest=hashlib.sha256(pixels).hexdigest()
        storage_key=hashlib.sha256(struct.pack('<II',w,h)+pixels).hexdigest();filename=storage_key[:24]+'.png'
        if not image.getbbox():raise ValueError('Shared bitmap is entirely transparent')
        out.mkdir(parents=True,exist_ok=True);shutil.copy2(native_png,out/filename)
        with Image.open(out/filename) as stored:
            if hashlib.sha256(stored.convert('RGBA').tobytes()).hexdigest()!=digest:raise ValueError('Shared bitmap pixels changed')
        index['assets'][name]={'url':'/assets/effects/shared/'+filename,'width':w,'height':h,'offset':[float(asset['x']),float(asset['y'])],
            'className':asset['className'],'symbolId':symbol,'source':before,'configuration':'ConfigAMF' if native is not None else 'Config',
            'amfAndXmlRegistrationMatch':True,'rgbaSha256':digest,'fileSha256':hashlib.sha256((out/filename).read_bytes()).hexdigest(),
            'nameResolution':'exact-assetName-no-suffix-alias','decoder':'JPEXS-26.4.0-static-ImageTag','hideInOutdoor':asset.get('hideInOutdoor',False) in (True,'true')}
    assert archive.record(args.resource)==before
    (out/'index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(index,ensure_ascii=False))

if __name__=='__main__':main()
