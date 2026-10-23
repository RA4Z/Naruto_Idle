"""Compare the two original MME representations without rendering or execution."""
import argparse,hashlib,json,sys,xml.etree.ElementTree as ET
from pathlib import Path
from mme_config import read_config

def visual(element):
    if element is None:return None
    if element.tag=='pointElement':return {'kind':'point','name':element.get('name',''),'x':float(element.get('x','0')),'y':float(element.get('y','0'))}
    # External elements resolve by exact extname; their serialized local ID is
    # a placeholder (XML often omits it, AMF stores -1), never a local bitmap.
    result={'kind':'bitmap','assetId':-1 if element.get('extname') else int(element.get('assetId','0')),'extname':element.get('extname',''),'blendMode':element.get('blendMode') or 'normal'}
    for key,default in [('x',0),('y',0),('rotation',0),('alpha',1),('scaleX',1),('scaleY',1)]:result[key]=float(element.get(key,default))
    color=int(element.get('color') or '0',16);result['color']=color if color>>24 else 0
    return result

def semantic(root):
    actions={};needed=set()
    for action in root.findall('action'):
        layers=[]
        for layer in action.findall('layer'):
            frames=[]
            for frame in layer.findall('frame'):
                point=frame.find('pointElement');element=point if point is not None else frame.find('element')
                pose=visual(element)
                if pose and pose['kind']=='bitmap' and not pose['extname']:needed.add(str(pose['assetId']))
                frames.append({'index':int(frame.get('index','0')),'length':int(frame.get('length','1')),
                    'event':frame.get('event',''),'sound':int(frame.get('sound') or 0),'volume':int(frame.get('volume') or 0),
                    'tween':frame.get('tween')=='true','pose':pose})
            layers.append(frames)
        if action.get('name') in actions:raise ValueError('Duplicate source action name')
        actions[action.get('name')]=layers
    assets={a.get('id'):{'className':a.get('className'),'x':float(a.get('x','0')),'y':float(a.get('y','0'))} for a in root.findall('asset') if a.get('id') in needed}
    return {'fps':float(root.get('frameRate','24')),'assets':assets,'actions':actions}

def main():
    ap=argparse.ArgumentParser()
    for key in ('source','project','report'):ap.add_argument('--'+key,type=Path,required=True)
    ap.add_argument('--ids',required=True);args=ap.parse_args();ids=args.ids.split(',')
    if not 1<=len(ids)<=4 or any(not i.isdigit() for i in ids):raise ValueError('One to four source models per audit batch')
    sys.path.insert(0,str(args.project/'tools'))
    from original_archive import OriginalArchive
    from entity_pipeline import tags
    archive=OriginalArchive(args.source);rows=[]
    catalog={e['id']:e for e in json.loads((args.project/'public/assets/catalog/entities.json').read_bytes())['entities']}
    for ident in ids:
        path=args.project/'public'/catalog[ident]['manifestUrl'].lstrip('/');current_bytes=path.read_bytes();current=json.loads(current_bytes)
        for logical in (f'assets/battle/role/left/{ident}.swf',f'assets/role/npc/scene/npcres/{ident}_outdoor.swf'):
            if logical not in archive.rows:continue
            evidence=archive.record(logical);raw=archive.raw(logical)
            try:
                xml=next(p[6:] for kind,p in tags(raw) if kind==87 and p[6:].lstrip().startswith(b'<actions'))
                preferred,_,config=read_config(raw);left=semantic(ET.fromstring(xml));right=semantic(preferred)
                changed=[name for name in set(left['actions'])|set(right['actions']) if left['actions'].get(name)!=right['actions'].get(name)]
                asset_ids={key for key in set(left['assets'])|set(right['assets']) if left['assets'].get(key)!=right['assets'].get(key)}
                affected=set(changed)
                for name,layers in right['actions'].items():
                    if left['fps']!=right['fps'] or any(frame['pose'] and frame['pose']['kind']=='bitmap' and not frame['pose']['extname'] and str(frame['pose']['assetId']) in asset_ids for layer in layers for frame in layer):affected.add(name)
                mode='world' if logical.endswith('_outdoor.swf') else 'battle';prepared=current.get('modes',{}).get(mode,{}).get('animations',{})
                rows.append({'id':ident,'source':evidence,'preferredConfiguration':config,'semanticMatch':left==right,
                    'mode':mode,'manifest':catalog[ident]['manifestUrl'],'currentManifestSha256':hashlib.sha256(current_bytes).hexdigest(),
                    'changedActions':sorted(changed),'changedAssetIds':sorted(asset_ids),'affectedActions':sorted(affected),
                    'affectedCurrentActions':{name:prepared[name].get('status') for name in sorted(affected) if name in prepared},
                    'affectedMissingActions':sorted(affected-set(prepared)),
                    'assetRegistrationMatch':left['assets']==right['assets'],'fpsMatch':left['fps']==right['fps']})
            except (ValueError,KeyError,StopIteration,ET.ParseError) as error:rows.append({'id':ident,'source':evidence,'state':'adapter-required','reason':str(error)})
            assert archive.record(logical)==evidence
    report={'sourceExecution':False,'rows':rows,'semanticMatches':sum(r.get('semanticMatch',False) for r in rows),'mismatches':sum(r.get('semanticMatch') is False for r in rows)}
    args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
