import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { configureGitStorage, validateRemote, AUTHOR_REMOTE } from '../launcher/git-storage.mjs';
import { readGitVersion } from '../../backend/agent-runtime/git-versions.mjs';
const exec = promisify(execFile);
const base = fileURLToPath(new URL('../../.cache/git-storage-tests/', import.meta.url));
const git = async (root, ...args) => (await exec('git', ['-C', root, ...args])).stdout.trim();
async function folder(t) {
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, "客户 app's "));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'App.tsx'), 'export default () => null;\n');
  return root;
}
async function repo(root, branch = 'main') {
  await git(root, 'init', '-b', branch);
  await git(root, 'config', 'user.name', 'Fixture'); await git(root, 'config', 'user.email', 'fixture@example.invalid');
  await git(root, 'add', 'App.tsx'); await git(root, 'commit', '-m', 'initial');
}
const configure = (root, options = {}) => configureGitStorage(root, { output: () => {}, ...options });
test('fresh local install creates real release history and excludes private/nested runtime files', async t => {
  const root = await folder(t);
  for (const name of ['local-secrets/key.txt', 'backend/a/.env', 'backend/a/node_modules/x.js', 'data/chat.json', 'backend/agent-runtime/ai-tasks/runtime/RUN.txt', '.runtime/node.exe']) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true }); await fs.writeFile(path.join(root, name), 'SYNTHETIC_PRIVATE');
  }
  await configure(root, { mode: 'local' });
  assert.equal(await git(root, 'branch', '--show-current'), 'release');
  assert.equal(await git(root, 'remote'), '');
  const files = await git(root, 'ls-files'); assert.equal(files, 'App.tsx');
  assert.equal((await readGitVersion(root)).branch, 'release');
  assert.equal(await git(root, 'status', '--porcelain'), '');
});
test('a source manifest/custom branch is respected, and subsequent install preserves selected historical version', async t => {
  const root = await folder(t); await fs.writeFile(path.join(root, 'delivery.json'), JSON.stringify({ git: { initialBranch: 'custom' } }));
  await configure(root, { mode: 'local' }); assert.equal(await git(root, 'branch', '--show-current'), 'custom');
  await git(root, 'switch', '--detach', 'HEAD');
  const result = await configure(root, { prompt: () => { throw new Error('Unexpected prompt'); } });
  assert.equal(result.preserved, true); assert.equal(await git(root, 'branch', '--show-current'), '');
});
test('first-install choice is required; EOF/cancel never silently enables upstream', async t => {
  const root = await folder(t); const prompts = [];
  await configure(root, { prompt: (label, fallback) => { prompts.push(label); return fallback; } });
  assert.equal(prompts.length, 1); assert.equal(await git(root, 'remote'), '');
  const other = await folder(t); await assert.rejects(configure(other, { prompt: () => '0' }), /cancelled|invalid/i);
  await assert.rejects(fs.access(path.join(other, '.git')));
});
test('own remote belongs to customer; no network/publication and author origin is not retained', async t => {
  const root = await folder(t); await configure(root, { mode: 'own', remoteUrl: 'https://example.invalid/customer/app.git' });
  assert.equal(await git(root, 'remote', 'get-url', 'origin'), 'https://example.invalid/customer/app.git');
  assert.equal(await git(root, 'branch', '--show-current'), 'release');
  assert.equal(await git(root, 'config', '--local', '--get', 'saplingagent.storageMode'), 'own');
});
test('changing a configured choice is explicit and keeps history', async t => {
  const root = await folder(t); await configure(root, { mode: 'local' }); const sha = await git(root, 'rev-parse', 'HEAD');
  await configure(root, { force: true, mode: 'own', remoteUrl: 'git@example.invalid:customer/app.git' });
  assert.equal(await git(root, 'rev-parse', 'HEAD'), sha); assert.equal(await git(root, 'remote'), 'origin');
});
test('existing custom repository/branch is retained on explicit keep-existing choice', async t => {
  const root = await folder(t); await repo(root, 'customer'); await git(root, 'remote', 'add', 'origin', 'https://example.invalid/own.git');
  await fs.writeFile(path.join(root, 'App.tsx'), 'user edit'); const before = await git(root, 'rev-parse', 'HEAD');
  await configure(root, { prompt: (_label, fallback) => fallback });
  assert.equal(await git(root, 'branch', '--show-current'), 'customer'); assert.equal(await git(root, 'rev-parse', 'HEAD'), before);
  assert.equal(await fs.readFile(path.join(root, 'App.tsx'), 'utf8'), 'user edit');
});
test('invalid branch and credential-bearing remote fail before creating repository', async t => {
  for (const options of [{ mode: 'local', branch: '--oops' }, { mode: 'own', remoteUrl: 'https://user:secret@example.invalid/a.git' }, { mode: 'own', remoteUrl: AUTHOR_REMOTE }]) {
    const root = await folder(t); await assert.rejects(configure(root, options)); await assert.rejects(fs.access(path.join(root, '.git')));
  }
  for (const value of ['ext::evil', 'file://host/x', 'https://example.invalid/r.git?token=bad', 'https://secret@example.invalid/r.git', '-x', 'a\nb']) assert.throws(() => validateRemote(value));
});
test('dirty customer source is not switched/reset to release', async t => {
  const root = await folder(t); await repo(root); await git(root, 'remote', 'add', 'origin', AUTHOR_REMOTE); await git(root, 'branch', 'release');
  await fs.writeFile(path.join(root, 'App.tsx'), 'pending user edit');
  await assert.rejects(configure(root, { mode: 'local' }), /pending changes/);
  assert.equal(await git(root, 'branch', '--show-current'), 'main'); assert.equal(await git(root, 'remote', 'get-url', 'origin'), AUTHOR_REMOTE);
});
test('cloned author repo chooses local release and removes only author remote, preserving main history', async t => {
  const root = await folder(t); await repo(root); await git(root, 'branch', 'release'); await git(root, 'remote', 'add', 'origin', AUTHOR_REMOTE);
  const sha = await git(root, 'rev-parse', 'main'); await configure(root, { mode: 'local' });
  assert.equal(await git(root, 'branch', '--show-current'), 'release'); assert.equal(await git(root, 'rev-parse', 'main'), sha); assert.equal(await git(root, 'remote'), '');
});
test('nested app never uses or stages its parent repository', async t => {
  const parent = await folder(t); await repo(parent); const root = path.join(parent, 'child'); await fs.mkdir(root); await fs.writeFile(path.join(root, 'app.txt'), 'child');
  const before = await git(parent, 'rev-parse', 'HEAD'); await assert.rejects(readGitVersion(root), { code: 'GIT_NOT_REPOSITORY' });
  await configure(root, { mode: 'local' }); assert.equal(await git(root, 'branch', '--show-current'), 'release'); assert.equal(await git(parent, 'rev-parse', 'HEAD'), before);
  assert.equal(await git(root, 'ls-files'), 'app.txt');
});
test('linked development worktree preserves shared repository/config', async t => {
  const parent = await folder(t); await repo(parent); const root = path.join(parent, 'linked'); await git(parent, 'worktree', 'add', '--detach', root, 'HEAD');
  const before = await fs.readFile(path.join(parent, '.git/config'), 'utf8'); const result = await configure(root, { mode: 'upstream' });
  assert.equal(result.mode, 'worktree'); assert.equal(await fs.readFile(path.join(parent, '.git/config'), 'utf8'), before);
});
test('follow release snapshot has shipped upstream ancestor; fetch never resets recipient files or pushes', async t => {
  const source = await folder(t); await repo(source, 'release'); const parent = await git(source, 'rev-parse', 'HEAD');
  await fs.writeFile(path.join(source, 'App.tsx'), 'new upstream change'); await git(source, 'commit', '-am', 'later upstream');
  const root = await folder(t); await fs.writeFile(path.join(root, 'delivery.json'), JSON.stringify({ sourceCommit: parent }));
  await git(root, 'init', '-b', 'release'); await git(root, 'config', `url.${source}.insteadOf`, AUTHOR_REMOTE);
  await configure(root, { mode: 'upstream' });
  assert.equal(await git(root, 'rev-parse', 'HEAD^'), parent);
  assert.equal(await git(root, 'config', 'branch.release.remote'), 'upstream'); assert.equal(await git(root, 'config', 'branch.release.merge'), 'refs/heads/release');
  assert.equal(await git(root, 'config', 'pull.ff'), 'only'); assert.equal(await git(root, 'remote'), 'upstream');
  assert.equal(await fs.readFile(path.join(root, 'App.tsx'), 'utf8'), 'export default () => null;\n');
  // Recipient initialization diverges from newer source, requiring deliberate merge.
  await assert.rejects(git(root, 'pull', '--ff-only'));
  assert.equal(await fs.readFile(path.join(root, 'App.tsx'), 'utf8'), 'export default () => null;\n');
});
test('interrupted initial fetch can be retried without claiming an unborn repo ready', async t => {
  const root = await folder(t); await git(root, 'init', '-b', 'release');
  await git(root, 'config', `url.${path.join(root, 'missing-repo')}.insteadOf`, AUTHOR_REMOTE);
  await assert.rejects(configure(root, { mode: 'upstream' }), /fetch failed/);
  await assert.rejects(git(root, 'config', '--get', 'saplingagent.storageMode'));
  await configure(root, { mode: 'local' }); assert.ok(await git(root, 'rev-parse', '--verify', 'HEAD')); assert.equal(await git(root, 'remote'), '');
});
test('unknown custom remote is not removed by local/own setup', async t => {
  const root = await folder(t); await repo(root); await git(root, 'remote', 'add', 'origin', 'https://example.invalid/existing.git');
  await assert.rejects(configure(root, { mode: 'local' }), /custom remotes/);
  await assert.rejects(configure(root, { mode: 'own', remoteUrl: 'https://example.invalid/other.git' }), /origin already/);
  assert.equal(await git(root, 'remote', 'get-url', 'origin'), 'https://example.invalid/existing.git');
});


test('own mode replaces author remote and tracking with the customer origin only', async t => {
  const root = await folder(t); await repo(root, 'release');
  await git(root, 'remote', 'add', 'origin', AUTHOR_REMOTE);
  await git(root, 'config', 'branch.release.remote', 'origin');
  await git(root, 'config', 'branch.release.merge', 'refs/heads/release');
  const sha = await git(root, 'rev-parse', 'HEAD');
  await configure(root, { mode: 'own', remoteUrl: 'https://example.invalid/customer.git' });
  assert.equal(await git(root, 'remote'), 'origin');
  assert.equal(await git(root, 'remote', 'get-url', 'origin'), 'https://example.invalid/customer.git');
  assert.equal(await git(root, 'rev-parse', 'HEAD'), sha);
  await assert.rejects(git(root, 'config', '--get', 'branch.release.remote'));
});
test('private files previously staged in an unborn repository cannot enter the initial commit', async t => {
  const root = await folder(t); await git(root, 'init', '-b', 'release');
  await fs.mkdir(path.join(root, 'local-secrets')); await fs.writeFile(path.join(root, 'local-secrets/key.txt'), 'SYNTHETIC_PRIVATE');
  await git(root, 'add', 'local-secrets/key.txt');
  await assert.rejects(configure(root, { mode: 'local' }), /already staged/);
  await assert.rejects(git(root, 'rev-parse', '--verify', 'HEAD'));
});
test('raw release ZIP matches a real upstream source tree without a provenance guess', async t => {
  const source = await folder(t); await repo(source, 'release'); const sha = await git(source, 'rev-parse', 'HEAD');
  const root = await folder(t); await git(root, 'init', '-b', 'release');
  await git(root, 'config', `url.${source}.insteadOf`, AUTHOR_REMOTE);
  await configure(root, { mode: 'upstream' }); assert.equal(await git(root, 'rev-parse', 'HEAD^'), sha);
  assert.equal(await fs.readFile(path.join(root, 'App.tsx'), 'utf8'), 'export default () => null;\n');
});
test('edited raw ZIP does not silently claim newest upstream as its source ancestor', async t => {
  const source = await folder(t); await repo(source, 'release');
  const root = await folder(t); await fs.writeFile(path.join(root, 'App.tsx'), 'customer edits');
  await git(root, 'init', '-b', 'release'); await git(root, 'config', `url.${source}.insteadOf`, AUTHOR_REMOTE);
  await assert.rejects(configure(root, { mode: 'upstream' }), /does not match upstream/);
  assert.equal(await fs.readFile(path.join(root, 'App.tsx'), 'utf8'), 'customer edits');
  await configure(root, { mode: 'local' }); assert.ok(await git(root, 'rev-parse', '--verify', 'HEAD'));
});


test('explicit own-to-local reconfiguration removes only its previously managed origin', async t => {
  const root = await folder(t); await configure(root, { mode: 'own', remoteUrl: 'https://example.invalid/customer.git' });
  const sha = await git(root, 'rev-parse', 'HEAD');
  await configure(root, { force: true, mode: 'local' });
  assert.equal(await git(root, 'remote'), ''); assert.equal(await git(root, 'rev-parse', 'HEAD'), sha);
});


test('explicit reconfiguration can change the previously managed own repository URL', async t => {
  const root = await folder(t); await configure(root, { mode: 'own', remoteUrl: 'https://example.invalid/first.git' });
  const sha = await git(root, 'rev-parse', 'HEAD');
  await configure(root, { force: true, mode: 'own', remoteUrl: 'https://example.invalid/second.git' });
  assert.equal(await git(root, 'remote', 'get-url', 'origin'), 'https://example.invalid/second.git');
  assert.equal(await git(root, 'rev-parse', 'HEAD'), sha);
});
