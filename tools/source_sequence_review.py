"""Loopback-only, read-only review of installed full-frame source sequences.

Serves only artifacts pinned by the installed catalog. Never exposes directories,
original archives, account endpoints, save endpoints or arbitrary file paths.
This local tool is not a production runtime adapter.
"""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
from pathlib import Path, PurePosixPath
import re
from urllib.parse import parse_qs, urlsplit


class SequenceCatalog:
    def __init__(self, project):
        self.project = Path(project).resolve()
        self.root = (self.project/'asset-source/native-effects').resolve()
        if not self.root.is_relative_to(self.project):
            raise ValueError('Source review root escapes project')
        self.items = {}
        index = json.loads((self.project/'public/assets/effects/native/index.json').read_bytes())
        for table in ('effects', 'sourceBundles', 'sourceExports'):
            for ident, entry in index.get(table, {}).items():
                for layer in entry.get('layers', []):
                    if not layer.get('sourceSequence'):
                        continue
                    key = hashlib.sha256((table+'/'+ident+'/'+layer['plane']+'/'+layer['action']).encode()).hexdigest()[:24]
                    if key in self.items:
                        raise ValueError('Ambiguous sequence review key')
                    self.items[key] = (ident, entry, layer)

    def catalog(self):
        # Refresh only the list, not on every playback frame. Existing artifacts
        # are immutable; active requests remain pinned by their file hashes.
        self.items = SequenceCatalog(self.project).items
        return [{'key': key, 'id': ident, 'source': entry['source']['path'], 'action': layer['action'],
            'frames': layer['validation']['nativeFrames'],
            'sourceKind': entry.get('sourceKind', 'battle-effect-exported-sprite' if entry.get('sourceOnly') else 'bound-source-sequence')}
            for key, (ident, entry, layer) in self.items.items()]

    def manifest(self, key):
        if not re.fullmatch(r'[a-f0-9]{24}', key) or key not in self.items:
            raise ValueError('Unknown reviewed source')
        _, _, layer = self.items[key]
        relative = PurePosixPath(layer['sourceSequence']['manifestPath'])
        if (relative.is_absolute() or '..' in relative.parts or relative.name != 'manifest.json'
                or any(c in str(relative) for c in ('\\', ':', '?', '#'))):
            raise ValueError('Sequence manifest escapes source root')
        path = (self.root/str(relative)).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError('Sequence manifest follows an external link')
        payload = path.read_bytes()
        if hashlib.sha256(payload).hexdigest() != layer['artifactsSha256']['manifest.json']:
            raise ValueError('Installed sequence manifest changed')
        data = json.loads(payload)
        files, timeline = data['frameFiles'], data['timeline']
        width, height = data['frameSize']
        if (data['state'] != 'source-frames-complete-runtime-adapter-pending' or data['sourcePixelScale'] != 1
                or data['validation'] != layer['validation'] or not layer['validation']['allFramesPixelExact']
                or not math.isfinite(data['fps']) or data['fps'] <= 0
                or not 1 <= len(timeline) <= 480 or len(timeline) != layer['validation']['nativeFrames']
                or not 1 <= width <= 8192 or not 1 <= height <= 8192 or width * height > 16_000_000
                or not files or len(set(files)) != len(files)
                or any(not re.fullmatch(r'frame-[a-f0-9]{24}\.webp', name) for name in files)
                or any(type(i) is not int or not 0 <= i < len(files) for i in timeline)
                or set(layer['artifactsSha256']) != set(files) | {'manifest.json'}):
            raise ValueError('Sequence is incomplete, unverified or outside review budgets')
        return data, path.parent, layer['artifactsSha256']

    def describe(self, key):
        data, _, hashes = self.manifest(key)
        return {'fps': data['fps'], 'timeline': data['timeline'], 'frameSize': data['frameSize'],
            'sourceBounds': data['sourceBounds'], 'sourcePixelScale': 1,
            'frameHashes': [hashes[name] for name in data['frameFiles']],
            'sourceExecution': False, 'accountOrSaveAccess': False,
            'scope': 'Local source review only; no gameplay attachment or hitbox.'}

    def frame(self, key, index):
        data, folder, hashes = self.manifest(key)
        if type(index) is not int or not 0 <= index < len(data['frameFiles']):
            raise ValueError('Unknown sequence frame')
        name = data['frameFiles'][index]
        path = (folder/name).resolve()
        if not path.is_relative_to(folder) or path.stat().st_size > 64_000_000:
            raise ValueError('Sequence frame exceeds review boundary')
        payload = path.read_bytes()
        if hashlib.sha256(payload).hexdigest() != hashes[name]:
            raise ValueError('Installed source frame changed')
        return payload


def handler_for(catalog, html):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            try:
                target = urlsplit(self.path)
                query = parse_qs(target.query, strict_parsing=True)
                mime = 'application/json; charset=utf-8'
                if target.path == '/' and not query:
                    payload, mime = html, 'text/html; charset=utf-8'
                elif target.path == '/api/sources' and not query:
                    payload = json.dumps(catalog.catalog(), ensure_ascii=False).encode()
                elif target.path == '/api/manifest' and set(query) == {'id'} and len(query['id']) == 1:
                    payload = json.dumps(catalog.describe(query['id'][0]), ensure_ascii=False).encode()
                elif target.path == '/api/frame' and set(query) == {'id', 'index', 'sha'} and all(len(v) == 1 for v in query.values()):
                    if not re.fullmatch(r'[a-f0-9]{64}', query['sha'][0]):
                        raise ValueError('Invalid pinned frame hash')
                    payload, mime = catalog.frame(query['id'][0], int(query['index'][0])), 'image/webp'
                    if hashlib.sha256(payload).hexdigest() != query['sha'][0]:
                        raise ValueError('Pinned frame hash differs')
                else:
                    self.send_error(404); return
                self.send_response(200)
                self.send_header('Content-Type', mime)
                self.send_header('Content-Length', str(len(payload)))
                self.send_header('Cache-Control', 'private, max-age=3600, immutable' if mime == 'image/webp' else 'no-store')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.end_headers(); self.wfile.write(payload)
            except (ValueError, KeyError, OSError, IndexError):
                self.send_error(404, 'Source unavailable or changed; review required')
        def log_message(self, *_):
            pass
    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', type=Path, required=True)
    parser.add_argument('--port', type=int, default=8255)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('Choose an unprivileged local port')
    catalog = SequenceCatalog(args.project)
    html = (Path(__file__).resolve().parent/'qa/source-sequences.html').read_bytes()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler_for(catalog, html))
    print(json.dumps({'localReview': f'http://127.0.0.1:{args.port}/', 'sequences': len(catalog.items), 'readOnly': True}), flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == '__main__': main()
