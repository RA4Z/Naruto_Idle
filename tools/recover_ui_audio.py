"""Recover a bounded UI-cue batch from original DefineSound MP3 tags.
Read-only archive; no Flash execution or media transcoding.
"""
import argparse,json,re,hashlib,struct
from pathlib import Path
from datetime import datetime,timezone
import xml.etree.ElementTree as ET
from original_archive import OriginalArchive
from entity_pipeline import tags

EVENTS={"click":"1","close":"2","battleStart":"4","levelUp":"14","victory":"18","defeat":"19"}
LABELS={"click":"Clique","close":"Fechar","battleStart":"Inicio de combate","levelUp":"Novo nivel","victory":"Vitoria","defeat":"Derrota"}
ROOT=Path(__file__).resolve().parents[1]

def write(path,value):
    previous=path.read_bytes() if path.exists() else b""
    newline="\r\n" if b"\r\n" in previous else "\n"
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes((json.dumps(value,ensure_ascii=False,indent=2)+"\n").replace("\n",newline).encode())

def recover(source,events):
    archive=OriginalArchive(source)
    if ROOT.is_relative_to(archive.root) or archive.root.is_relative_to(ROOT):
        raise ValueError("Separate original archive required")
    config="assets/sound/UISoundConfig.xml";packages_config="assets/sound/soundConfig.xml"
    ui={row.get("id"):row.attrib for row in ET.fromstring(archive.data(config))}
    packages={row.get("id"):row for row in ET.fromstring(archive.data(packages_config)).iter("package")}
    before=[archive.record(config),archive.record(packages_config)]
    data=json.loads((ROOT/"public/assets/presentation.json").read_bytes())
    index_path=ROOT/"public/assets/audio/ui/index.json"
    index=json.loads(index_path.read_bytes()) if index_path.exists() else {"version":1,"events":{}}
    for event in events:
        native=ui[EVENTS[event]];sid=native["sound"];package=packages[sid]
        name="assets/sound/"+package.get("src")
        if not re.fullmatch(r"assets/sound/swf/s[0-9]+\.swf",name):
            raise ValueError("Unsupported sound package")
        source_record=archive.record(name);before.append(source_record)
        clips=[]
        for kind,payload in tags(archive.raw(name)):
            if kind!=14:continue
            if len(payload)<10 or payload[2]>>4!=2:raise ValueError("Non-MP3 DefineSound requires adapter")
            ident=struct.unpack_from("<H",payload)[0];content=payload[9:]
            if content[:3]!=b"ID3" and not (len(content)>1 and content[0]==255 and content[1]&224==224):
                raise ValueError("Invalid MP3 sound payload")
            sha=hashlib.sha256(content).hexdigest();url=f"/assets/audio/sfx/{sid}/{ident}.mp3"
            destination=ROOT/"public"/url.lstrip("/")
            if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest()!=sha:
                raise ValueError("Refusing to replace a different runtime clip")
            destination.parent.mkdir(parents=True,exist_ok=True)
            if not destination.exists():destination.write_bytes(content)
            clips.append({"url":url,"symbolId":ident,"sha256":sha,"bytes":len(content),
                "seekSamples":struct.unpack_from("<h",payload,7)[0],"sampleCount":struct.unpack_from("<I",payload,3)[0]})
        if not clips:raise ValueError("No supported sound in "+name)
        data["sounds"][sid]={"name":LABELS[event],"sourceName":package.get("name"),"source":name,"urls":[c["url"] for c in clips]}
        data.setdefault("uiCues",{})[event]=sid
        index["events"][event]={"uiId":EVENTS[event],"soundId":sid,"sourceMapping":native,
            "source":source_record,"clips":clips,"status":"integrated-awaiting-tests",
            "adaptation":"Original clip on equivalent idle UI/battle event; battle-start cue originally belongs to its button."}
        print(json.dumps({"event":event,"sound":sid,"files":len(clips)}),flush=True)
    assert before==[archive.record(row["path"]) for row in before],"Original archive modified"
    write(index_path,index);write(ROOT/"public/assets/presentation.json",data)
    write(ROOT/"reports/ui-audio-recovery.json",{"checkedAt":datetime.now(timezone.utc).isoformat(),
        "events":events,"sourceConfigs":before[:2],"sourceHashesPreserved":True,"workers":1,
        "files":sum(len(index["events"][event]["clips"]) for event in events),
        "state":"integrated-awaiting-tests","limits":["Only six UI cues are integrated; the remaining configured UI, voice and effect packages stay pending."]})

if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--source",required=True);parser.add_argument("--events",required=True)
    args=parser.parse_args();events=args.events.split(",")
    if not 1<=len(events)<=6 or len(set(events))!=len(events) or any(e not in EVENTS for e in events):
        parser.error("One to six explicit supported events required")
    recover(args.source,events)
