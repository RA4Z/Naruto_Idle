"""Validate every recovered alpha pixel and choose stable GPU probe coordinates."""
from pathlib import Path
import argparse,io,json
from PIL import Image,ImageChops
from original_archive import OriginalArchive
ROOT=Path(__file__).resolve().parents[1]

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--batch');ap.add_argument('--report',default='native-foreground-pixel-validation.json');args=ap.parse_args();archive=OriginalArchive(args.source)
    recovery=json.loads((ROOT/'reports/native-foreground-recovery.json').read_text(encoding='utf-8'));rows=[]
    if args.batch:
        batch=json.loads((ROOT/'reports'/args.batch).read_text(encoding='utf-8'))
        recovery={'maps':[m['foreground'] for m in batch['maps']]}
    expansion=ROOT/'reports/world-expansion-batch.json'
    if expansion.exists() and not args.batch:
        extras=json.loads(expansion.read_text(encoding='utf-8'))['maps']
        known={m['id'] for m in recovery['maps']}
        recovery['maps'].extend(m['foreground'] for m in extras if m['id'] not in known)
    for item in recovery['maps']:
        ident=item['id'];folder=ROOT/'public/assets/maps'/ident
        assert (folder/'native-alpha.png').read_bytes()==archive.raw(f'assets/scene/map/{ident}/alphaMap.png')
        with Image.open(folder/'foreground.png') as im:
            image=im.convert('RGBA')
        with Image.open(io.BytesIO(archive.raw(f'assets/scene/map/{ident}/alphaMap.png'))) as source:
            mask=Image.new('L',image.size);mask.paste(source.convert('RGBA').getchannel('A'),(0,0))
        with Image.open(folder/'foreground.webp') as webp:
            assert webp.convert('RGBA').tobytes()==image.tobytes(),ident+' lossy runtime'
        assert ImageChops.difference(image.getchannel('A'),mask).getbbox() is None, ident+' alpha mismatch'
        assert all(archive.record(s['path'])==s for s in item['sources']),ident+' source modified'
        samples=[];deferred=[]
        for level,count in enumerate(mask.histogram()):
            if not count:continue
            found=None
            for y in range(100,image.height-100,7):
                for x in range(100,image.width-100,7):
                    pixels=[image.getpixel((x+dx,y+dy)) for dy in range(-2,3) for dx in range(-2,3)]
                    if all(p[3]==level for p in pixels) and (level==0 or all(max(p[c] for p in pixels)-min(p[c] for p in pixels)<25 for c in range(3))):
                        found={'x':x,'y':y,'rgba':list(image.getpixel((x,y)))};break
                if found:break
            if not found:
                deferred.append({'alpha':level,'reason':'No uniform 5x5 neighbourhood for a stable linear-filter GPU probe; every alpha pixel still checked against source.'})
                continue
            samples.append(found)
        thumbnail=image.copy();thumbnail.thumbnail((600,600));thumbnail.save(ROOT/f'reports/native-foreground-{ident}.png')
        rows.append({'id':ident,'allAlphaPixelsMatchOriginal':True,'sourceHashesPreserved':True,'probes':samples,'unprobedThinLevels':deferred})
    (ROOT/'reports'/args.report).write_text(json.dumps({'maps':rows},indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'verifiedMaps':len(rows),'sourceAlphaExact':True}))
if __name__=='__main__':main()
