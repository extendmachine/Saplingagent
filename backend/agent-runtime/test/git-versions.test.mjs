import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { readGitVersion, switchGitBranch } from '../git-versions.mjs';

const exec = promisify(execFile);
const run = (cwd, ...args) => exec('git', ['-C', cwd, ...args]);

async function repository() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'saplingagent-git-'));
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
