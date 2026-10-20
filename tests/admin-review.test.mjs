import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createGameApi } from '../server/game-api.mjs';
test('character review requires authorization, validates actions and persists without modifying the catalog', async () => {
  const root = await mkdtemp(join(tmpdir(), 'idle-review-'));
  const catalogDir = join(root, 'public/assets/catalog'), actorDir = join(root, 'public/assets/characters/example');
  await mkdir(catalogDir, { recursive: true }); await mkdir(actorDir, { recursive: true });
  const catalog = JSON.stringify({ entities: [{ id: '11000101', manifestUrl: '/assets/characters/example/manifest.json' }] });
  await writeFile(join(catalogDir, 'entities.json'), catalog); await writeFile(join(catalogDir, 'reviews.json'), '{}');
  await writeFile(join(actorDir, 'manifest.json'), JSON.stringify({ id: '11000101', modes: { world: { animations: { idle_0: {}, run_0: {} } } } }));
  await writeFile(join(actorDir, 'preview.png'), 'asset');
  const api = createGameApi(root), server = createServer((req, res) => void api(req, res, () => res.end()));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/admin/`;
  const body = { decision: 'approved', notes: 'Revisado', capabilities: { npc: true, companion: true, enemy: false } };
  const post = (path, data, cookie = '') => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(data) });
  try {
    assert.equal((await post('characters/11000101/review', body)).status, 401);
    const login = await post('login', { password: 'admin' }); const cookie = login.headers.get('set-cookie').split(';')[0];
    const detail = await (await fetch(base + 'characters/11000101', { headers: { Cookie: cookie } })).json();
    assert.ok(detail.assets.some(file => file.url.endsWith('/preview.png')));
    assert.equal((await post('characters/11000101/review', { ...body, capabilities: { ...body.capabilities, enemy: true } }, cookie)).status, 400);
    assert.equal((await post('characters/11000101/review', body, cookie)).status, 200);
    const saved = JSON.parse(await readFile(join(catalogDir, 'reviews.json'), 'utf8'));
    assert.equal(saved['11000101'].notes, 'Revisado'); assert.equal(saved['11000101'].capabilities.companion, true);
    assert.equal(await readFile(join(catalogDir, 'entities.json'), 'utf8'), catalog);
  } finally { api.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); }
});
