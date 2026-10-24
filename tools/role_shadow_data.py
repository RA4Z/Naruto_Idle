"""Exact shared-shadow dependency, preserved as data; no runtime attachment."""
import hashlib
import io
import struct
import xml.etree.ElementTree as ET
from PIL import Image
from entity_pipeline import tags
from mme_config import read_config
from recover_bound_effects import source_action_data


def exact_asset(root, symbols, name):
    rows = [a for a in root.findall('asset') if a.get('assetName') == name]
    if len(rows) != 1 or rows[0].get('className') not in symbols:
        raise ValueError('Shared asset requires one exact authored name; no suffix alias')
    row = rows[0]
    return {'asset': dict(row.attrib), 'symbolId': symbols[row.get('className')]}


def embedded_png(payload):
    if len(payload) < 14:
        raise ValueError('Truncated DefineBitsJPEG3')
    ident, offset = struct.unpack_from('<HI', payload)
    encoded = payload[6:6 + offset]
    if len(encoded) != offset or 6 + offset != len(payload) or not encoded.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('Only observed complete embedded PNG without separate alpha stream')
    with Image.open(io.BytesIO(encoded)) as image:
        if image.width * image.height > 16_000_000:
            raise ValueError('Shared image pixel budget')
        rgba = image.convert('RGBA')
    try:
        return {'symbolId': ident, 'width': rgba.width, 'height': rgba.height,
            'rgbaSha256': hashlib.sha256(rgba.tobytes()).hexdigest()}
    finally:
        rgba.close()


def shadow_dependency(archive, published):
    logical = 'assets/battle/role/right/11000111.swf'
    share = 'assets/battle/share/bitmapShare.swf'
    action, name = 'A_3hit yingzi', 'yingzi(1).png'
    source, shared_source = archive.record(logical), archive.record(share)
    if published['source'] != shared_source or published.get('nameResolution') != 'exact-assetName-no-suffix-alias':
        raise ValueError('Published shared source changed')
    root, _, evidence = read_config(archive.raw(logical), action_names={action})
    preferred, symbols, config = read_config(archive.raw(share))
    selected = exact_asset(preferred, symbols, name)
    records = list(tags(archive.raw(share)))
    binaries = {struct.unpack_from('<H', p)[0]: p[6:] for k, p in records if k == 87}
    if config['configuration'] != 'ConfigAMF' or 'Config' not in symbols:
        raise ValueError('Both original shared configurations required')
    xml = ET.fromstring(binaries[symbols['Config']])
    xml_selected = exact_asset(xml, symbols, name)
    if (xml_selected['symbolId'] != selected['symbolId'] or any(
            xml_selected['asset'].get(field) != selected['asset'].get(field)
            for field in ('id', 'className', 'assetName', 'x', 'y'))):
        raise ValueError('AMF and XML shadow registrations differ')
    asset = selected['asset']
    payloads = [p for k, p in records if k == 35 and struct.unpack_from('<H', p)[0] == selected['symbolId']]
    if len(payloads) != 1:
        raise ValueError('One exact shared PNG definition required')
    image = embedded_png(payloads[0])
    if (image['width'], image['height'], image['rgbaSha256'], selected['symbolId'], asset['className'],
            [float(asset['x']), float(asset['y'])]) != (published['width'], published['height'], published['rgbaSha256'],
            published['symbolId'], published['className'], published['offset']):
        raise ValueError('Published shadow image or registration differs from original')
    frames = root.find('action').find('layer').findall('frame')
    if len(root.findall('action')) != 1 or len(root.find('action').findall('layer')) != 1:
        raise ValueError('Only the observed external shadow track is supported')
    timeline = []
    for frame in frames:
        elements = frame.findall('element')
        if len(elements) != 1 or elements[0].get('extname') != name or int(frame.get('index')) != len(timeline):
            raise ValueError('Shadow frames must be contiguous with one exact external name')
        for _ in range(int(frame.get('length'))):
            timeline.append({'frame': len(timeline), 'element': dict(elements[0].attrib)})
    if len(timeline) != 28 or archive.record(logical) != source or archive.record(share) != shared_source:
        raise ValueError('Shadow source timeline or bytes changed')
    return {'source': source, 'action': action, 'fps': float(root.get('frameRate')), 'authoredFrames': 28,
        'sourceActionData': source_action_data(root, evidence, action), 'timeline': timeline,
        'exactExternalName': name, 'sharedAsset': published, 'sharedConfigurationEvidence': config,
        'originalSharedXmlAsset': xml_selected['asset'],
        'amfAndXmlRegistrationMatch': True, 'embeddedOriginalPngRgbaMatches': True,
        'sourceExecution': False, 'combatBindingChanged': False, 'runtimeIntegration': 'not-applied',
        'state': 'source-shadow-dependency-complete-rendering-and-world-attachment-pending'}
