"""Read the MME graphics data source preferred by the original static renderer.

ConfigAMF wins over Config, exactly as MmeAsset.getMmeData does. AMF aliases
remain data; no source constructors or serializers are invoked.
"""
import hashlib,math,re,struct,xml.etree.ElementTree as ET
from static_amf3 import AMF3

def sequence(value):
    if isinstance(value,list):return value
    if isinstance(value,dict):
        if '__vector__' in value:return value['__vector__']
        if '__dense__' in value:return value['__dense__']
    raise ValueError('Expected static MME data sequence')

def number(value):
    if not isinstance(value,(int,float)) or isinstance(value,bool) or not math.isfinite(value):raise ValueError('Non-numeric MME graphics field')
    return repr(value)

def amf_to_xml(data):
    if not data.get('__class__','').endswith('::MmeData'):raise ValueError('Unexpected MME root alias')
    if data.get('advanced'):raise ValueError('Advanced FLA renderer requires a separate adapter')
    root=ET.Element('actions',{'frameRate':number(data['frameRate'])})
    table=data['assetDatas']
    if '__dictionary__' not in table:raise ValueError('Unexpected MME asset table')
    actions=sequence(data['actionDatas'])
    referenced={element.get('assetName') for action in actions for layer in sequence(action['layerDatas']) for frame in sequence(layer['frameDatas'])
                if (element:=frame.get('element')) and element.get('__class__','').endswith('::ElementData') and not element.get('extname')}
    for key,asset in table['__dictionary__']:
        if not isinstance(key,str) or not re.fullmatch(r'Asset_\d+',key):
            if key not in referenced:continue
            raise ValueError('Unexpected referenced asset namespace')
        ET.SubElement(root,'asset',{'id':key[6:],'className':asset['className'],'assetName':asset['assetName'],'x':number(asset['x']),'y':number(asset['y'])})
    for action in actions:
        target=ET.SubElement(root,'action',{'name':action['name']})
        for layer in sequence(action['layerDatas']):
            dest=ET.SubElement(target,'layer')
            for frame in sequence(layer['frameDatas']):
                attrs={'index':str(int(frame['index'])),'length':str(int(frame['length']))}
                for field in ('event','sound','volume'):
                    if frame.get(field):attrs[field]=str(frame[field])
                if frame.get('useTween'):attrs['tween']='true'
                keyframe=ET.SubElement(dest,'frame',attrs);element=frame.get('element')
                if element is None:continue
                alias=element.get('__class__','')
                if alias.endswith('::PointElementData'):
                    ET.SubElement(keyframe,'pointElement',{'name':str(element.get('name','')),'x':number(element['x']),'y':number(element['y'])});continue
                if not alias.endswith('::ElementData'):raise ValueError('Unsupported MME element alias')
                expected='Asset_'+str(int(element['assetId']))
                if not element.get('extname') and element.get('assetName',expected)!=expected:raise ValueError('Referenced MME asset alias requires an explicit adapter')
                fields={'assetId':str(int(element['assetId']))}
                for field,default in [('x',0),('y',0),('alpha',1),('scaleX',1),('scaleY',1),('rotation',0)]:fields[field]=number(element.get(field,default))
                for field in ('extname','blendMode'):
                    if element.get(field):fields[field]=str(element[field])
                color=element.get('color')
                if color and not color['empty']:fields['color']=format(int(color['color'])&0xffffffff,'x')
                ET.SubElement(keyframe,'element',fields)
    return root

def read_config(raw):
    from entity_pipeline import tags
    records=list(tags(raw));symbols={};binaries={}
    for kind,payload in records:
        if kind==87:binaries[struct.unpack_from('<H',payload)[0]]=payload[6:]
        if kind==76:
            position=2
            for _ in range(struct.unpack_from('<H',payload)[0]):
                ident=struct.unpack_from('<H',payload,position)[0];position+=2;end=payload.index(b'\0',position)
                symbols[payload[position:end].decode()]=ident;position=end+1
    if 'ConfigAMF' in symbols:
        raw_config=binaries[symbols['ConfigAMF']];reader=AMF3(raw_config);data=reader.read()
        if reader.position!=len(raw_config):raise ValueError('Trailing AMF graphics data requires inspection')
        root=amf_to_xml(data);kind='ConfigAMF'
    else:
        raw_config=binaries[symbols['Config']];root=ET.fromstring(raw_config);kind='Config'
        if root.get('advanced')=='true':raise ValueError('Advanced FLA renderer requires a separate adapter')
    return root,symbols,{'configuration':kind,'configurationSha256':hashlib.sha256(raw_config).hexdigest()}
