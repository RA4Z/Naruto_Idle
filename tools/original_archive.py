"""Read-only access to versioned original assets; runtime output lives elsewhere."""
from pathlib import Path, PurePosixPath
import hashlib, json, zlib

class OriginalArchive:
    def __init__(self, source):
        self.root = Path(source).resolve()
        self.cdn = self.root / 'recovered-web/cdn'
        native_manifest = self.root / 'recovery/resource-manifest.json'
        self.delivery = not native_manifest.is_file()
        if self.delivery:
            # Export inventory pins ONE original version per logical path. Do not
            # guess a newer version from directory names or read historical D: paths.
            records = json.loads((self.root / 'manifestos/inventory.json').read_text(encoding='utf-8-sig'))
            if len({r['original_path'] for r in records}) != len(records):
                raise ValueError('Ambiguous exported inventory: duplicate logical paths')
            self.manifest = {'assets': [{'path': r['original_path'], 'tag': r['version'], 'category': r['category']} for r in records]}
        else:
            self.manifest = json.loads(native_manifest.read_text(encoding='utf-8-sig'))
        self.rows = {r['path']: r for r in self.manifest['assets']}

    def path(self, name):
        row = self.rows[name]
        rel = PurePosixPath(name)
        if rel.is_absolute() or '..' in rel.parts:
            raise ValueError('Invalid source path')
        base = self.root / row['category'] if self.delivery else self.cdn
        if not base.resolve().is_relative_to(self.root):
            raise ValueError('Source category escapes archive')
        if '/' in row['tag'] or '\\' in row['tag'] or row['tag'] in ('.', '..'):
            raise ValueError('Invalid source version')
        path = (base / row['tag'] / str(rel)).resolve()
        if not path.is_relative_to(base.resolve()):
            raise ValueError('Source escapes archive')
        return path

    def raw(self, name):
        return self.path(name).read_bytes()

    def data(self, name):
        raw = self.raw(name)
        try:
            return zlib.decompress(raw)
        except zlib.error:
            return raw

    def record(self, name):
        raw = self.raw(name)
        return {'path': name, 'tag': self.rows[name]['tag'], 'bytes': len(raw),
                'sha256': hashlib.sha256(raw).hexdigest(),
                'sourceKind': 'exported-inventory' if self.delivery else 'original-cdn'}
