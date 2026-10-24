"""Exact preferred MME actions previously deferred by the compact role renderer."""
import hashlib
import math
import re
from mme_config import read_config
from recover_bound_effects import source_action_data
from role_export_data import source_key


def role_mme_facts(archive, job):
    logical, name = job['resource'], job['action']
    allowed = (r'assets/battle/role/left/11011821_outdoor\.swf',
        r'assets/battle/role/right/(11000141|11001601)\.swf',
        r'assets/role/npc/scene/npcres/(11005451_outdooreffect|91100112_rpg|92200204_rpg|92200212_rpg)\.swf')
    if (job.get('sourceKind') != 'role-mme-action' or not any(re.fullmatch(p, logical) for p in allowed)
            or not isinstance(name, str) or not 1 <= len(name) <= 512):
        raise ValueError('Explicit pending role MME action required')
    source = archive.record(logical)
    if source != job['source'] or source_key(logical, name) != job['key']:
        raise ValueError('Role MME source or action identity changed')
    root, _, configuration = read_config(archive.raw(logical), action_names={name})
    if configuration != job['configuration']:
        raise ValueError('Preferred role MME configuration changed')
    actions = root.findall('action')
    if len(actions) != 1 or actions[0].get('name') != name:
        raise ValueError('One exact role MME action required')
    action = actions[0]
    frames = max((int(f.get('index', '0')) + int(f.get('length', '1')) for f in action.iter('frame')), default=0)
    fps = float(root.get('frameRate', '24'))
    if not 1 <= frames <= 480 or frames != job['authoredFrames'] or not math.isfinite(fps) or fps <= 0 or fps != job['rootFps']:
        raise ValueError('Role MME authored timing changed')
    for element in action.iter('element'):
        if element.get('extname') or set(element.attrib) - {'assetId', 'x', 'y', 'scaleX', 'scaleY', 'rotation', 'alpha', 'color', 'blendMode', 'filename'}:
            raise ValueError('Unresolved role MME namespace or feature')
        for field in ('x', 'y', 'scaleX', 'scaleY', 'rotation', 'alpha'):
            if field in element.attrib and not math.isfinite(float(element.get(field))):
                raise ValueError('Nonfinite authored role MME field')
    needed = {e.get('assetId') for e in action.iter('element')}
    for asset in root.findall('asset'):
        if asset.get('id') in needed and any(not math.isfinite(float(asset.get(field, '0'))) for field in ('x', 'y')):
            raise ValueError('Nonfinite authored role MME registration')
    if not list(action.iter('element')):
        raise ValueError('Role MME action has no visual element')
    core = archive.record('flash/core/naruto.core.swf')
    if core != job['core'] or archive.record(logical) != source:
        raise ValueError('Role MME original core or source changed')
    return {'sourceKind': 'role-mme-action', 'exportName': name, 'authoredFrames': frames, 'fps': fps,
        'configurationEvidence': configuration, 'rendererSemanticEvidence': core,
        'sourceActionData': source_action_data(root, configuration, name), 'namedInstances': [],
        'sourceExecution': False,
        'scope': 'Preferred original MME graphics data; static display list, no runtime identity or background-dependent blend composition inferred.'}


def validate_role_mme_entry(archive, entry):
    if entry.get('sourceKind') != 'role-mme-action' or entry.get('sourceOnly') is not True:
        raise ValueError('Explicit role MME source-only entry required')
    fact = entry['sourceExport']
    job = {'sourceKind': entry['sourceKind'], 'resource': entry['source']['path'], 'action': entry['definition']['frontAction'],
        'key': entry['id'], 'source': entry['source'], 'authoredFrames': fact['authoredFrames'], 'rootFps': fact['fps'],
        'configuration': fact['configurationEvidence'], 'core': fact['rendererSemanticEvidence']}
    if role_mme_facts(archive, job) != fact or entry['sourceConfig'] != entry['source'] or len(entry['layers']) != 1:
        raise ValueError('Role MME source facts changed')
    layer = entry['layers'][0]
    if (layer['action'] != fact['exportName'] or layer.get('namedInstances') != []
            or layer.get('sourceActionData') != fact['sourceActionData']
            or layer.get('rendererSemanticEvidence') != fact['rendererSemanticEvidence']
            or layer.get('configurationEvidence') != fact['configurationEvidence']
            or layer['validation']['nativeFrames'] != fact['authoredFrames']):
        raise ValueError('Role MME layer metadata changed')
    if layer.get('animation') and (len(layer['animation']['timeline']) != fact['authoredFrames'] or layer['animation']['fps'] != fact['fps']):
        raise ValueError('Role MME animation timing changed')
    return True
