"""Compare published events and MP3 payloads directly to the delivered SWF/XML."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import struct
import xml.etree.ElementTree as ET
from original_archive import OriginalArchive
from entity_pipeline import tags
ROOT=Path(__file__).resolve().parents[1]


def digest(raw):return hashlib.sha256(raw).hexdigest()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);args=parser.parse_args()
    archive=OriginalArchive(args.source)
    config='assets/sound/soundConfig.xml';death_config='assets/sound/deathSoundConfig.xml'
    sound_root=ET.fromstring(archive.data(config));parents={c:p for p in sound_root.iter() for c in p}
    packages={p.get('id'):p for p in sound_root.iter('package')}
    deaths={n:row.get('id') for row in ET.fromstring(archive.data(death_config)) for n in row.get('ninjas','').replace(';',',').replace(' ',',').split(',') if n}
    sources={};payloads={};results=[]
    def check_source(record):
        name=record['path']
        if name not in sources:
            sources[name]=archive.record(name)
        assert record['sha256']==sources[name]['sha256'] and record['bytes']==sources[name]['bytes'],name
    presentation=json.loads((ROOT/'public/assets/presentation.json').read_bytes())
    for ident,ref in presentation['entityAudio'].items():
        actor=json.loads((ROOT/'public'/ref['url'].lstrip('/')).read_bytes())
        check_source(actor['source'])
        for record in actor['sourceConfigs']:check_source(record)
        raw=archive.raw(actor['source']['path'])
        native=ET.fromstring(next(p[6:] for kind,p in tags(raw) if kind==87 and p[6:].startswith(b'<actions')))
        fps=float(native.get('frameRate'));assert fps==actor['fps']
        expected=[]
        for action in native:
            name=action.get('name')
            if name not in ('A_1hit','C_dead'):continue
            end=max((int(f.get('index','0'))+int(f.get('length','1')) for f in action.iter('frame')),default=1)
            assert abs(actor['durations'][name]-end*1000/fps)<.001,(ident,name)
            for frame in action.iter('frame'):
                if frame.get('sound'):
                    expected.append((name,int(frame.get('index')),frame.get('sound'),float(frame.get('volume','100'))/100,'embedded-action'))
        if deaths.get(ident):expected.append(('C_dead',0,deaths[ident],1,'deathSoundConfig'))
        actual=[(action,e['frame'],e['sound'],e['volume'],e['source']) for action,events in actor['actions'].items() for e in events]
        actual.extend((e['action'],e['frame'],e['sound'],e['volume'],e['source']) for e in actor.get('unresolvedEvents',[]))
        actual.extend((e['action'],e['frame'],e['sound'],e['volume'],e['source']) for e in actor.get('silentEvents',[]))
        for event in actor.get('silentEvents',[]):
            assert len(packages[event['sound']])==0
            check_source(event['sourceContainer'])
        assert Counter(expected)==Counter(actual),f'Native events changed: {ident}'
        for sid,sound in actor['sounds'].items():
            check_source(sound['source']);native_package=packages[sid]
            assert sound['source']['path']=='assets/sound/'+native_package.get('src')
            groups=[];ancestor=parents[native_package]
            while ancestor is not None:
                if ancestor.get('name'):groups.append(ancestor.get('name'))
                ancestor=parents.get(ancestor)
            assert sound['voice']==('voice' in groups),(ident,sid,'voice classification')
            name=sound['source']['path']
            if name not in payloads:
                sounds={};symbols={}
                for kind,p in tags(archive.raw(name)):
                    if kind==14:
                        assert p[2]>>4==2
                        sounds[struct.unpack_from('<H',p)[0]]=digest(p[9:])
                    elif kind in (56,76):
                        count=struct.unpack_from('<H',p)[0];position=2
                        for _ in range(count):
                            symbol=struct.unpack_from('<H',p,position)[0];position+=2
                            end=p.index(b'\0',position);symbols[p[position:end].decode()]=symbol;position=end+1
                payloads[name]=(sounds,symbols)
            sounds,symbols=payloads[name]
            assert len(sound['clips'])==len(native_package)
            for clip,item in zip(sound['clips'],native_package):
                assert clip['itemId']==item.get('id') and clip['symbolId']==symbols['s'+item.get('id')]
                assert clip['weight']==float(item.get('percent','0')) and clip['enabled']==(item.get('enabled')=='true')
                assert clip['sha256']==sounds[clip['symbolId']]==digest((ROOT/'public'/clip['url'].lstrip('/')).read_bytes())
        results.append({'id':ident,'nativeEventsMatched':len(expected),'silentEvents':len(actor.get('silentEvents',[])),'unresolvedEvents':len(actor.get('unresolvedEvents',[]))})
    assert all(record==archive.record(name) for name,record in sources.items())
    report={'models':len(results),'nativeEventsMatched':sum(r['nativeEventsMatched'] for r in results),'sourceFiles':len(sources),'sourceHashesPreserved':True,'soundContainersCompared':len(payloads),'silentEvents':sum(r['silentEvents'] for r in results),'unresolvedEvents':sum(r['unresolvedEvents'] for r in results),'state':'validated','scope':'Every published attack/death event including silent and unresolved events matches native XML; each published MP3 equals its linked DefineSound payload. Other actions remain pending.','results':results}
    (ROOT/'reports/actor-audio-source-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='results'}),flush=True)


if __name__=='__main__':main()
