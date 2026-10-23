"""Prepare expanded MME display-list data, preserving original asset namespaces."""
import xml.etree.ElementTree as ET
from mme_config import read_config
from native_tween import expand_tweens

def prepare_spec(raw,action_name,path):
    root,symbols,evidence=read_config(raw)
    expanded=expand_tweens(root,{action_name});action=next((a for a in expanded.findall('action') if a.get('name')==action_name),None)
    if action is None:raise ValueError('Exact MME action missing: '+action_name)
    allowed={'assetId','x','y','scaleX','scaleY','rotation','alpha','color','blendMode','filename'}
    for element in action.iter('element'):
        unknown=set(element.attrib)-allowed
        if unknown:raise ValueError('MME feature requires an adapter: '+str(sorted(unknown)))
    count=max((int(f.get('index','0'))+int(f.get('length','1')) for f in action.iter('frame')),default=0)
    if not 1<=count<=480:raise ValueError('Native MME frame budget exceeded')
    spec=ET.Element('render',{'fps':root.get('frameRate','24'),'frameCount':str(count)})
    needed={e.get('assetId') for e in action.iter('element')};assets={a.get('id'):a for a in root.findall('asset')}
    for ident in sorted(needed):
        asset=assets.get(ident)
        if asset is None or asset.get('className') not in symbols:raise ValueError('Unresolved MME bitmap class: '+str(ident))
        ET.SubElement(spec,'asset',{**asset.attrib,'symbolId':str(symbols[asset.get('className')])})
    spec.append(action);path.parent.mkdir(parents=True,exist_ok=True);ET.ElementTree(spec).write(path,encoding='utf-8',xml_declaration=True)
    return evidence
