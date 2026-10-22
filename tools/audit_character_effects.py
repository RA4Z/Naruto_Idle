"""Read-only character/effect dependency audit; no image conversion or AS execution."""
import argparse
from collections import Counter,defaultdict
import hashlib
import json
from pathlib import Path
import struct
import sys
import xml.etree.ElementTree as ET


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',required=True)
    parser.add_argument('--project',required=True);parser.add_argument('--output',required=True)
    args=parser.parse_args();project=Path(args.project).resolve()
    sys.path.insert(0,str(project/'tools'))
    from original_archive import OriginalArchive
    from entity_pipeline import tags
    archive=OriginalArchive(args.source)
    output=Path(args.output).resolve()
    if output.is_relative_to(archive.root):raise ValueError('Originals are read-only')
    configurations={};definitions=defaultdict(list)
    for name in ('assets/battle/Effect.xml','assets/battle/SkillAction.xml','assets/battle/ShareEffect.xml'):
        raw=archive.data(name);root=ET.fromstring(raw)
        configurations[name]={'source':archive.record(name),'rows':len(root)}
        if name.endswith('/Effect.xml'):
            for row in root:
                if row.get('res','').startswith('assets/'):
                    definitions[row.get('res')].append(dict(row.attrib))
    effects=[];formats=Counter();blends=Counter();colors=Counter();frame_attributes=Counter()
    for index,name in enumerate(sorted(p for p in archive.rows if p.startswith('assets/battle/effect/') and p.endswith('.swf'))):
        before=archive.record(name);record={'path':name,'source':before,'bindings':definitions.get(name,[])}
        try:
            records=list(tags(archive.raw(name)));xml=next((p[6:] for k,p in records if k==87 and p[6:].lstrip().startswith(b'<actions')),None)
            symbols={};sprites={}
            for kind,payload in records:
                if kind==39:sprites[str(struct.unpack_from('<H',payload)[0])]=struct.unpack_from('<H',payload,2)[0]
                if kind==76:
                    count=struct.unpack_from('<H',payload)[0];position=2
                    for _ in range(count):
                        ident=struct.unpack_from('<H',payload,position)[0];position+=2;end=payload.index(b'\0',position)
                        symbols[payload[position:end].decode()]=ident;position=end+1
            record['symbols']=symbols;record['spriteFrameCounts']=sprites
            if xml:
                root=ET.fromstring(xml);record['format']='bitmap-actions';record['fps']=float(root.get('frameRate','24'))
                actions=[]
                for action in root.findall('action'):
                    elements=list(action.iter('element'))
                    attrs=sorted({k for e in elements for k in e.attrib}-{'assetId','x','y','alpha','scaleX','scaleY','rotation','extname'})
                    actions.append({'name':action.get('name'),'frames':max((int(f.get('index','0'))+int(f.get('length','1')) for f in action.iter('frame')),default=0),
                                    'unsupportedElementAttributes':attrs,'externalNames':sorted({e.get('extname') for e in elements if e.get('extname')}),
                                    'hasTween':any(f.get('tween')=='true' for f in action.iter('frame'))})
                record['actions']=actions
                blends.update(e.get('blendMode') for e in root.iter('element') if e.get('blendMode'))
                colors.update(e.get('color') for e in root.iter('element') if e.get('color'))
            else:record['format']='static-display-list'
            record['tagCounts']=dict(Counter(k for k,p in records))
        except (ValueError,ET.ParseError,struct.error) as error:record.update(format='blocked',reason=type(error).__name__+': '+str(error))
        assert archive.record(name)==before
        formats[record['format']]+=1;effects.append(record)
        if (index+1)%200==0:print(json.dumps({'effectsAudited':index+1}),flush=True)
    characters=[];missing=Counter();external=Counter();body_blends=Counter();body_colors=Counter();missing_visual=0;markers=0
    for row in json.loads((project/'public/assets/catalog/entities.json').read_bytes())['entities']:
        manifest=json.loads((project/'public'/row['manifestUrl'].lstrip('/')).read_bytes())
        modes={}
        for mode in ('world','battle'):
            path=(project/'public'/row['manifestUrl'].lstrip('/')).parent/mode/'actions.xml'
            if not path.exists():continue
            root=ET.fromstring(path.read_bytes());known=manifest.get('modes',{}).get(mode,{}).get('animations',{});actions=[]
            assets={e.get('id') for e in root.findall('asset')}
            for action in root.findall('action'):
                name=action.get('name');elements=list(action.iter('element'))
                has_body=any(e.get('assetId') in assets and not e.get('extname') for e in elements)
                if name not in known:
                    missing[(mode,name)]+=1;missing_visual+=has_body;markers+=not has_body
                attrs=sorted({k for e in elements for k in e.attrib}-{'assetId','x','y','alpha','scaleX','scaleY','rotation','extname'})
                events=[{'frame':int(f.get('index','0')),'event':f.get('event')} for f in action.iter('frame') if f.get('event')]
                source_frames=max((int(f.get('index','0'))+int(f.get('length','1')) for f in action.iter('frame')),default=0)
                prepared=known.get(name)
                prepared_frames=(len(prepared['timeline']) if prepared.get('timeline') else prepared['frames']) if prepared else None
                actions.append({'name':name,'integrated':name in known,'hasLocalBitmapReferences':has_body,
                                'preparedTimelineFrames':prepared_frames,'timelineLengthMismatch':prepared_frames is not None and prepared_frames!=source_frames,
                                'frames':max((int(f.get('index','0'))+int(f.get('length','1')) for f in action.iter('frame')),default=0),
                                'events':events,'elementFeatures':attrs,'hasTween':any(f.get('tween')=='true' for f in action.iter('frame'))})
                frame_attributes.update(k for f in action.iter('frame') for k in f.attrib)
            external.update(e.get('extname') for e in root.iter('element') if e.get('extname'))
            body_blends.update(e.get('blendMode') for e in root.iter('element') if e.get('blendMode'))
            body_colors.update(e.get('color') for e in root.iter('element') if e.get('color'))
            modes[mode]={'fps':float(root.get('frameRate','24')),'actions':actions}
        characters.append({'id':row['id'],'name':row['name'],'manifest':row['manifestUrl'],'modes':modes})
    report={'scope':'Effects read directly from version-pinned original SWFs; character action metadata from canonical recovered XML, to recheck against original for each conversion. No AS executed.',
            'configurations':configurations,'effectFormats':dict(formats),'effects':effects,'characters':characters,
            'summary':{'effectSources':len(effects),'models':len(characters),'unintegratedActionNames':sum(missing.values()),'unintegratedWithLocalBitmapRefs':missing_visual,'unintegratedWithoutLocalBitmapRefs':markers,
                       'externalNames':dict(external),'bodyBlendModes':dict(body_blends),'effectBlendModes':dict(blends),'bodyColorValues':dict(body_colors),'effectColorValues':dict(colors),'frameAttributes':dict(frame_attributes)},
            'policy':'No source names, anchor-only actions, renderer gaps or unconverted effects are marked complete by inventory alone.'}
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print(json.dumps({'effectFormats':report['effectFormats'],'summary':report['summary']},ensure_ascii=False),flush=True)


if __name__=='__main__':main()
