import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { checkoutGitVersion, commitGitVersion, nameGitVersion, readGitVersion, switchGitBranch } from '../git-versions.mjs';

const exec = promisify(execFile);
const run = (cwd, ...args) => exec('git', ['-C', cwd, ...args]);

async function repository() {
  const base = fileURLToPath(new URL('../../../.cache/git-version-tests/', import.meta.url));
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'repository-'));
  await run(root, 'init', '-b', 'main');
  await run(root, 'config', 'user.name', 'Saplingagent Test');
  await run(root, 'config', 'user.email', 'test@example.invalid');
  await fs.writeFile(path.join(root, 'note.txt'), 'main\n');
  await run(root, 'add', 'note.txt');
  await run(root, 'commit', '-m', 'initial');
  await run(root, 'branch', 'release');
  return root;
}

test('reads branch, commits and dirty files', async t => {
  const root = await repository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let state = await readGitVersion(root);
  assert.equal(state.branch, 'main');
  assert.equal(state.clean, true);
  assert.equal(state.version, state.head.shortSha);
  const cleanFingerprint = state.fingerprint;
  assert.deepEqual(state.branches.map(branch => branch.name), ['main', 'release']);
  await fs.writeFile(path.join(root, 'note.txt'), 'changed\n');
  state = await readGitVersion(root);
  assert.equal(state.clean, false);
  assert.equal(state.changeCount, 1);
  assert.equal(state.changes[0].file, 'note.txt');
  assert.match(state.version, new RegExp(`^${state.head.shortSha}\\+[a-f0-9]{6}$`));
  assert.notEqual(state.fingerprint, cleanFingerprint);
});

test('automatically commits current changes before switching local branches', async t => {
  const root = await repository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'note.txt'), 'saved before switch\n');
  await fs.writeFile(path.join(root, 'page.txt'), 'committed page\n');
  const switched = await switchGitBranch(root, 'release');
  assert.equal(switched.branch, 'release');
  assert.match(switched.autoCommit.subject, /save main before switching to release/);
  assert.equal((await run(root, 'show', 'main:note.txt')).stdout, 'saved before switch\n');
  assert.equal((await run(root, 'show', 'main:page.txt')).stdout, 'committed page\n');
  const returned = await switchGitBranch(root, 'main');
  assert.equal(returned.branch, 'main');
  assert.equal(returned.autoCommit, null);
  await assert.rejects(() => switchGitBranch(root, 'missing'), error => error.code === 'GIT_BRANCH_NOT_FOUND');
});

test('saves all current changes as a local commit without switching branches', async t => {
  const root = await repository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'note.txt'), 'saved by button\n');
  await fs.writeFile(path.join(root, 'new-page.txt'), 'new page\n');
  const saved = await commitGitVersion(root);
  assert.equal(saved.branch, 'main');
  assert.equal(saved.clean, true);
  assert.match(saved.savedCommit.subject, /save main from Saplingagent/);
  assert.equal((await run(root, 'show', 'HEAD:note.txt')).stdout, 'saved by button\n');
  assert.equal((await run(root, 'show', 'HEAD:new-page.txt')).stdout, 'new page\n');
  const unchanged = await commitGitVersion(root);
  assert.equal(unchanged.savedCommit, null);
});

test('custom names survive module reload and worktrees without changing commit subjects', async t => {
  const root = await repository();
  const worktree = `${root}-worktree`;
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  t.after(() => fs.rm(worktree, { recursive: true, force: true }));
  const original = await readGitVersion(root);
  await nameGitVersion(root, original.head.sha, '  Chat baseline  ');
  assert.equal((await readGitVersion(root)).head.displayName, 'Chat baseline');
  assert.equal((await run(root, 'show', '-s', '--format=%s', 'HEAD')).stdout.trim(), 'initial');
  assert.equal((await run(root, 'status', '--porcelain')).stdout, '');
  await run(root, 'worktree', 'add', '--detach', worktree, 'HEAD');
  assert.equal((await readGitVersion(worktree)).head.displayName, 'Chat baseline');
  const fresh = await import(`../git-versions.mjs?reload=${Date.now()}`);
  assert.equal((await fresh.readGitVersion(root)).recentCommits[0].displayName, 'Chat baseline');
  await nameGitVersion(worktree, original.head.sha, 'Second name');
  assert.equal((await readGitVersion(root)).head.displayName, 'Second name');
  await nameGitVersion(root, original.head.sha, '');
  assert.equal((await readGitVersion(root)).head.displayName, undefined);
});

test('historical checkout preserves branch tips, ignored private data and detached edits', async t => {
  const root = await repository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const baseline = (await readGitVersion(root)).head.sha;
  await fs.writeFile(path.join(root, '.gitignore'), 'private/\n');
  await fs.mkdir(path.join(root, 'private')); await fs.writeFile(path.join(root, 'private/session'), 'keep');
  await fs.writeFile(path.join(root, 'note.txt'), 'latest\n');
  const latest = await commitGitVersion(root);
  const tip = latest.head.sha;
  const older = await checkoutGitVersion(root, baseline);
  assert.equal(older.detached, true);
  assert.equal((await run(root, 'rev-parse', 'main')).stdout.trim(), tip);
  assert.equal(await fs.readFile(path.join(root, 'private/session'), 'utf8'), 'keep');
  await fs.writeFile(path.join(root, 'note.txt'), 'detached saved\n');
  const saved = await commitGitVersion(root);
  assert.equal((await run(root, 'rev-parse', `refs/saplingagent/saved/${saved.head.sha}`)).stdout.trim(), saved.head.sha);
  await fs.writeFile(path.join(root, 'note.txt'), 'detached pending\n');
  // The older version lacks ignore rules. Do not pretend an unignored file stays private.
  await fs.rm(path.join(root, 'private'), { recursive: true });
  const returned = await switchGitBranch(root, 'main');
  assert.equal(returned.branch, 'main');
  assert.equal(returned.head.sha, tip);
  assert.equal((await run(root, 'show', `${returned.autoCommit.sha}:note.txt`)).stdout, 'detached pending\n');
  assert.equal((await run(root, 'rev-parse', `refs/saplingagent/saved/${returned.autoCommit.sha}`)).stdout.trim(), returned.autoCommit.sha);
  assert.ok(returned.recentCommits.some(commit => commit.sha === saved.head.sha));
  assert.deepEqual(returned.branches.map(branch => branch.name), ['main', 'release']);
});

test('dirty named checkout first saves its latest work, then returns to that saved tip', async t => {
  const root = await repository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const initial = (await readGitVersion(root)).head.sha;
  await fs.writeFile(path.join(root, 'note.txt'), 'second\n'); await commitGitVersion(root);
  await fs.writeFile(path.join(root, 'note.txt'), 'pending\n');
  const older = await checkoutGitVersion(root, initial);
  assert.ok(older.autoCommit);
  const back = await switchGitBranch(root, 'main');
  assert.equal(back.head.sha, older.autoCommit.sha);
  assert.equal(await fs.readFile(path.join(root, 'note.txt'), 'utf8'), 'pending\n');
});

test('rejects bad commit/name inputs and retains malformed or locked label stores', async t => {
  const root = await repository(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const initial = await readGitVersion(root);
  await assert.rejects(() => checkoutGitVersion(root, '--force'), { code: 'GIT_INVALID_VERSION' });
  await assert.rejects(() => checkoutGitVersion(root, 'a'.repeat(40)), { code: 'GIT_VERSION_NOT_FOUND' });
  await assert.rejects(() => nameGitVersion(root, initial.head.sha, 'bad\nname'), { code: 'GIT_INVALID_LABEL' });
  await assert.rejects(() => nameGitVersion(root, initial.head.sha, 'x'.repeat(81)), { code: 'GIT_INVALID_LABEL' });
  const labels = path.join(root, '.git/saplingagent/version-labels.json');
  await fs.mkdir(path.dirname(labels)); await fs.writeFile(labels, '{broken');
  await assert.rejects(() => nameGitVersion(root, initial.head.sha, 'new'), { code: 'GIT_LABELS_INVALID' });
  assert.equal(await fs.readFile(labels, 'utf8'), '{broken');
  await fs.writeFile(labels, '{}'); await fs.writeFile(`${labels}.lock`, 'other writer');
  await assert.rejects(() => nameGitVersion(root, initial.head.sha, 'new'), { code: 'GIT_LABEL_BUSY' });
  assert.equal(await fs.readFile(`${labels}.lock`, 'utf8'), 'other writer');
  assert.equal((await run(root, 'rev-parse', 'HEAD')).stdout.trim(), initial.head.sha);
});

test('history expands with limits and detached HEAD remains present', async t => {
  const root = await repository(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'note.txt'), 'second'); await commitGitVersion(root);
  const limited = await readGitVersion(root, { limit: 1 });
  assert.equal(limited.recentCommits.length, 1); assert.equal(limited.historyTruncated, true);
  assert.equal((await readGitVersion(root, { limit: 10 })).recentCommits.length, 2);
  await assert.rejects(() => readGitVersion(root, { limit: 0 }), { code: 'GIT_INVALID_LIMIT' });
});

test('saving historical source excludes credentials/runtime files even without old ignore rules', async t => {
  const root = await repository(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'local-secrets'));
  await fs.writeFile(path.join(root, 'local-secrets/token'), 'SYNTHETIC_PRIVATE');
  await fs.writeFile(path.join(root, '.env'), 'SYNTHETIC_PRIVATE');
  await fs.writeFile(path.join(root, 'note.txt'), 'safe source');
  const saved = await commitGitVersion(root);
  const files = (await run(root, 'ls-tree', '-r', '--name-only', saved.head.sha)).stdout;
  assert.doesNotMatch(files, /local-secrets|\.env/);
  assert.equal(await fs.readFile(path.join(root, 'local-secrets/token'), 'utf8'), 'SYNTHETIC_PRIVATE');
  await run(root, 'add', 'local-secrets/token');
  await assert.rejects(() => commitGitVersion(root), { code: 'GIT_PRIVATE_FILES' });
  assert.equal((await run(root, 'rev-parse', 'HEAD')).stdout.trim(), saved.head.sha);
});


test('application without its own repo cannot read or mutate the parent repo', async t => {
  const parent = await repository(); t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'customer'); await fs.mkdir(root);
  const sha = (await run(parent, 'rev-parse', 'HEAD')).stdout.trim();
  for (const action of [() => readGitVersion(root), () => nameGitVersion(root, sha, 'wrong'), () => checkoutGitVersion(root, sha), () => commitGitVersion(root), () => switchGitBranch(root, 'release')]) await assert.rejects(action(), { code: 'GIT_NOT_REPOSITORY' });
  assert.equal((await run(parent, 'rev-parse', 'HEAD')).stdout.trim(), sha);
  assert.equal((await run(parent, 'branch', '--show-current')).stdout.trim(), 'main');
});


test('empty main reads without writing history, switches to itself, and first explicit save creates safe source history', async t => {
  const base = fileURLToPath(new URL('../../../.cache/git-version-tests/', import.meta.url));
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'empty-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await run(root, 'init', '-b', 'main'); await run(root, 'config', 'user.name', 'Fixture'); await run(root, 'config', 'user.email', 'fixture@example.invalid');
  const clean = await readGitVersion(root);
  assert.equal(clean.unborn, true); assert.equal(clean.head, null); assert.equal(clean.branch, 'main'); assert.equal(clean.detached, false);
  assert.equal(clean.version, 'uncommitted'); assert.equal(clean.clean, true); assert.deepEqual(clean.recentCommits, []);
  assert.deepEqual(clean.branches.map(branch => [branch.name, branch.current]), [['main', true]]);
  assert.equal((await commitGitVersion(root)).savedCommit, null); assert.equal((await switchGitBranch(root, 'main')).head, null);
  await assert.rejects(run(root, 'rev-parse', '--verify', 'HEAD'));
  await assert.rejects(checkoutGitVersion(root, 'a'.repeat(40)), { code: 'GIT_VERSION_NOT_FOUND' });
  await fs.writeFile(path.join(root, 'note.txt'), 'first source');
  await fs.mkdir(path.join(root, 'local-secrets')); await fs.writeFile(path.join(root, 'local-secrets/key.txt'), 'SYNTHETIC_PRIVATE');
  const pending = await readGitVersion(root); assert.notEqual(pending.fingerprint, clean.fingerprint);
  assert.equal((await readGitVersion(root)).fingerprint, pending.fingerprint); assert.equal(pending.head, null);
  const saved = await commitGitVersion(root);
  assert.equal(saved.unborn, false); assert.ok(saved.head.sha); assert.equal(saved.branch, 'main'); assert.equal(saved.recentCommits.length, 1);
  assert.equal((await run(root, 'ls-tree', '-r', '--name-only', 'HEAD')).stdout.trim(), 'note.txt');
  assert.equal((await run(root, 'remote')).stdout.trim(), '');
});

test('background Git status does not refresh the index or request optional locks', async t => {
  const root = await repository(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const index = path.join(root, '.git/index'), before = await fs.readFile(index);
  const future = new Date(Date.now() + 60000); await fs.utimes(path.join(root, 'note.txt'), future, future);
  const previous = process.env.GIT_OPTIONAL_LOCKS; process.env.GIT_OPTIONAL_LOCKS = '1';
  try { assert.equal((await readGitVersion(root)).clean, true); }
  finally { if (previous === undefined) delete process.env.GIT_OPTIONAL_LOCKS; else process.env.GIT_OPTIONAL_LOCKS = previous; }
  assert.deepEqual(await fs.readFile(index), before);
});

test('version naming recovers a proven dead owner while preserving old live, unknown and symlink locks', async t => {
  const root = await repository(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const state = await readGitVersion(root), directory = path.join(root, '.git/saplingagent/version-labels.json.lock');
  const { spawn } = await import('node:child_process'); const child = spawn(process.execPath, ['-e', 'process.exit(0)']);
  await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
  await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, 'owner.json'), JSON.stringify({ id: 'dead-owner', pid: child.pid }));
  assert.equal((await nameGitVersion(root, state.head.sha, 'Recovered')).head.displayName, 'Recovered');
  await assert.rejects(fs.access(directory));
  await fs.mkdir(directory); const live = JSON.stringify({ id: 'live-owner', pid: process.pid });
  await fs.writeFile(path.join(directory, 'owner.json'), live); const old = new Date(0); await fs.utimes(directory, old, old);
  await assert.rejects(nameGitVersion(root, state.head.sha, 'Wrong'), { code: 'GIT_LABEL_BUSY' });
  assert.equal(await fs.readFile(path.join(directory, 'owner.json'), 'utf8'), live);
  await fs.rm(directory, { recursive: true }); await fs.mkdir(directory); await fs.utimes(directory, old, old);
  await assert.rejects(nameGitVersion(root, state.head.sha, 'Unknown'), { code: 'GIT_LABEL_BUSY' });
  await fs.rm(directory, { recursive: true });
  if (process.platform !== 'win32') {
    const outside = path.join(root, 'outside-lock'); await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'owner.json'), JSON.stringify({ id: 'dead', pid: child.pid }));
    await fs.symlink(outside, directory, 'dir'); await assert.rejects(nameGitVersion(root, state.head.sha, 'Symlink'), { code: 'GIT_LABEL_BUSY' });
    assert.equal((await fs.lstat(directory)).isSymbolicLink(), true); assert.equal((await fs.readdir(outside)).length, 1);
  }
});
