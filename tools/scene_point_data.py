"""Read the observed one-frame scene posData anchors; never execute source scripts.

Narrow support: PlaceObject2 with Character+Matrix+Name only, referencing an
empty sprite. Unknown placement flags, animation or visual definitions fail.
"""
import hashlib
import re
import struct
from entity_pipeline import tags
from swf_bytes import decode


def nested_tags(sprite):
    offset = 4
    while offset < len(sprite):
        if offset + 2 > len(sprite):
            raise ValueError('Truncated sprite tag header')
        header = struct.unpack_from('<H', sprite, offset)[0]
        offset += 2
        length = header & 63
        if length == 63:
            if offset + 4 > len(sprite):
                raise ValueError('Truncated sprite tag length')
            length = struct.unpack_from('<I', sprite, offset)[0]
            offset += 4
        if offset + length > len(sprite):
            raise ValueError('Truncated sprite tag body')
        yield header >> 6, sprite[offset:offset + length]
        offset += length


class Bits:
    def __init__(self, data):
        self.data, self.position = data, 0

    def unsigned(self, count):
        if not 0 <= count <= 32 or self.position + count > len(self.data) * 8:
            raise ValueError('Truncated or invalid MATRIX bit field')
        value = 0
        for _ in range(count):
            value = (value << 1) | ((self.data[self.position // 8] >> (7 - self.position % 8)) & 1)
            self.position += 1
        return value

    def signed(self, count):
        value = self.unsigned(count)
        return value - (1 << count) if count and value & (1 << (count - 1)) else value


def matrix(data):
    bits = Bits(data)
    sx = sy = 65536
    rx = ry = 0
    if bits.unsigned(1):
        count = bits.unsigned(5)
        sx, sy = bits.signed(count), bits.signed(count)
    if bits.unsigned(1):
        count = bits.unsigned(5)
        rx, ry = bits.signed(count), bits.signed(count)
    count = bits.unsigned(5)
    tx, ty = bits.signed(count), bits.signed(count)
    return {'scaleXFixed16': sx, 'scaleYFixed16': sy, 'rotateSkew0Fixed16': rx,
            'rotateSkew1Fixed16': ry, 'translateXTwips': tx, 'translateYTwips': ty}, (bits.position + 7) // 8


def source_points(archive, job):
    logical = job['resource']
    if (job.get('sourceKind') != 'scene-exported-sprite' or job.get('action') != 'posData'
            or not re.fullmatch(r'assets/role/npc/scene/npcres/[A-Za-z0-9_]+\.swf', logical)):
        raise ValueError('Only explicitly planned scene posData sources are supported')
    source = archive.record(logical)
    key = 'source:' + hashlib.sha256(logical.encode()).hexdigest()[:16] + ':' + hashlib.sha256(b'posData').hexdigest()[:12]
    if source != job['source'] or job['key'] != key:
        raise ValueError('Source identity changed')
    raw = archive.raw(logical)
    records = list(tags(raw))
    symbols = {}
    sprites = {}
    for kind, payload in records:
        if kind == 39:
            symbol = struct.unpack_from('<H', payload)[0]
            if symbol in sprites:
                raise ValueError('Duplicate sprite definition')
            sprites[symbol] = payload
        elif kind == 76:
            count, = struct.unpack_from('<H', payload)
            offset = 2
            for _ in range(count):
                symbol, = struct.unpack_from('<H', payload, offset)
                offset += 2
                end = payload.index(b'\0', offset)
                name = payload[offset:end].decode('utf-8')
                if name in symbols:
                    raise ValueError('Ambiguous exported symbol')
                symbols[name] = symbol
                offset = end + 1
    symbol = symbols.get('posData')
    if symbol != job['symbolId'] or symbol not in sprites:
        raise ValueError('Exported posData symbol differs from source plan')
    sprite = sprites[symbol]
    if struct.unpack_from('<H', sprite, 2)[0] != 1 or job['authoredFrames'] != 1:
        raise ValueError('Animated point data requires a separate adapter')
    rows = list(nested_tags(sprite))
    if not 3 <= len(rows) <= 18 or [kind for kind, _ in rows[-2:]] != [1, 0] or any(payload for _, payload in rows[-2:]):
        raise ValueError('Expected one complete frame and terminal End tag')
    points, names, depths, references = [], set(), set(), []
    for kind, payload in rows[:-2]:
        if kind != 26 or len(payload) < 7 or payload[0] != 0x26:
            raise ValueError('Unsupported scene point placement or script tag')
        depth, character = struct.unpack_from('<HH', payload, 1)
        transform, used = matrix(payload[5:])
        name_bytes = payload[5 + used:]
        if not name_bytes.endswith(b'\0') or b'\0' in name_bytes[:-1]:
            raise ValueError('Malformed point name or trailing placement data')
        name = name_bytes[:-1].decode('utf-8')
        if not 1 <= len(name) <= 512 or name in names or depth in depths:
            raise ValueError('Empty or ambiguous point instance')
        names.add(name); depths.add(depth)
        child = sprites.get(character)
        if child is None or struct.unpack_from('<H', child, 2)[0] != 1 or list(nested_tags(child)) != [(1, b''), (0, b'')]:
            raise ValueError('Point references a visual, scripted or unresolved character')
        references.append({'symbolId': character, 'spriteSha256': hashlib.sha256(child).hexdigest(),
                           'state': 'one-frame-empty-sprite'})
        points.append({'frame': 0, 'name': name, 'depth': depth, 'characterId': character,
                       'x': transform['translateXTwips'] / 20, 'y': transform['translateYTwips'] / 20,
                       'matrix': transform})
    decoded = decode(raw)
    fps_at = 8 + (5 + 4 * (decoded[8] >> 3) + 7) // 8
    fps = struct.unpack_from('<H', decoded, fps_at)[0] / 256
    if fps != job['rootFps'] or archive.record(logical) != source:
        raise ValueError('Source fps or bytes changed')
    return {'key': key, 'source': source, 'sourceKind': job['sourceKind'], 'symbolId': symbol,
            'exportName': 'posData', 'authoredFrames': 1, 'fps': fps, 'points': points,
            'sourceSpriteSha256': hashlib.sha256(sprite).hexdigest(), 'referencedEmptySprites': references,
            'coordinateModel': 'authored-scene-local-twips-divided-by20-no-world-attachment',
            'state': 'source-point-metadata-complete-runtime-attachment-pending',
            'sourceExecution': False, 'visualAnimationInstalled': False, 'combatBindingChanged': False}
