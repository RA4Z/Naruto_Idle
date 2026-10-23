"""Rebuild every source-rendered frame from public atlases, independent of pack()."""
import argparse,hashlib,json,math,sys
from pathlib import Path
from PIL import Image

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--project',type=Path,default=Path(__file__).resolve().parents[1]);ap.add_argument('--source');ap.add_argument('--effects-root',type=Path);ap.add_argument('--ids');ap.add_argument('--report',type=Path);args=ap.parse_args();p=args.project.resolve()
    sys.path.insert(0,str(p/'tools'))
    archive=None
    if args.source:
        from original_archive import OriginalArchive
        archive=OriginalArchive(args.source)
    root=args.effects_root.resolve() if args.effects_root else p/'public/assets/effects/native'
    def asset(url):
        assert url.startswith('/assets/effects/native/'), 'Unexpected effect URL'
        relative=Path(url.removeprefix('/assets/effects/native/'))
        assert not relative.is_absolute() and '..' not in relative.parts, 'Effect path escapes root'
        return root/relative
    index=json.loads((root/'index.json').read_bytes());rows=[]
    selected=set(args.ids.split(',')) if args.ids else set(index['effects'])
    assert selected<=set(index['effects']), 'Requested unprepared effect IDs'
    if args.ids:assert 1<=len(selected)<=24, 'One cycle contains at most 24 effect IDs'
    for ident,entry in index['effects'].items():
        if ident not in selected:continue
        if archive:
            for evidence in (entry['source'],entry['sourceConfig']):assert archive.record(evidence['path'])==evidence,'Original bytes changed'
        for layer in entry['layers']:
            a=layer['animation'];proof=layer['validation'];folder=asset(a['url']).parent
            for name,digest in layer['artifactsSha256'].items():assert hashlib.sha256((folder/name).read_bytes()).hexdigest()==digest,'Prepared artifact hash changed: '+str(folder/name)
            assert a['sourcePixelScale']==1 and len(a['timeline'])==proof['nativeFrames']
            assert len(a['frameOrigins'])==a['frames'] and len(proof['frameRgbaSha256'])==len(a['timeline'])
            width,height=proof['nativeCanvasSize'];assert 0<width<=8192 and 0<height<=8192 and width*height<=16_000_000
            left,top=[v/20 for v in a['sourceBounds'][:2]]
            atlas=json.loads(asset(a['packedAtlasUrl']).read_bytes())['frames']
            page_urls=a.get('atlasPageUrls',[a['url']]);frame_pages=a.get('framePages',[0]*a['frames'])
            assert len(frame_pages)==a['frames'] and 1<=len(page_urls)<=16
            assert all(isinstance(page,int) and 0<=page<len(page_urls) for page in frame_pages)
            image=None;loaded_page=-1
            try:
                for time,unique in enumerate(a['timeline']):
                    page=frame_pages[unique]
                    if page!=loaded_page:
                        if image is not None:image.close()
                        with Image.open(asset(page_urls[page])) as raw:image=raw.convert('RGBA')
                        assert max(image.size)<=8192 and image.width*image.height<=16_000_000
                        loaded_page=page
                    r=atlas[str(unique)]['frame'];x,y,w,h=[r[k] for k in ('x','y','w','h')]
                    assert x>=0 and y>=0 and w>0 and h>0 and x+w<=image.width and y+h<=image.height
                    frame=Image.new('RGBA',(width,height));crop=image.crop((x,y,x+w,y+h));ox,oy=a['frameOrigins'][unique]
                    if crop.getbbox():frame.alpha_composite(crop,(round(-ox*w-left),round(-oy*h-top)))
                    assert hashlib.sha256(frame.tobytes()).hexdigest()==proof['frameRgbaSha256'][time],f'Frame pixels or source registration changed: {ident}/{layer["action"]}/{time}'
            finally:
                if image is not None:image.close()
            rows.append({'id':ident,'action':layer['action'],'plane':layer['plane'],'frames':len(a['timeline']),'allSourceRenderedFramesReconstructed':True,'artifactsSha256Match':True,'originalArchiveVerified':bool(archive),'sourcePixelScale':1})
    report={'effects':len(selected),'catalogEffects':len(index['effects']),'layers':len(rows),'frames':sum(r['frames'] for r in rows),'rows':rows,'scope':'All public atlases reconstructed on the original JPEXS static-render canvas and compared against per-frame RGBA hashes. No Flash player or ActionScript execution; not proof of runtime scripts or unresolved world attachments.'}
    target=args.report or p/'reports/native-effects-validation.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='rows'}))

if __name__=='__main__':main()
