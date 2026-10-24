"""Preserve explicitly selected role _Data timelines as inert source metadata.

No rendering, AVM execution, skill identity, hitbox or runtime attachment.
Only the observed named PlaceObject2 variants and RemoveObject2 are accepted.
Referenced marker artwork is fingerprinted, never declared an empty sprite.
"""
import collections
import hashlib
import re
import struct

from entity_pipeline import tags
from scene_point_data import matrix, nested_tags
from swf_bytes import decode


def source_key(logical, action):
    return 'source:' + hashlib.sha256(logical.encode()).hexdigest()[:16] + ':' + hashlib.sha256(action.encode()).hexdigest()[:12]


def exported_definitions(raw):
    symbols, sprites = {}, {}
    for kind, payload in tags(raw):
        if kind == 39:
            if len(payload) < 4:
                raise ValueError('Truncated sprite')
            ident = struct.unpack_from('<H', payload)[0]
            if ident in sprites:
                raise ValueError('Duplicate sprite')
            sprites[ident] = payload
        elif kind == 76:
            count, = struct.unpack_from('<H', payload)
            offset = 2
            for _ in range(count):
                ident, = struct.unpack_from('<H', payload, offset)
                offset += 2
                end = payload.index(b'\0', offset)
                name = payload[offset:end].decode('utf-8')
                if not name or name in symbols:
                    raise ValueError('Ambiguous exported symbol')
                symbols[name] = ident
                offset = end + 1
            if offset != len(payload):
                raise ValueError('Trailing symbol data')
    return symbols, sprites


def timeline(sprite, sprites):
    authored, = struct.unpack_from('<H', sprite, 2)
    if not 1 <= authored <= 480:
        raise ValueError('Data timeline frame budget exceeded')
    rows = list(nested_tags(sprite))
    if not rows or rows[-1] != (0, b'') or any(kind == 0 for kind, _ in rows[:-1]):
        raise ValueError('Missing or nonterminal End')
    layers, labels, frames, references = {}, [], [], {}
    for kind, payload in rows[:-1]:
        if len(frames) >= authored:
            raise ValueError('Tags after final authored frame')
        if kind == 26:
            if len(payload) < 7 or payload[0] not in (0x26, 0x36):
                raise ValueError('Unsupported placement flags; no move, scripts or unnamed objects')
            depth, character = struct.unpack_from('<HH', payload, 1)
            transform, used = matrix(payload[5:])
            offset = 5 + used
            ratio = None
            if payload[0] & 16:
                ratio, = struct.unpack_from('<H', payload, offset)
                offset += 2
            tail = payload[offset:]
            if not tail.endswith(b'\0') or b'\0' in tail[:-1]:
                raise ValueError('Malformed instance name')
            name = tail[:-1].decode('utf-8')
            if not depth or not 1 <= len(name) <= 512:
                raise ValueError('Invalid depth or instance name')
            child = sprites.get(character)
            if child is None:
                raise ValueError('Unresolved marker sprite')
            # These marker sprites can contain drawing. Keep their exact identity,
            # without converting them into an empty point or publishing artwork.
            references[character] = {'symbolId': character, 'spriteSha256': hashlib.sha256(child).hexdigest(),
                'authoredFrames': struct.unpack_from('<H', child, 2)[0],
                'tagCounts': dict(sorted(collections.Counter(str(k) for k, _ in nested_tags(child)).items())),
                'state': 'referenced-source-marker-not-rendered'}
            layers[depth] = {'depth': depth, 'characterId': character, 'name': name, 'ratio': ratio,
                'x': transform['translateXTwips'] / 20, 'y': transform['translateYTwips'] / 20, 'matrix': transform}
        elif kind == 28:
            if len(payload) != 2:
                raise ValueError('Malformed removal')
            depth, = struct.unpack('<H', payload)
            if depth not in layers:
                raise ValueError('Removal of unresolved depth')
            del layers[depth]
        elif kind == 43:
            end = payload.index(b'\0')
            tail = payload[end + 1:]
            if tail not in (b'', b'\x00', b'\x01'):
                raise ValueError('Unsupported FrameLabel extension')
            labels.append({'name': payload[:end].decode('utf-8'),
                'namedAnchor': bool(tail[0]) if tail else None, 'sourcePayloadHex': payload.hex()})
        elif kind == 1:
            if payload:
                raise ValueError('ShowFrame must be empty')
            points = [dict(layers[depth]) for depth in sorted(layers)]
            if len({p['name'] for p in points}) != len(points):
                raise ValueError('Ambiguous named points in frame')
            frames.append({'frame': len(frames), 'points': points, 'labels': labels})
            labels = []
        else:
            raise ValueError(f'Unsupported data tag {kind}; no scripts or guessed semantics')
    if len(frames) != authored or labels:
        raise ValueError('Authored and observed frame counts differ')
    return frames, list(references.values())


def source_data(archive, job):
    logical, action = job['resource'], job['action']
    if (job.get('sourceKind') != 'role-left-exported-data'
            or not re.fullmatch(r'assets/battle/role/left/(19001201|13000[1-6]01)\.swf', logical)
            or not re.fullmatch(r'[A-Za-z0-9_]+_Data', action)):
        raise ValueError('Only explicitly planned primary role _Data sources are supported')
    source = archive.record(logical)
    if source != job['source'] or job['key'] != source_key(logical, action):
        raise ValueError('Source or action identity changed')
    raw = archive.raw(logical)
    symbols, sprites = exported_definitions(raw)
    ident = symbols.get(action)
    if ident != job['symbolId'] or ident not in sprites:
        raise ValueError('Exported data symbol differs from source plan')
    sprite = sprites[ident]
    frames, references = timeline(sprite, sprites)
    decoded = decode(raw)
    offset = 8 + (5 + 4 * (decoded[8] >> 3) + 7) // 8
    fps = struct.unpack_from('<H', decoded, offset)[0] / 256
    if len(frames) != job['authoredFrames'] or fps != job['rootFps'] or archive.record(logical) != source:
        raise ValueError('Source fps, frames or bytes changed')
    sibling = action[:-5]
    pair = {'exportName': sibling, 'symbolId': symbols[sibling],
        'authoredFrames': struct.unpack_from('<H', sprites[symbols[sibling]], 2)[0],
        'basis': 'exact-export-name-only-no-runtime-binding'} if symbols.get(sibling) in sprites else None
    return {'key': job['key'], 'source': source, 'sourceKind': job['sourceKind'],
        'symbolId': ident, 'exportName': action, 'authoredFrames': len(frames), 'fps': fps,
        'sourceSpriteSha256': hashlib.sha256(sprite).hexdigest(), 'frames': frames,
        'referencedMarkerSprites': references, 'visualSiblingHint': pair,
        'coordinateModel': 'authored-role-local-twips-divided-by20-no-world-attachment',
        'frameIndexBase': 0, 'labelsAreInert': True,
        'state': 'source-data-timeline-complete-runtime-binding-pending',
        'sourceExecution': False, 'visualAnimationInstalled': False, 'combatBindingChanged': False}
