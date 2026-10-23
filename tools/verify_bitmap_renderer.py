"""Native integration check with known colors, blend, alpha, offsets and motion."""
import argparse,hashlib,json,os,subprocess,xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from pack_native_frames import pack

def main():
    ap=argparse.ArgumentParser()
    for key in ('java','javac','ffdec','classes','work','report'):ap.add_argument('--'+key,type=Path,required=True)
    args=ap.parse_args();work=args.work.resolve();work.mkdir(parents=True,exist_ok=True);classes=args.classes.resolve()
    cp=str(classes)+os.pathsep+str(args.ffdec.resolve()/'lib/*')
    subprocess.run([str(args.javac.resolve()),'-cp',cp,'-d',str(classes),str(Path(__file__).parent/'qa/NativeBitmapFixture.java')],check=True)
    source=work/'fixture.swf';subprocess.run([str(args.java.resolve()),'-Djava.awt.headless=true','-cp',cp,'NativeBitmapFixture',str(source)],check=True)
    spec=ET.Element('render',{'fps':'24','frameCount':'5'})
    for ident in ('1','2'):ET.SubElement(spec,'asset',{'id':ident,'symbolId':ident,'x':'-1','y':'-1'})
    action=ET.SubElement(spec,'action');first=ET.SubElement(action,'layer');second=ET.SubElement(action,'layer')
    poses=[{'assetId':'1'},{'assetId':'1'},{'assetId':'2','color':'ff00ff00','alpha':'.5'},{'assetId':'2','color':'0000ff00'},
           {'assetId':'2','x':'10','y':'20','scaleX':'2','rotation':'90'}]
    for index,pose in enumerate(poses):ET.SubElement(ET.SubElement(first,'frame',{'index':str(index),'length':'1'}),'element',pose)
    ET.SubElement(ET.SubElement(second,'frame',{'index':'1','length':'1'}),'element',{'assetId':'2','blendMode':'add'})
    spec_path=work/'spec.xml';ET.ElementTree(spec).write(spec_path,encoding='utf-8')
    native=work/'native';subprocess.run([str(args.java.resolve()),'-Djava.awt.headless=true','-Xmx1024m','-cp',cp,'BitmapTimelineRender',str(source),str(spec_path),str(native)],check=True)
    meta=json.loads((native/'render.json').read_bytes());left,top=[v/20 for v in meta['rectTwips'][:2]]
    def pixel(frame,x,y):
        with Image.open(native/f'{frame:04d}.png') as image:return image.convert('RGBA').getpixel((round(x-left),round(y-top)))
    probes=[pixel(i,0,0) for i in range(4)];assert probes[0]==(255,0,0,255),probes
    assert probes[1]==(255,0,255,255),probes
    assert probes[2][:3]==(0,255,0) and probes[2][3] in (127,128),probes
    assert probes[3]==(0,0,255,255),probes
    assert pixel(4,9,21)==(0,0,255,255),'Rotation, scale or source registration changed'
    animation,proof=pack(native,work/'packed','/fixture',atlas_format='webp',allow_pages=True)
    report={'knownColorAndBlendPixels':probes,'registrationRotationScale':True,'allPackedFramesMatchNativeReference':proof['allFramesPixelExact'],
            'frames':proof['nativeFrames'],'sourceExecution':False,'fixtureSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'scope':'Synthetic graphics-only SWF, source MME semantics mapped to JPEXS display list, actual RGBA probes plus independent atlas reconstruction. Not an AVM/player capture.'}
    args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))

if __name__=='__main__':main()
