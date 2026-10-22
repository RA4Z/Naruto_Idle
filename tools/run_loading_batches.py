"""Recover at most six sequential three-artwork batches, validating full JPEGs."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import subprocess
import sys
import xml.etree.ElementTree as ET
from PIL import Image
from original_archive import OriginalArchive

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--max-batches', type=int, default=1)
    args = parser.parse_args()
    if not 1 <= args.max_batches <= 6:
        raise SystemExit('One cycle contains at most six sequential batches')
    archive = OriginalArchive(args.source)
    available = {PurePosixPath(p).stem: p for p in archive.rows
                 if p.startswith('assets/loading/') and p.endswith('.jpg')}
    if any(not ident.isdigit() for ident in available):
        raise ValueError('Unexpected artwork ID')
    index_path = ROOT / 'public/assets/loading/index.json'
    known = {r['id'] for r in json.loads(index_path.read_text(encoding='utf-8'))['images']}
    if not known.issubset(available):
        raise ValueError('Catalog contains artwork absent from source')
    pending = sorted(available.keys() - known, key=int)
    report_path = ROOT / 'reports/loading-art-validation.json'
    report = json.loads(report_path.read_text(encoding='utf-8')) if report_path.exists() else {'images': {}}
    for start in range(0, min(len(pending), args.max_batches * 3), 3):
        ids = pending[start:start + 3]
        subprocess.run([sys.executable, 'tools/recover_loading_art.py', '--source', args.source,
                        '--ids', ','.join(ids)], cwd=ROOT, check=True)
        print(json.dumps({'batchRecovered': ids}), flush=True)
    # Every resumed cycle verifies the entire current catalog, including the three
    # pre-existing artworks. No decoder output replaces original JPEG bytes.
    images = json.loads(index_path.read_text(encoding='utf-8'))['images']
    for row in images:
        ident = row['id']
        before = archive.record(available[ident])
        raw = (ROOT / 'public' / row['url'].lstrip('/')).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest != before['sha256'] or digest != row['source']['sha256']:
            raise ValueError(f'Artwork bytes differ: {ident}')
        with Image.open(ROOT / 'public' / row['url'].lstrip('/')) as image:
            if image.format not in ('JPEG', 'PNG') or image.size != (row['width'], row['height']):
                raise ValueError(f'Artwork dimensions or format differ: {ident}')
            expected_extension = '.jpg' if image.format == 'JPEG' else '.png'
            if not row['url'].endswith(expected_extension):
                raise ValueError(f'Artwork URL format differs: {ident}')
            image.load()
        if archive.record(available[ident]) != before:
            raise ValueError(f'Source changed: {ident}')
        report['images'][ident] = {'sha256': digest, 'bytes': len(raw),
                                  'width': row['width'], 'height': row['height'],
                                  'fullDecode': True, 'sourceUnchanged': True}
    report.update(available=len(available), validated=len(images), remaining=len(available)-len(images),
                  state='complete' if len(images) == len(available) else 'partial',
                  policy='Original JPEG/PNG bytes; full decode and source SHA256 for every catalog entry; serial batches; cfg.xml is configuration, not artwork')
    config = 'assets/loading/cfg.xml'
    config_before = archive.record(config)
    config_review = {'source': config_before,
                     'entries': [dict(item.attrib) for item in ET.fromstring(archive.data(config))],
                     'policy': 'Original selection weights archived for review. Idle uses a separate curated selection.json, on demand, with a random initial offset and cyclic rotation.'}
    if archive.record(config) != config_before:
        raise ValueError('Original loading configuration changed')
    (ROOT / 'public/assets/loading/source-config-review.json').write_text(
        json.dumps(config_review, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: report[k] for k in ('available', 'validated', 'remaining', 'state')}), flush=True)


if __name__ == '__main__':
    main()
