"""Read-only access to versioned original assets; runtime output lives elsewhere."""
from pathlib import Path, PurePosixPath
import hashlib, json, zlib

class OriginalArchive:
    def __init__(self, source):
        self.root = Path(source).resolve()
        self.cdn = self.root / 'recovered-web/cdn'
        self.manifest = json.loads((self.root / 'recovery/resource-manifest.json').read_text(encoding='utf-8'))
        self.rows = {r['path']: r for r in self.manifest['assets']}

    def path(self, name):
        row = self.rows[name]
        rel = PurePosixPath(name)
        if rel.is_absolute() or '..' in rel.parts:
            raise ValueError('Invalid source path')
        path = (self.cdn / row['tag'] / str(rel)).resolve()
        if not path.is_relative_to(self.cdn.resolve()):
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
                'sha256': hashlib.sha256(raw).hexdigest()}
