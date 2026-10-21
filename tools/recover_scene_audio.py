"""Recover one bounded batch of scene music/ambience with original scene links.
Never execute SWF or change the source archive. One file at a time.
"""
import argparse, hashlib, json, re, zlib
from pathlib import Path
from datetime import datetime, timezone
import xml.etree.ElementTree as ET

def digest(data):
    return hashlib.sha256(data).hexdigest()

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    newline="\r\n" if path.exists() and b"\r\n" in path.read_bytes() else "\n"
    text=(json.dumps(value, ensure_ascii=False, indent=2)+"\n").replace("\n",newline)
    path.write_bytes(text.encode("utf-8"))

def recover(source, target, ids):
    if source.resolve() == target.resolve() or source.resolve() in target.resolve().parents:
        raise ValueError("Source archive and project must be separate")
    lookup={r["path"]:r for r in json.loads((source/"recovery/resource-manifest.json").read_text(encoding="utf-8"))["assets"]}
    def path(name):
        row=lookup[name]
        candidate=source/"recovered-web/cdn"/row["tag"]/name
        if not candidate.resolve().is_relative_to((source/"recovered-web/cdn").resolve()):
            raise ValueError("Source escapes archive")
        return candidate
    config_hashes={}
    def xml(name):
        data=path(name).read_bytes();config_hashes[name]=digest(data)
        try: data=zlib.decompress(data)
        except zlib.error: pass
        return ET.fromstring(data)
    scenes=xml("config/world/SceneCFG.xml")
    music={r.get("id"):r.attrib for r in xml("config/world/MapMusicConfig.xml")}
    existing=json.loads((target/"public/assets/presentation.json").read_text(encoding="utf-8"))
    index_path=target/"public/assets/audio/scenes/index.json"
    index=json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {"version":1,"maps":{},"files":{}}
    copied=[]
    for map_id in ids:
        choices=[r for r in scenes if r.findtext("mapId")==map_id and r.findtext("type")=="1" and r.findtext("worldMapId") and r.findtext("id") in music]
        if len(choices)!=1:
            raise ValueError("Need one unambiguous exploration scene: "+map_id)
        scene=choices[0];sid=scene.findtext("id");row=music[sid]
        def copy(name):
            name=name.strip().replace("\\","/")
            if not name:return None
            if not re.fullmatch(r"assets/sound/scene/SE/[A-Za-z0-9_()\-]+\.mp3",name):
                raise ValueError("Unsupported music source "+name)
            original=path(name);data=original.read_bytes();sha=digest(data)
            if data[:3]!=b"ID3" and not (len(data)>1 and data[0]==255 and data[1]&224==224):
                raise ValueError("Not an MPEG audio file: "+name)
            url="/assets/audio/scenes/"+Path(name).name
            dest=target/"public"/url.lstrip("/")
            if dest.exists() and digest(dest.read_bytes())!=sha:
                raise ValueError("Refusing to overwrite a different runtime file "+str(dest))
            dest.parent.mkdir(parents=True,exist_ok=True)
            if not dest.exists():dest.write_bytes(data)
            if digest(original.read_bytes())!=sha or digest(dest.read_bytes())!=sha:
                raise ValueError("Source or destination hash changed")
            index["files"][url]={"source":name,"sourceTag":lookup[name]["tag"],"sha256":sha,"bytes":len(data),"status":"integrated"}
            copied.append(name)
            return url
        tracks=list(dict.fromkeys(copy(n) for n in row.get("bgMusics","").split(",") if n.strip()))
        env=copy(row.get("envAudio",""))
        # Nonzero trimming still requires an adapter. Native fades are supported.
        for key in ("gapBegining","gapEnding"):
            if row.get(key,"") not in ("","0"):raise ValueError("Needs timing adapter: "+key)
        fades={key:int(row.get(source_key) or 0) for key,source_key in [("fadeInMs","fadeIn"),("fadeOutMs","fadeOut")]}
        if any(not 0<=value<=60000 for value in fades.values()):raise ValueError("Fade duration outside budget")
        index["maps"][map_id]={"sceneId":sid,"name":scene.findtext("name"),"tracks":tracks,
            "environment":env,"intervalMs":int(row.get("interval") or 0),"sourceMapping":row,**fades,
            "status":"integrated","playback":"random selection on completion; original interval; looped ambience"}
    existing["sceneAudio"]={k:{key:value for key,value in v.items() if key in ("sceneId","tracks","environment","intervalMs","fadeInMs","fadeOutMs")} for k,v in index["maps"].items()}
    write_json(index_path,index);write_json(target/"public/assets/presentation.json",existing)
    available=[p for p in lookup if p.endswith(".mp3")]
    summary={"checkedAt":datetime.now(timezone.utc).isoformat(),"maps":ids,"files":len(set(copied)),
        "sourceConfigSha256":config_hashes,"sourceBytesPreserved":True,"workers":1,
        "independentMp3Discovered":len(available),"integratedSceneFiles":len(index["files"]),
        "legacyMainTrackAlreadyIntegrated":1,"remainingIndependentSourcePaths":len(available)-len(index["files"])-1,
        "limits":["Source-path counts include duplicate copies across scene/sound directories.",
                  "Only named exploration scenes are linked; village keeps documented prototype main.mp3 fallback.",
                  "Embedded SWF voices/effects, other scene tracks and battle-music mappings remain pending.",
                  "Browser decoding, lifecycle and production validation still required."]}
    write_json(target/("reports/scene-audio-"+("-".join(ids))+".json"),summary)
    print(json.dumps(summary,ensure_ascii=True))

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--source",type=Path,required=True)
    parser.add_argument("--target",type=Path,default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--maps",required=True)
    args=parser.parse_args();ids=args.maps.split(",")
    if not 1<=len(ids)<=5 or len(set(ids))!=len(ids) or any(not re.fullmatch(r"[0-9]+",i) for i in ids):
        parser.error("One to five explicit unique map IDs required")
    recover(args.source,args.target,ids)
