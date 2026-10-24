import json, re, math, subprocess
from pathlib import Path
from PIL import Image, ImageDraw
paths=subprocess.check_output(["rg","--files","assets-extraidos/interface"],text=True).splitlines()
selected=[]
for p in paths:
    q=p.replace("\\","/")
    if not q.endswith(".png") or not re.search(r"/flash/(hud|core|friend|user|ninja|world|equipment|chat|shop|task)/",q): continue
    try:
        im=Image.open(p)
        w,h=im.size
        if 22<=w<=150 and 22<=h<=150 and .45<=w/h<=2.1:
            selected.append({"path":q,"width":w,"height":h})
    except Exception: pass
selected.sort(key=lambda x:x["path"])
Path("reports/hud-icon-candidates.json").write_text(json.dumps(selected,indent=2))
for page in range(math.ceil(len(selected)/144)):
    chunk=selected[page*144:(page+1)*144]
    sheet=Image.new("RGB",(1200,math.ceil(len(chunk)/12)*112),(20,34,29))
    d=ImageDraw.Draw(sheet)
    for j,item in enumerate(chunk):
        x=(j%12)*100;y=(j//12)*112
        im=Image.open(item["path"]).convert("RGBA")
        im.thumbnail((76,72))
        sheet.paste(im,(x+(100-im.width)//2,y+4),im)
        module=item["path"].split("/")[-2].replace(".extracted","")[:15]
        d.text((x+3,y+78),str(page*144+j)+" "+Path(item["path"]).stem.replace("bitmap-",""),fill="#f6ce8c")
        d.text((x+3,y+93),module,fill="#a2bba8")
    sheet.save("reports/hud-icons-"+str(page)+".png")
print("Candidates",len(selected),"pages",math.ceil(len(selected)/144))
