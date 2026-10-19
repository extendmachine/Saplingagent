import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMediaFixture } from './media-fixture.mjs';

test('legacy version route stays compatible and follows installed kernel, without Git/login', async t => {
  const parent = fileURLToPath(new URL('../../../.cache/release-http/', import.meta.url));
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'app-'));
  const fixture = await createMediaFixture(root);
  t.after(async () => { await fixture.close(); await fs.rm(root, { recursive: true, force: true }); });
  const read = () => fetch(fixture.base + '/api/release');
  let response = await read();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'RELEASE_UNAVAILABLE');
  const metadata = path.join(root, 'config/release.json');
  await fs.writeFile(metadata, JSON.stringify({ schemaVersion: 1, version: '0.9.1', privateValue: 'DO_NOT_EXPOSE' }));
  response = await read();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { release: { schemaVersion: 1, version: '0.9.1' } });
  for (const value of [{ schemaVersion: 1, version: '0.90' }, { schemaVersion: 2, version: '0.9.1' }, '{broken', 'x'.repeat(5000)]) {
    await fs.writeFile(metadata, typeof value === 'string' ? value : JSON.stringify(value));
    response = await read();
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /DO_NOT_EXPOSE|0\.90|release-http|SyntaxError/);
  }
  await fs.mkdir(path.join(root,'kernel'),{recursive:true});
  await fs.copyFile(new URL('../../../kernel/manifest.json',import.meta.url),path.join(root,'kernel/manifest.json'));
  await fs.writeFile(metadata,JSON.stringify({schemaVersion:1,version:'0.9.1'}));
  assert.deepEqual(await (await read()).json(),{release:{schemaVersion:1,version:'0.9.4'}});
  assert.equal(fixture.calls.filter(call => call.method === 'turn/start').length, 0);
  await assert.rejects(fs.access(path.join(root, '.git')));
});
