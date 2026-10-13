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
test('first-install menu has only choices 1–3 and defaults to local without enabling upstream', async t => {
  const root = await folder(t); const prompts = [], menu = [];
  await configure(root, { output: line => menu.push(line), prompt: (label, fallback) => { prompts.push(label); assert.equal(fallback, '1'); return fallback; } });
  assert.equal(prompts.length, 1); assert.equal(await git(root, 'remote'), '');
  assert.match(menu[0], /1\. Local only/); assert.match(menu[0], /2\. My own repository/); assert.match(menu[0], /3\. Follow/);
  assert.doesNotMatch(menu[0], /[04]\. |Cancel|Keep existing/);
  for (const choice of ['0', '4']) {
    const other = await folder(t); await assert.rejects(configure(other, { prompt: () => choice }), /invalid/i);
    await assert.rejects(fs.access(path.join(other, '.git')));
  }
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
test('default local choice retains existing custom branch, history and pending source', async t => {
  const root = await folder(t); await repo(root, 'customer'); await git(root, 'remote', 'add', 'origin', 'https://example.invalid/own.git');
  await fs.writeFile(path.join(root, 'App.tsx'), 'user edit'); const before = await git(root, 'rev-parse', 'HEAD');
  await configure(root, { prompt: (_label, fallback) => fallback });
  assert.equal(await git(root, 'branch', '--show-current'), 'customer'); assert.equal(await git(root, 'rev-parse', 'HEAD'), before);
  assert.equal(await fs.readFile(path.join(root, 'App.tsx'), 'utf8'), 'user edit');
  assert.equal(await git(root, 'remote'), '');
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
  await assert.rejects(configure(root, { mode: 'local', branch: 'release' }), /pending changes/);
  assert.equal(await git(root, 'branch', '--show-current'), 'main'); assert.equal(await git(root, 'remote', 'get-url', 'origin'), AUTHOR_REMOTE);
});
test('local choice preserves author clone current branch and history while removing remotes', async t => {
  const root = await folder(t); await repo(root); await git(root, 'branch', 'release'); await git(root, 'remote', 'add', 'origin', AUTHOR_REMOTE);
  const sha = await git(root, 'rev-parse', 'main'); await configure(root, { mode: 'local' });
  assert.equal(await git(root, 'branch', '--show-current'), 'main'); assert.equal(await git(root, 'rev-parse', 'main'), sha); assert.equal(await git(root, 'remote'), '');
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
test('local choice removes every custom remote and tracking link without changing source or history', async t => {
  const root = await folder(t); await repo(root, 'customer');
  for (const name of ['origin', 'upstream', 'mirror']) await git(root, 'remote', 'add', name, `https://example.invalid/${name}.git`);
  await git(root, 'config', 'branch.customer.remote', 'mirror'); await git(root, 'config', 'branch.customer.merge', 'refs/heads/customer');
  await fs.writeFile(path.join(root, 'App.tsx'), 'staged edit'); await git(root, 'add', 'App.tsx');
  await fs.writeFile(path.join(root, 'extra.txt'), 'untracked edit');
  const sha = await git(root, 'rev-parse', 'HEAD'), status = await git(root, 'status', '--porcelain'), staged = await git(root, 'diff', '--cached');
  await configure(root, { prompt: () => '1' });
  assert.equal(await git(root, 'remote'), ''); assert.equal(await git(root, 'branch', '--show-current'), 'customer');
  assert.equal(await git(root, 'rev-parse', 'HEAD'), sha); assert.equal(await git(root, 'status', '--porcelain'), status);
  assert.equal(await git(root, 'diff', '--cached'), staged); await assert.rejects(git(root, 'config', '--get', 'branch.customer.remote'));
});
test('own choice updates an existing custom origin to the explicitly selected URL', async t => {
  const root = await folder(t); await repo(root); await git(root, 'remote', 'add', 'origin', 'https://example.invalid/old.git');
  await git(root, 'remote', 'add', 'mirror', 'https://example.invalid/mirror.git');
  await git(root, 'config', '--add', 'remote.origin.url', 'https://example.invalid/extra-fetch.git');
  await git(root, 'config', 'remote.origin.pushurl', 'https://example.invalid/old-push.git');
  const sha = await git(root, 'rev-parse', 'HEAD');
  const answers = ['2', 'https://example.invalid/new.git'];
  await configure(root, { prompt: () => answers.shift() });
  assert.equal(await git(root, 'remote', 'get-url', '--all', 'origin'), 'https://example.invalid/new.git');
  assert.equal(await git(root, 'remote', 'get-url', '--push', '--all', 'origin'), 'https://example.invalid/new.git');
  assert.equal(await git(root, 'remote', 'get-url', 'mirror'), 'https://example.invalid/mirror.git');
  assert.equal(await git(root, 'rev-parse', 'HEAD'), sha); assert.equal(await git(root, 'branch', '--show-current'), 'main');
});
test('explicit local setup preserves detached version and dirty files while removing all remotes', async t => {
  const root = await folder(t); await repo(root); await git(root, 'switch', '--detach', 'HEAD');
  await git(root, 'remote', 'add', 'origin', AUTHOR_REMOTE); await fs.writeFile(path.join(root, 'App.tsx'), 'pending');
  const sha = await git(root, 'rev-parse', 'HEAD'); await configure(root, { force: true, mode: 'local' });
  assert.equal(await git(root, 'branch', '--show-current'), ''); assert.equal(await git(root, 'rev-parse', 'HEAD'), sha);
  assert.equal(await git(root, 'remote'), ''); assert.equal(await fs.readFile(path.join(root, 'App.tsx'), 'utf8'), 'pending');
});
test('repeat installation preserves saved legacy existing mode without a removed menu choice', async t => {
  const root = await folder(t); await repo(root, 'customer'); await git(root, 'remote', 'add', 'origin', 'https://example.invalid/old.git');
  await git(root, 'config', 'saplingagent.storageMode', 'existing');
  const result = await configure(root, { prompt: () => { throw new Error('Unexpected prompt'); } });
  assert.equal(result.mode, 'existing'); assert.equal(result.preserved, true);
  assert.equal(await git(root, 'remote', 'get-url', 'origin'), 'https://example.invalid/old.git');
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


test('explicit own-to-local reconfiguration removes all remotes and keeps its existing history', async t => {
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
