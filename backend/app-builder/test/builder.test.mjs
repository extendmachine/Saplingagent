import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createBuilder } from '../builder.mjs';
import { createBuilderServer } from '../server.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const nodeCommand = (source) => `${quote(process.execPath)} -e ${quote(source)}`;
const token = 'fixture-only-service-authentication-token';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function fixture(t) {
  const directory = await fs.mkdtemp(fileURLToPath(new URL('../.test-', import.meta.url)));
  const root = path.join(directory, 'app'); const peer = path.join(directory, 'peer');
  await fs.mkdir(root); await fs.mkdir(peer);
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, root, peer };
}
async function put(target, content) { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, content); }
async function listen(t, root) {
  const server = await createBuilderServer({ root, token });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (pathname, input, options = {}) => {
    const response = await fetch(base + pathname, { method: input === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(input === undefined ? {} : { body: JSON.stringify(input) }), ...options });
    return { status: response.status, body: await response.json() };
  };
  return { server, base, request };
}
async function waitFor(target) {
  for (let count = 0; count < 150; count++) {
    try { await fs.stat(target); return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await pause(20);
  }
  assert.fail('Command fixture did not start');
}

test('all project areas, arbitrary content and outside paths are ready without compilation or hash gates', async (t) => {
  const { root, peer } = await fixture(t); let builds = 0;
  const builder = await createBuilder(root, { build: async () => { builds++; throw new Error('Compilation must never run'); } });
  const paths = ['backend/agent-runtime/server.mjs', 'front/chat/ChatPanel.tsx', 'front/main.tsx', 'front/package.json', 'rules/README.md', '.agents/skills/example/SKILL.md', 'local-secrets/synthetic.txt', '.env', 'node_modules/synthetic.txt', 'dist/synthetic.txt', '../peer/relative.bin', path.join(peer, 'absolute.bin')];
  const content = 'FIXTURE_ONLY_SECRET sk-proj-synthetic-not-a-key\ninvalid TS { and YAML [';
  await put(path.join(root, paths[0]), 'original backend');
  const change = await builder.propose({ reason: 'Isolated Full Access check', files: paths.map((file) => ({ path: file, content, expectedHash: 'intentionally-stale' })) });
  assert.equal(change.status, 'ready'); assert.deepEqual(change.checks, []); assert.equal(builds, 0);
  assert.equal(await fs.readFile(path.join(root, paths[0]), 'utf8'), 'original backend');
  const candidateFiles = await fs.readdir(path.join(root, 'snapshots/app-builder/changes', change.changeId, 'candidate'));
  assert.deepEqual(candidateFiles.sort((a, b) => Number(a) - Number(b)), paths.map((_, index) => String(index)));
  await put(path.join(root, paths[0]), 'later edit before apply');
  assert.equal((await builder.apply(change.changeId)).status, 'applied');
  for (const file of paths) assert.equal(await fs.readFile(path.resolve(root, file), 'utf8'), content);
  await put(path.join(root, paths[0]), 'later edit before rollback');
  assert.equal((await builder.rollback(change.changeId)).status, 'rolledBack');
  assert.equal(await fs.readFile(path.join(root, paths[0]), 'utf8'), 'original backend');
  for (const file of paths.slice(1)) await assert.rejects(fs.stat(path.resolve(root, file)), { code: 'ENOENT' });
});

test('file listing and binary reads include dot directories, symlinks and absolute or parent paths', async (t) => {
  const { root, peer } = await fixture(t); const builder = await createBuilder(root);
  await put(path.join(peer, '.hidden/value'), 'dot directory');
  const bytes = Buffer.from([0, 255, 128, 65, 66, 67]); await put(path.join(peer, 'binary.bin'), bytes);
  await fs.symlink(path.join(peer, 'binary.bin'), path.join(peer, 'link'));
  const page = await builder.listFiles('../peer', { limit: 1 });
  assert.equal(page.total, 3); assert.equal(page.truncated, true); assert.equal(page.nextCursor, '1');
  assert.equal(page.files[0].type, 'directory');
  const rest = await builder.listFiles(peer, { limit: 2, cursor: page.nextCursor });
  assert.deepEqual(rest.files.map((file) => file.type), ['file', 'symlink']); assert.equal(rest.truncated, false);
  const slice = await builder.readFile(path.join(peer, 'binary.bin'), { encoding: 'base64', offset: 1, maxBytes: 2 });
  assert.equal(slice.content, bytes.subarray(1, 3).toString('base64')); assert.equal(slice.hashScope, 'returnedBytes'); assert.equal(slice.nextOffset, 3);
  const full = await builder.readFile('../peer/link', { encoding: 'base64' });
  assert.equal(full.content, bytes.toString('base64')); assert.equal(full.hash, hash(bytes)); assert.equal(full.hashScope, 'file');
  await assert.rejects(builder.readFile('../peer/missing'), { code: 'ENOENT' });
});

test('ordinary writes follow file and directory symlinks; manual rollback restores recorded link and bytes', async (t) => {
  const { root, peer } = await fixture(t); const builder = await createBuilder(root);
  const referent = path.join(peer, 'original.txt'); await put(referent, 'original bytes');
  await fs.symlink(referent, path.join(root, 'file-link')); await fs.symlink(peer, path.join(root, 'directory-link'));
  const write = await builder.writeFile({ path: 'file-link', content: 'new bytes' });
  assert.equal(await fs.readFile(referent, 'utf8'), 'new bytes'); assert.equal((await fs.lstat(path.join(root, 'file-link'))).isSymbolicLink(), true);
  await put(referent, 'later unrelated edit'); await builder.rollback(write.changeId);
  assert.equal(await fs.readFile(referent, 'utf8'), 'original bytes');
  const nested = await builder.writeFile({ path: 'directory-link/new.txt', content: 'outside app root' });
  assert.equal(await fs.readFile(path.join(peer, 'new.txt'), 'utf8'), 'outside app root'); await builder.rollback(nested.changeId);
  const deletion = await builder.deleteFile({ path: 'file-link' });
  await assert.rejects(fs.lstat(path.join(root, 'file-link')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(referent, 'utf8'), 'original bytes');
  await put(referent, 'kept by link deletion rollback'); await builder.rollback(deletion.changeId);
  assert.equal(await fs.readlink(path.join(root, 'file-link')), referent); assert.equal(await fs.readFile(referent, 'utf8'), 'kept by link deletion rollback');
});

test('HTTP file operations expose true filesystem errors and retain service authentication without content logs', async (t) => {
  const { root, peer } = await fixture(t); const { base, request } = await listen(t, root);
  assert.equal((await fetch(base + '/health')).status, 200); assert.equal((await fetch(base + '/files')).status, 401);
  const destination = path.join(peer, 'binary.txt'); const value = Buffer.from('FIXTURE_ONLY_SYNTHETIC_SECRET\0body');
  const write = await request('/files/write', { path: destination, content: value.toString('base64'), encoding: 'base64' });
  assert.equal(write.status, 200); assert.equal(write.body.status, 'applied'); assert.ok(write.body.changeId);
  const read = await request('/file?' + new URLSearchParams({ path: destination, encoding: 'base64' }));
  assert.equal(read.body.content, value.toString('base64'));
  const deletion = await request('/files/delete', { path: destination }); assert.equal(deletion.body.status, 'applied');
  await request(`/changes/${deletion.body.changeId}/rollback`, {}); assert.deepEqual(await fs.readFile(destination), value);
  const missing = await request('/files/delete', { path: path.join(peer, 'missing') }); assert.equal(missing.status, 404); assert.equal(missing.body.error.code, 'ENOENT');
  const directory = await request('/files/write', { path: peer, content: 'OS determines this error' }); assert.equal(directory.status, 400); assert.equal(directory.body.error.code, 'EISDIR');
  const malformed = await fetch(base + '/changes', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{' }); assert.equal(malformed.status, 400);
  const logFiles = await fs.readdir(path.join(root, 'logs/app-builder'));
  const logs = (await Promise.all(logFiles.map((file) => fs.readFile(path.join(root, 'logs/app-builder', file), 'utf8')))).join('');
  assert.equal(logs.includes(token), false); assert.equal(logs.includes('FIXTURE_ONLY_SYNTHETIC_SECRET'), false); assert.equal(logs.includes('OS determines this error'), false);
});

test('unavailable snapshots never prevent direct writes or deletes and never invent a rollback identifier', async (t) => {
  const { root, peer } = await fixture(t); await put(path.join(root, 'snapshots'), 'Fixture blocks this directory');
  const { request } = await listen(t, root); const destination = path.join(peer, 'still-writable.txt');
  const write = await request('/files/write', { path: destination, content: 'written despite snapshot error' });
  assert.equal(write.status, 200); assert.equal(write.body.status, 'applied'); assert.equal(write.body.changeId, undefined); assert.equal(write.body.warnings[0].code, 'SNAPSHOT_UNAVAILABLE');
  assert.equal(await fs.readFile(destination, 'utf8'), 'written despite snapshot error');
  const deletion = await request('/files/delete', { path: destination });
  assert.equal(deletion.status, 200); assert.equal(deletion.body.changeId, undefined); assert.equal(deletion.body.warnings[0].code, 'SNAPSHOT_UNAVAILABLE');
  await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
  const proposal = await request('/changes', { reason: 'Optional record may fail', files: [{ path: destination, content: 'not applied by proposal' }] });
  assert.equal(proposal.status, 404); assert.equal(proposal.body.error.code, 'ENOTDIR'); await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
});

test('unavailable metadata logs do not change successful file, candidate, rollback or command outcomes', async (t) => {
  const { root, peer } = await fixture(t); await put(path.join(root, 'logs'), 'Fixture blocks logging directory');
  const { request } = await listen(t, root); const destination = path.join(peer, 'logged.txt');
  await put(destination, 'original');
  const proposal = await request('/changes', { reason: 'Logging failure fixture', files: [{ path: destination, content: 'candidate' }] });
  assert.equal(proposal.status, 201); assert.equal(proposal.body.status, 'ready'); assert.equal(proposal.body.warnings[0].code, 'LOG_UNAVAILABLE');
  const applied = await request(`/changes/${proposal.body.changeId}/apply`, {});
  assert.equal(applied.status, 200); assert.equal(applied.body.status, 'applied'); assert.equal(applied.body.warnings[0].code, 'LOG_UNAVAILABLE');
  assert.equal(await fs.readFile(destination, 'utf8'), 'candidate');
  const restored = await request(`/changes/${proposal.body.changeId}/rollback`, {});
  assert.equal(restored.body.status, 'rolledBack'); assert.equal(restored.body.warnings[0].code, 'LOG_UNAVAILABLE'); assert.equal(await fs.readFile(destination, 'utf8'), 'original');
  const written = await request('/files/write', { path: destination, content: 'direct' }); assert.equal(written.body.status, 'applied'); assert.equal(written.body.warnings[0].code, 'LOG_UNAVAILABLE');
  const deleted = await request('/files/delete', { path: destination }); assert.equal(deleted.body.status, 'applied'); assert.equal(deleted.body.warnings[0].code, 'LOG_UNAVAILABLE');
  const command = await request('/commands', { command: nodeCommand("process.stdout.write('completed')"), timeoutMs: 5000 });
  assert.equal(command.status, 200); assert.equal(command.body.exitCode, 0); assert.equal(command.body.stdout, 'completed'); assert.equal(command.body.warnings[0].code, 'LOG_UNAVAILABLE');
  const actualError = await request('/files/delete', { path: destination }); assert.equal(actualError.status, 404); assert.equal(actualError.body.error.code, 'ENOENT');
});

test('older validated and failed snapshots remain usable and restart never restores applying files', async (t) => {
  const { root } = await fixture(t); const builder = await createBuilder(root);
  for (const status of ['validated', 'failed', 'applying']) {
    const id = randomUUID(); const folder = path.join(root, 'snapshots/app-builder/changes', id);
    await put(path.join(root, 'front/App.tsx'), `live user ${status}`);
    await put(path.join(folder, 'originals/front/App.tsx'), `original ${status}`);
    await put(path.join(folder, 'candidate/front/App.tsx'), `candidate ${status}`);
    await put(path.join(folder, 'meta.json'), JSON.stringify({ changeId: id, status, reason: 'Old format fixture', createdAt: '2026-10-09T00:00:00Z', files: [{ path: 'front/App.tsx', originalHash: 'historical hash', appliedHash: 'old applied hash' }] }));
    const restarted = await createBuilder(root);
    assert.equal(await fs.readFile(path.join(root, 'front/App.tsx'), 'utf8'), `live user ${status}`);
    assert.equal((await restarted.listChanges()).find((change) => change.changeId === id).status, status);
    await restarted.apply(id); assert.equal(await fs.readFile(path.join(root, 'front/App.tsx'), 'utf8'), `candidate ${status}`);
    await put(path.join(root, 'front/App.tsx'), 'user later edit'); await restarted.rollback(id);
    assert.equal(await fs.readFile(path.join(root, 'front/App.tsx'), 'utf8'), `original ${status}`);
  }
  assert.ok((await builder.listChanges()).length === 3);
});

test('a partial apply remains in place after error and restart until explicit rollback', async (t) => {
  const { root } = await fixture(t); const builder = await createBuilder(root);
  await put(path.join(root, 'first.txt'), 'first original'); await put(path.join(root, 'second.txt'), 'second original');
  const change = await builder.propose({ reason: 'Partial failure fixture', files: [{ path: 'first.txt', content: 'first new' }, { path: 'second.txt', content: 'second new' }] });
  await fs.unlink(path.join(root, 'snapshots/app-builder/changes', change.changeId, 'candidate/1'));
  await assert.rejects(builder.apply(change.changeId), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(root, 'first.txt'), 'utf8'), 'first new');
  const restarted = await createBuilder(root); assert.equal(await fs.readFile(path.join(root, 'first.txt'), 'utf8'), 'first new');
  assert.equal((await restarted.listChanges())[0].status, 'failed');
  await restarted.rollback(change.changeId);
  assert.equal(await fs.readFile(path.join(root, 'first.txt'), 'utf8'), 'first original'); assert.equal(await fs.readFile(path.join(root, 'second.txt'), 'utf8'), 'second original');
});

test('concurrent candidates overwrite in call order and explicit rollback ignores later changes', async (t) => {
  const { root } = await fixture(t); const builder = await createBuilder(root); await put(path.join(root, 'data.txt'), 'original');
  const a = await builder.propose({ reason: 'A', files: [{ path: 'data.txt', content: 'A', expectedHash: 'wrong' }] });
  const b = await builder.propose({ reason: 'B', files: [{ path: 'data.txt', content: 'B' }] });
  const results = await Promise.all([builder.apply(a.changeId), builder.apply(b.changeId)]); assert.equal(results.every((result) => result.status === 'applied'), true);
  assert.equal(await fs.readFile(path.join(root, 'data.txt'), 'utf8'), 'B'); await builder.rollback(a.changeId); assert.equal(await fs.readFile(path.join(root, 'data.txt'), 'utf8'), 'original');
});

test('HTTP shell commands execute as the current user with arbitrary cwd, errors and bounded output', async (t) => {
  const { root, peer } = await fixture(t); const { request } = await listen(t, root);
  const source = `require('node:fs').writeFileSync('command-effect.txt','shell effect'); process.stdout.write(JSON.stringify({cwd:process.cwd(),uid:process.getuid?.()})); process.stderr.write('fixture stderr'); process.exit(7)`;
  const result = await request('/commands', { command: nodeCommand(source), cwd: peer, timeoutMs: 5000 });
  assert.equal(result.status, 200); assert.equal(result.body.exitCode, 7); assert.equal(result.body.timedOut, false); assert.equal(result.body.cancelled, false);
  const details = JSON.parse(result.body.stdout); assert.equal(details.cwd, peer); assert.equal(details.uid, process.getuid?.()); assert.equal(result.body.stderr, 'fixture stderr');
  assert.equal(await fs.readFile(path.join(peer, 'command-effect.txt'), 'utf8'), 'shell effect');
  const large = await request('/commands', { command: nodeCommand(`process.stdout.write('a'.repeat(1048590))`), timeoutMs: 5000 });
  assert.equal(large.body.stdout.length, 1048576); assert.equal(large.body.stdoutTruncated, true); assert.equal(large.body.stderrTruncated, false);
  const missing = await request('/commands', { command: 'echo fixture', cwd: path.join(peer, 'absent') }); assert.equal(missing.status, 404); assert.equal(missing.body.error.code, 'ENOENT');
});

test('command timeout reports timedOut separately from cancellation and terminates the created group', async (t) => {
  const { root, peer } = await fixture(t); const builder = await createBuilder(root); const later = path.join(peer, 'timeout-later');
  const result = await builder.runCommand({ command: nodeCommand(`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(later)},'must not execute'),1000)`), timeoutMs: 80 });
  assert.equal(result.exitCode, null); assert.equal(result.timedOut, true); assert.equal(result.cancelled, false);
  await pause(1100); await assert.rejects(fs.stat(later), { code: 'ENOENT' });
});

test('HTTP cancellation terminates its shell group and leaves another command untouched', async (t) => {
  const { root, peer } = await fixture(t); const { request } = await listen(t, root);
  const started = path.join(peer, 'cancel-started'); const later = path.join(peer, 'cancel-later');
  const controller = new AbortController();
  const running = request('/commands', { command: nodeCommand(`require('node:fs').writeFileSync(${JSON.stringify(started)},'started');setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(later)},'must not execute'),1000)`), timeoutMs: 5000 }, { signal: controller.signal });
  const expectedAbort = assert.rejects(running, { name: 'AbortError' });
  const other = request('/commands', { command: nodeCommand(`setTimeout(()=>process.stdout.write('other command survives'),500)`), timeoutMs: 5000 });
  await waitFor(started); controller.abort(); await expectedAbort;
  assert.equal((await other).body.stdout, 'other command survives'); await pause(650); await assert.rejects(fs.stat(later), { code: 'ENOENT' });
});

test('closing the service cancels active command groups without automatic file recovery', async (t) => {
  const { root, peer } = await fixture(t); const { server, request } = await listen(t, root);
  const started = path.join(peer, 'shutdown-started'); const later = path.join(peer, 'shutdown-later');
  const running = request('/commands', { command: nodeCommand(`require('node:fs').writeFileSync(${JSON.stringify(started)},'started');setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(later)},'must not execute'),1000)`), timeoutMs: 5000 });
  await waitFor(started); const closed = new Promise((resolve) => server.close(resolve));
  const result = await running; assert.equal(result.body.cancelled, true); assert.equal(result.body.timedOut, false); assert.equal(result.body.exitCode, null);
  await closed; await pause(1100); await assert.rejects(fs.stat(later), { code: 'ENOENT' });
});

test('restart preparation refuses a live command, then gates and releases writes', async t => {
  const {root} = await fixture(t); const {request} = await listen(t, root);
  const marker = path.join(root, 'command-started');
  const command = request('/commands', {command: nodeCommand(`require('node:fs').writeFileSync(${JSON.stringify(marker)},'started');setTimeout(()=>{},400)`), timeoutMs: 5000});
  await waitFor(marker);
  assert.equal((await request('/internal/runtime/prepare', {})).status, 409);
  assert.equal((await command).status, 200);
  assert.equal((await request('/internal/runtime/prepare', {})).status, 200);
  assert.equal((await request('/files/write', {path:'kept.txt',content:'blocked'})).status, 503);
  await assert.rejects(fs.stat(path.join(root,'kept.txt')), {code:'ENOENT'});
  assert.equal((await request('/internal/runtime/release', {})).status, 200);
  assert.equal((await request('/files/write', {path:'kept.txt',content:'saved'})).status, 200);
});
