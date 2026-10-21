"""Bounded recovery of native actor sound events; never runs ActionScript."""
import argparse, hashlib, json, math, re, struct, subprocess
from pathlib import Path
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
from original_archive import OriginalArchive
from entity_pipeline import tags
ROOT = Path(__file__).resolve().parents[1]

def write(path, value):
    rel = str(path.relative_to(ROOT)).replace("\\", "/")
    old = subprocess.run(["git", "show", "HEAD:"+rel], cwd=ROOT, capture_output=True).stdout
    eol = "\r\n" if old.count(b"\n") and old.count(b"\n") == old.count(b"\r\n") else "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes((json.dumps(value, ensure_ascii=False, indent=2)+"\n").replace("\n", eol).encode())

def number(raw, fallback):
    value = float(raw) if raw is not None else fallback
    return value if math.isfinite(value) else fallback

def recover(source, ids):
    archive = OriginalArchive(source)
    if ROOT.is_relative_to(archive.root) or archive.root.is_relative_to(ROOT):
        raise ValueError("Separate read-only archive required")
    config = "assets/sound/soundConfig.xml"
    death_config = "assets/sound/deathSoundConfig.xml"
    xml = ET.fromstring(archive.data(config))
    parents = {child: parent for parent in xml.iter() for child in parent}
    packages = {p.get("id"): p for p in xml.iter("package")}
    deaths = {n: row.get("id") for row in ET.fromstring(archive.data(death_config))
              for n in re.split(r"[,; ]+", row.get("ninjas", ""))}
    catalog = {e["id"]: e for e in json.loads((ROOT/"public/assets/catalog/entities.json").read_bytes())["entities"]}
    presentation_path = ROOT/"public/assets/presentation.json"
    presentation = json.loads(presentation_path.read_bytes())
    records = {config: archive.record(config), death_config: archive.record(death_config)}
    cached = {}; new_files = set(); all_files = set(); results = []

    def package(sid):
        if sid in cached:
            return cached[sid]
        native = packages[sid]; method = int(native.get("playMethod"))
        if method not in (1, 2):
            raise ValueError("Unsupported playback method; adapter required")
        name = "assets/sound/"+native.get("src")
        if not re.fullmatch(r"assets/sound/swf/s[0-9]+\.swf", name):
            raise ValueError("Unsupported source path")
        records[name] = archive.record(name)
        symbols = {}; sounds = {}
        for kind, payload in tags(archive.raw(name)):
            if kind in (56, 76):
                count = struct.unpack_from("<H", payload)[0]; pos = 2
                for _ in range(count):
                    ident = struct.unpack_from("<H", payload, pos)[0]; pos += 2
                    end = payload.index(b"\0", pos)
                    symbols[payload[pos:end].decode()] = ident; pos = end+1
            elif kind == 14:
                if len(payload) < 10 or payload[2] >> 4 != 2:
                    raise ValueError("Non-MP3 DefineSound requires adapter")
                sounds[struct.unpack_from("<H", payload)[0]] = payload
        clips = []
        for item in native:
            ident = symbols["s"+item.get("id")]
            payload = sounds[ident]; content = payload[9:]
            if content[:3] != b"ID3" and not (content[0] == 255 and content[1] & 224 == 224):
                raise ValueError("Invalid MP3")
            url = f"/assets/audio/sfx/{sid}/{ident}.mp3"
            target = ROOT/"public"/url.lstrip("/")
            sha = hashlib.sha256(content).hexdigest()
            if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() != sha:
                raise ValueError("Refusing to replace different runtime clip")
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                target.write_bytes(content); new_files.add(url)
            all_files.add(url)
            clips.append({"url": url, "symbolId": ident, "itemId": item.get("id"),
                          "weight": number(item.get("percent"), 0),
                          "enabled": item.get("enabled") == "true", "sha256": sha,
                          "bytes": len(content), "sampleCount": struct.unpack_from("<I", payload, 3)[0],
                          "seekSamples": struct.unpack_from("<h", payload, 7)[0]})
        parent = parents[native]
        out = {"source": records[name], "sourceName": native.get("name"),
               "group": parent.get("name"), "method": method,
               "volume": number(native.get("volume"), 100)/100,
               "maxPlayback": min(4, max(1, int(number(native.get("maxPlayback"), 4)))),
               "clips": clips}
        if number(native.get("pitch"), 0) != 0:
            raise ValueError("Pitch adapter required")
        cached[sid] = out
        return out

    for ident in ids:
        source_path = f"assets/battle/role/left/{ident}.swf"
        records[source_path] = archive.record(source_path)
        actions_xml = next(p[6:] for kind, p in tags(archive.raw(source_path))
                           if kind == 87 and p[6:].startswith(b"<actions"))
        actions = ET.fromstring(actions_xml); fps = float(actions.get("frameRate"))
        if not 1 <= fps <= 120:
            raise ValueError("Invalid native FPS")
        mapped = {}; durations = {}
        for action in actions:
            if action.get("name") not in ("A_1hit", "C_dead"):
                continue
            durations[action.get("name")] = max((int(f.get("index", "0"))+int(f.get("length", "1")) for f in action.iter("frame")), default=1)*1000/fps
            events = []
            for frame in action.iter("frame"):
                sid = frame.get("sound")
                if sid:
                    events.append({"frame": int(frame.get("index")), "time": int(frame.get("index"))*1000/fps,
                                   "sound": sid, "volume": number(frame.get("volume"), 100)/100,
                                   "source": "embedded-action"})
                    package(sid)
            mapped[action.get("name")] = events
        death = deaths.get(ident)
        if death:
            package(death)
            mapped.setdefault("C_dead", []).append({"frame": 0, "time": 0, "sound": death,
                                                    "volume": 1, "source": "deathSoundConfig"})
        used = {e["sound"] for events in mapped.values() for e in events}
        voice_groups = {packages[deaths[n]].get("id") for n in ids if n in deaths}
        death_groups = {parents[packages[sid]].get("name") for sid in voice_groups}
        for sid in used:
            cached[sid]["voice"] = cached[sid]["group"] in death_groups
        for events in mapped.values():
            events.sort(key=lambda e: (e["time"], not cached[e["sound"]].get("voice", False)))
        url = f"/assets/audio/entities/{ident}.json"
        write(ROOT/"public"/url.lstrip("/"), {
            "version": 1, "id": ident, "name": catalog[ident]["name"], "fps": fps,
            "source": records[source_path], "sourceConfigs": [records[config], records[death_config]],
            "actions": mapped, "durations": durations, "sounds": {sid: cached[sid] for sid in sorted(used)},
            "adaptation": "Native frame timing scaled to idle action duration; death mapping starts at death animation; at most four shared short voices. Other actions remain pending."
        })
        presentation.setdefault("entityAudio", {})[ident] = {"name": catalog[ident]["name"], "url": url}
        results.append({"id": ident, "actions": {a: len(e) for a, e in mapped.items()}, "url": url})
        print(json.dumps(results[-1]), flush=True)
    assert all(row == archive.record(name) for name, row in records.items())
    write(presentation_path, presentation)
    write(ROOT/"reports/entity-audio-recovery.json", {
        "checkedAt": datetime.now(timezone.utc).isoformat(), "workers": 1,
        "models": results, "packages": len(cached), "clips": len(all_files), "newClipsThisRun": len(new_files),
        "actorOnlyClips": len(all_files - {url for sound in presentation["sounds"].values() for url in sound["urls"]}),
        "sourceHashesPreserved": True, "sources": list(records.values()), "state": "integrated-awaiting-tests",
        "pending": ["Other models and actions, jutsus, world voices, remaining sound packages; all other asset categories remain pending."]
    })

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True); parser.add_argument("--ids", required=True)
    args = parser.parse_args(); ids = args.ids.split(",")
    if not 1 <= len(ids) <= 4 or len(set(ids)) != len(ids) or any(not re.fullmatch(r"[0-9]{8}", i) for i in ids):
        parser.error("One to four explicit model IDs required")
    recover(args.source, ids)
