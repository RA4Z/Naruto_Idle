"""Prove empty exported timelines without treating transparency as extracted art."""
import collections
import hashlib
import json
import struct
from pathlib import Path
from PIL import Image
from entity_pipeline import tags


def sprite_tags(data):
    position = 4  # DefineSprite ID and declared frame count.
    rows = []
    while position < len(data):
        if position + 2 > len(data):
            raise ValueError('Truncated sprite tag header')
        header = struct.unpack_from('<H', data, position)[0]
        position += 2
        size, kind = header & 63, header >> 6
        if size == 63:
            if position + 4 > len(data):
                raise ValueError('Truncated sprite tag length')
            size = struct.unpack_from('<I', data, position)[0]
            position += 4
        if position + size > len(data):
            raise ValueError('Truncated sprite tag payload')
        if kind in (0, 1) and size != 0:
            raise ValueError('Malformed empty timeline control tag')
        rows.append(kind)
        position += size
    return rows


def review_empty_export(archive, job, work):
    logical, action = job['resource'], job['action']
    if not logical.startswith('assets/battle/effect/'):
        raise ValueError('Only explicit battle source exports are eligible')
    source_key = hashlib.sha256(logical.encode()).hexdigest()[:16]
    key = 'source:' + source_key + ':' + hashlib.sha256(action.encode()).hexdigest()[:12]
    before = archive.record(logical)
    if job['source'] != before or job['key'] != key:
        raise ValueError('Source or job changed before empty-timeline review')
    records = list(tags(archive.raw(logical)))
    symbols = {}
    for kind, payload in records:
        if kind != 76:
            continue
        count = struct.unpack_from('<H', payload)[0]
        position = 2
        for _ in range(count):
            symbol = struct.unpack_from('<H', payload, position)[0]
            position += 2
            end = payload.index(b'\0', position)
            name = payload[position:end].decode('utf-8')
            if name in symbols:
                raise ValueError('Ambiguous exported sprite')
            symbols[name] = symbol
            position = end + 1
    symbol = symbols.get(action)
    sprites = [p for kind, p in records if kind == 39 and struct.unpack_from('<H', p)[0] == symbol]
    if len(sprites) != 1:
        raise ValueError('Exact exported sprite not found')
    sprite = sprites[0]
    kinds = sprite_tags(sprite)
    counts = collections.Counter(kinds)
    frames = struct.unpack_from('<H', sprite, 2)[0]
    # End, ShowFrame and FrameLabel only. Never accept placements, nested
    # definitions, masks, filters, sounds, AVM/action tags or unknown features.
    if set(kinds) - {0, 1, 43} or counts[0] != 1 or kinds[-1] != 0:
        raise ValueError('Sprite is not a strictly empty display timeline')
    if not 1 <= frames <= 480 or counts[1] != frames:
        raise ValueError('Declared source frame count does not match timeline')
    folder = Path(work) / source_key / str(symbol)
    metadata_path = folder / 'render.json'
    metadata = json.loads(metadata_path.read_bytes())
    if (metadata.get('symbolId') != symbol or metadata.get('frameCount') != frames
            or metadata.get('staticOnly') is not True or metadata.get('rectTwips') != [0, 0, 0, 0]):
        raise ValueError('Rendered empty timeline metadata does not match source')
    expected = {f'{i:04d}.png' for i in range(frames)}
    if {p.name for p in folder.glob('*.png')} != expected:
        raise ValueError('Rendered frame set is incomplete or has extra frames')
    proof = []
    for name in sorted(expected):
        path = folder / name
        with Image.open(path) as original:
            image = original.convert('RGBA')
            if image.size != (1, 1) or image.getchannel('A').getbbox() is not None:
                raise ValueError('Empty source produced visible or oversized pixels')
            proof.append({'file': name, 'pngSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                          'rgbaSha256': hashlib.sha256(image.tobytes()).hexdigest()})
    points = folder / 'named-instances.json'
    if json.loads(points.read_bytes()) != [] or archive.record(logical) != before:
        raise ValueError('Named instances or source changed during review')
    return {'key': key, 'source': before, 'action': action, 'symbolId': symbol,
            'state': 'source-empty-display-timeline-reviewed-not-an-animation',
            'sourceTagCounts': dict(counts), 'sourceSpriteSha256': hashlib.sha256(sprite).hexdigest(),
            'frames': frames, 'allFramesTransparent': True, 'renderMetadata': metadata,
            'renderMetadataSha256': hashlib.sha256(metadata_path.read_bytes()).hexdigest(),
            'namedInstancesSha256': hashlib.sha256(points.read_bytes()).hexdigest(), 'frameProofs': proof,
            'scope': 'Source sprite contains only End/ShowFrame/FrameLabel tags. No art installed, '
                     'no scripts executed, no gameplay identity or external runtime behavior inferred.'}
