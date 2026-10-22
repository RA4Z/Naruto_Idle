"""Rebuild every source-rendered frame from public atlases, independent of pack()."""
import argparse,hashlib,json,math
from pathlib import Path
from PIL import Image

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--project',type=Path,default=Path(__file__).resolve().parents[1]);ap.add_argument('--source');args=ap.parse_args();p=args.project.resolve()
    archive=None
    if args.source:
        from original_archive import OriginalArchive
        archive=OriginalArchive(args.source)
    index=json.loads((p/'public/assets/effects/native/index.json').read_bytes());rows=[]
    for ident,entry in index['effects'].items():
        if archive:
            for evidence in (entry['source'],entry['sourceConfig']):assert archive.record(evidence['path'])==evidence,'Original bytes changed'
        for layer in entry['layers']:
            a=layer['animation'];proof=layer['validation'];folder=(p/'public'/a['url'].lstrip('/')).parent
            for name,digest in layer['artifactsSha256'].items():assert hashlib.sha256((folder/name).read_bytes()).hexdigest()==digest,'Prepared artifact hash changed: '+str(folder/name)
            assert a['sourcePixelScale']==1 and len(a['timeline'])==proof['nativeFrames']
            assert len(a['frameOrigins'])==a['frames'] and len(proof['frameRgbaSha256'])==len(a['timeline'])
            width,height=proof['nativeCanvasSize'];assert 0<width<=8192 and 0<height<=8192 and width*height<=16_000_000
            left,top=[v/20 for v in a['sourceBounds'][:2]]
            atlas=json.loads((p/'public'/a['packedAtlasUrl'].lstrip('/')).read_bytes())['frames']
            with Image.open(p/'public'/a['url'].lstrip('/')) as image:
                image=image.convert('RGBA');assert max(image.size)<=8192 and image.width*image.height<=16_000_000
                for time,unique in enumerate(a['timeline']):
                    r=atlas[str(unique)]['frame'];x,y,w,h=[r[k] for k in ('x','y','w','h')]
                    assert x>=0 and y>=0 and w>0 and h>0 and x+w<=image.width and y+h<=image.height
                    frame=Image.new('RGBA',(width,height));crop=image.crop((x,y,x+w,y+h));ox,oy=a['frameOrigins'][unique]
                    if crop.getbbox():frame.alpha_composite(crop,(round(-ox*w-left),round(-oy*h-top)))
                    assert hashlib.sha256(frame.tobytes()).hexdigest()==proof['frameRgbaSha256'][time],f'Frame pixels or source registration changed: {ident}/{layer["action"]}/{time}'
            rows.append({'id':ident,'action':layer['action'],'plane':layer['plane'],'frames':len(a['timeline']),'allSourceRenderedFramesReconstructed':True,'artifactsSha256Match':True,'originalArchiveVerified':bool(archive),'sourcePixelScale':1})
    report={'effects':len(index['effects']),'layers':len(rows),'frames':sum(r['frames'] for r in rows),'rows':rows,'scope':'All public atlases reconstructed on the original JPEXS static-render canvas and compared against per-frame RGBA hashes. No Flash player or ActionScript execution; not proof of runtime scripts or unresolved world attachments.'}
    target=p/'reports/native-effects-validation.json';target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='rows'}))

if __name__=='__main__':main()
