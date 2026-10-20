"""Small transparent full-body previews, derived from prepared original frames."""
from pathlib import Path
import concurrent.futures,json
from PIL import Image
ROOT=Path(r'D:\Naruto Idle\Naruto Idle RPG');PUB=ROOT/'public'

def create(entry):
    path=PUB/entry['manifestUrl'].lstrip('/');m=json.loads(path.read_text(encoding='utf-8'))
    anim=m.get('modes',{}).get('battle',{}).get('animations',{}).get('C_idle') or m.get('modes',{}).get('world',{}).get('animations',{}).get('idle_0')
    if not anim:return None
    with Image.open(PUB/anim['url'].lstrip('/')) as sheet:
        w,h=anim['frameWidth'],anim['frameHeight'];cols=sheet.width//w;frame=None
        for index in [0,*anim.get('timeline',[])[:12],anim['frames']//2]:
            tile=sheet.crop((index%cols*w,index//cols*h,index%cols*w+w,index//cols*h+h)).convert('RGBA');box=tile.getchannel('A').getbbox()
            if box:frame=tile.crop(box);break
    if frame is None:return None
    frame.thumbnail((152,176),Image.Resampling.LANCZOS);preview=Image.new('RGBA',(176,192));preview.alpha_composite(frame,((176-frame.width)//2,184-frame.height))
    preview.save(path.parent/'preview.png',compress_level=6)
    url=entry['manifestUrl'].rsplit('/',1)[0]+'/preview.png';m['preview']=url
    path.write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
    return entry['id'],url

if __name__=='__main__':
    catalog=PUB/'assets/catalog/entities.json';data=json.loads(catalog.read_text(encoding='utf-8'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: previews=dict(r for r in pool.map(create,data['entities']) if r)
    indexes=[catalog,PUB/'assets/characters/index.json',PUB/'assets/para-revisao/index.json',*(PUB/'assets/para-revisao').glob('*/index.json')]
    for path in indexes:
        d=json.loads(path.read_text(encoding='utf-8'))
        for e in d['entities']:
            if e['id'] in previews:e['preview']=previews[e['id']]
        path.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/'reports/full-body-previews.json').write_text(json.dumps({'generated':len(previews),'unavailable':len(data['entities'])-len(previews),'source':'first visible prepared original battle/world idle frame','size':[176,192]},indent=2),encoding='utf-8');print(json.dumps({'fullBodyPreviews':len(previews)}))
