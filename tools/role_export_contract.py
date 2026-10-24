"""Explicit original-source contract for the remaining primary role visual exports."""
import collections
import hashlib
import math
import re
import struct
from entity_pipeline import tags
from scene_point_data import nested_tags
from swf_bytes import decode


def role_export_facts(archive, job):
    logical, action = job['resource'], job['action']
    if (job.get('sourceKind') != 'role-left-exported-sprite'
            or not re.fullmatch(r'assets/battle/role/left/(19001201|13000[1-6]01)\.swf', logical)
            or not isinstance(action, str) or not 1 <= len(action) <= 512 or action.endswith('_Data')):
        raise ValueError('An explicit role visual export is required; _Data uses its metadata adapter')
    source = archive.record(logical)
    key = 'source:' + hashlib.sha256(logical.encode()).hexdigest()[:16] + ':' + hashlib.sha256(action.encode()).hexdigest()[:12]
    if source != job['source'] or key != job['key']:
        raise ValueError('Planned role source or action identity changed')
    raw = archive.raw(logical)
    records = list(tags(raw))
    symbols, sprites = {}, {}
    for kind, payload in records:
        if kind == 39:
            ident = struct.unpack_from('<H', payload)[0]
            if ident in sprites:
                raise ValueError('Duplicate role sprite')
            sprites[ident] = payload
        elif kind == 76:
            count = struct.unpack_from('<H', payload)[0]
            offset = 2
            for _ in range(count):
                ident = struct.unpack_from('<H', payload, offset)[0]
                offset += 2
                end = payload.index(b'\0', offset)
                name = payload[offset:end].decode('utf-8')
                if name in symbols:
                    raise ValueError('Ambiguous role export')
                symbols[name] = ident
                offset = end + 1
        elif kind == 87 and payload[6:].lstrip().startswith(b'<actions'):
            raise ValueError('Role MME data requires a separate explicit adapter')
    symbol = symbols.get(action)
    if symbol is None or symbol != job['symbolId'] or symbol not in sprites:
        raise ValueError('Exact role sprite export differs from plan')
    sprite = sprites[symbol]
    frames = struct.unpack_from('<H', sprite, 2)[0]
    rows = list(nested_tags(sprite))
    counts = collections.Counter(kind for kind, _ in rows)
    if not 1 <= frames <= 480 or frames != job['authoredFrames'] or counts[1] != frames:
        raise ValueError('Role source frame count differs from plan or timeline')
    if counts[0] != 1 or rows[-1] != (0, b'') or any(kind in (0, 1) and payload for kind, payload in rows):
        raise ValueError('Malformed role source timeline')
    if set(counts) - {0, 1, 26, 28, 43, 70}:
        raise ValueError('Role timeline feature requires an explicit adapter')
    labels, frame = [], 0
    for kind, payload in rows:
        if kind == 1:
            frame += 1
        elif kind == 43:
            end = payload.index(b'\0')
            suffix = payload[end + 1:]
            if suffix not in (b'', b'\0', b'\1') or frame >= frames:
                raise ValueError('Malformed role source frame label')
            labels.append({'frame': frame, 'name': payload[:end].decode('utf-8'),
                           'namedAnchor': bool(suffix and suffix[0])})
        if kind in (26, 70):
            if not payload or payload[0] & 0x20:
                raise ValueError('Named role visual placements require independent point validation')
    decoded = decode(raw)
    fps_at = 8 + (5 + 4 * (decoded[8] >> 3) + 7) // 8
    fps = struct.unpack_from('<H', decoded, fps_at)[0] / 256
    if not math.isfinite(fps) or fps <= 0 or fps != job['rootFps'] or archive.record(logical) != source:
        raise ValueError('Role source fps or original bytes changed')
    companion = symbols.get(action + '_Data')
    data_hint = {'exportName': action + '_Data', 'symbolId': companion,
                 'authoredFrames': struct.unpack_from('<H', sprites[companion], 2)[0],
                 'sourceSpriteSha256': hashlib.sha256(sprites[companion]).hexdigest(),
                 'basis': 'exact-export-name-only-no-runtime-binding'} if companion in sprites else None
    return {'sourceKind': 'role-left-exported-sprite', 'exportName': action, 'symbolId': symbol,
            'authoredFrames': frames, 'fps': fps, 'sourceSpriteSha256': hashlib.sha256(sprite).hexdigest(),
            'sourceTagCounts': {str(kind): count for kind, count in counts.items()},
            'frameLabels': labels, 'namedInstances': [], 'dataCompanionHint': data_hint, 'sourceExecution': False,
            'scope': 'Exact original exported visual timeline; no gameplay identity or runtime script behavior inferred.'}


def validate_role_entry(archive, entry):
    if entry.get('sourceKind') != 'role-left-exported-sprite' or entry.get('sourceOnly') is not True:
        raise ValueError('Not a role source-only entry')
    fact = entry['sourceExport']
    job = {'sourceKind': entry['sourceKind'], 'resource': entry['source']['path'],
           'action': entry['definition']['frontAction'], 'key': entry['id'], 'source': entry['source'],
           'symbolId': fact['symbolId'], 'authoredFrames': fact['authoredFrames'], 'rootFps': fact['fps']}
    if role_export_facts(archive, job) != fact or entry['sourceConfig'] != entry['source']:
        raise ValueError('Role source facts or provenance changed')
    if len(entry['layers']) != 1:
        raise ValueError('One exact role export per entry required')
    layer = entry['layers'][0]
    if layer['action'] != fact['exportName'] or layer.get('namedInstances') != []:
        raise ValueError('Role action or independently verified point metadata changed')
    proof = layer['validation']
    if proof['nativeFrames'] != fact['authoredFrames']:
        raise ValueError('Role rendered frame count differs from original export')
    if layer.get('animation'):
        animation = layer['animation']
        if len(animation['timeline']) != fact['authoredFrames'] or animation['fps'] != fact['fps']:
            raise ValueError('Role atlas fps or timeline differs from original')
    return True
