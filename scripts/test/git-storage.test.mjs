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
async function emptyMain(root) {
  assert.equal(await git(root, 'branch', '--show-current'), 'main');
  assert.equal(await git(root, 'remote'), ''); assert.equal(await git(root, 'for-each-ref'), '');
  assert.equal(await git(root, 'ls-files'), ''); await assert.rejects(git(root, 'rev-parse', '--verify', 'HEAD'));
  const state = await readGitVersion(root);
  assert.equal(state.head, null); assert.equal(state.unborn, true); assert.deepEqual(state.recentCommits, []);
  assert.deepEqual(state.branches.map(branch => branch.name), ['main']);
}
test('fresh local install starts empty main with no staging, commit or remote and keeps private files', async t => {
  const root = await folder(t);
  for (const name of ['local-secrets/key.txt', 'backend/a/.env', 'backend/a/node_modules/x.js', 'data/chat.json', 'backend/agent-runtime/ai-tasks/runtime/RUN.txt', '.runtime/node.exe']) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true }); await fs.writeFile(path.join(root, name), 'SYNTHETIC_PRIVATE');
  }
  const output = []; await configure(root, { mode: 'local', output: text => output.push(text) }); await emptyMain(root);
  assert.match(output[0], /clears ALL previous Git/); assert.match(output.at(-1), /0 commits; no remotes/);
  assert.equal(await fs.readFile(path.join(root, 'local-secrets/key.txt'), 'utf8'), 'SYNTHETIC_PRIVATE');
  assert.doesNotMatch(await git(root, 'status', '--porcelain'), /local-secrets|node_modules|data\/|\.runtime/);
});
test('local always starts main regardless of delivery or explicit branch, while repair keeps later user history', async t => {
  const root = await folder(t); await fs.writeFile(path.join(root, 'delivery.json'), JSON.stringify({ git: { initialBranch: 'release' } }));
  await configure(root, { mode: 'local', branch: 'custom' }); await emptyMain(root);
  await git(root, 'add', 'App.tsx'); await git(root, 'commit', '-m', 'first customer version');
  await git(root, 'switch', '--detach', 'HEAD'); const sha = await git(root, 'rev-parse', 'HEAD');
  const result = await configure(root, { prompt: () => { throw new Error('Unexpected prompt'); } });
  assert.equal(result.preserved, true); assert.equal(await git(root, 'branch', '--show-current'), ''); assert.equal(await git(root, 'rev-parse', 'HEAD'), sha);
});
test('first-install menu only offers 1–3 and requires an explicit choice before erasing Git', async t => {
  const root = await folder(t), menu = [];
  await configure(root, { output: line => menu.push(line), prompt: (_label, fallback) => { assert.equal(fallback, ''); return '1'; } });
  assert.match(menu[0], /1\. Local only .*ERASE/); assert.match(menu[0], /2\. My own repository/); assert.match(menu[0], /3\. Follow/);
  assert.doesNotMatch(menu[0], /[04]\. |Cancel|Keep existing/);
  for (const choice of ['', '0', '4']) {
    const other = await folder(t); await repo(other); const sha = await git(other, 'rev-parse', 'HEAD');
    await assert.rejects(configure(other, { prompt: () => choice }), /invalid/i); assert.equal(await git(other, 'rev-parse', 'HEAD'), sha);
  }
});

test('saved independent Git setup omits upstream and rejects hidden 3 without altering files/history/remotes', async t => {
  const originalLanguage = process.env.SAPLING_LANG;
  t.after(() => { if (originalLanguage === undefined) delete process.env.SAPLING_LANG; else process.env.SAPLING_LANG = originalLanguage; });
  for (const mode of ['local', 'own']) for (const language of ['en', 'zh']) {
    process.env.SAPLING_LANG = language;
    const root = await folder(t); await repo(root, 'customer');
    await git(root, 'config', '--local', 'saplingagent.storageMode', mode);
    if (mode === 'own') await git(root, 'remote', 'add', 'origin', 'https://example.invalid/customer.git');
    await fs.writeFile(path.join(root, 'App.tsx'), 'pending customer edits');
    const config = await fs.readFile(path.join(root, '.git/config'), 'utf8'), head = await git(root, 'rev-parse', 'HEAD');
    const output = []; let promptText;
    await assert.rejects(configure(root, { force: true, output: text => output.push(text), prompt: label => { promptText = label; return '3'; } }), /1.*2/);
    assert.doesNotMatch(output.join('\n'), /3\.|Follow|跟随/);
    assert.match(promptText, /\[1-2\]/);
    assert.equal(await fs.readFile(path.join(root, '.git/config'), 'utf8'), config);
    assert.equal(await git(root, 'rev-parse', 'HEAD'), head);
    assert.equal(await fs.readFile(path.join(root, 'App.tsx'), 'utf8'), 'pending customer edits');
  }
});

test('saved upstream reconfiguration still shows follow release and independent choice 2 still connects own remote', async t => {
  const root = await folder(t); await repo(root); await git(root, 'config', '--local', 'saplingagent.storageMode', 'upstream');
  const output = []; await assert.rejects(configure(root, { force: true, output: text => output.push(text), prompt: () => '' }), /invalid/i);
  assert.match(output[0], /3\. Follow/);
  await git(root, 'config', '--local', 'saplingagent.storageMode', 'local');
  const responses = ['2', 'https://example.invalid/new.git'];
  await configure(root, { force: true, prompt: () => responses.shift() });
  assert.equal(await git(root, 'remote', 'get-url', 'origin'), 'https://example.invalid/new.git');
  assert.equal(await git(root, 'config', '--local', '--get', 'saplingagent.storageMode'), 'own');
});

test('an explicit independent-to-upstream request remains supported without restoring the hidden menu entry', async t => {
  const source = await folder(t); await repo(source, 'release');
  const root = await folder(t); await repo(root, 'release');
  await git(root, 'config', '--local', 'saplingagent.storageMode', 'own');
  await git(root, 'config', `url.${source}.insteadOf`, AUTHOR_REMOTE);
  await configure(root, { force: true, mode: 'upstream', branch: 'release', prompt: () => { throw new Error('Unexpected menu'); } });
  assert.equal(await git(root, 'config', '--local', '--get', 'saplingagent.storageMode'), 'upstream');
  assert.equal(await git(root, 'config', 'branch.release.remote'), 'upstream');
});
test('own remote belongs to customer; no network/publication and author origin is not retained', async t => {
  const root = await folder(t); await configure(root, { mode: 'own', remoteUrl: 'https://example.invalid/customer/app.git' });
  assert.equal(await git(root, 'remote', 'get-url', 'origin'), 'https://example.invalid/customer/app.git');
  assert.equal(await git(root, 'branch', '--show-current'), 'release');
  assert.equal(await git(root, 'config', '--local', '--get', 'saplingagent.storageMode'), 'own');
});
test('own storage can be connected after empty local initialization', async t => {
  const root = await folder(t); await configure(root, { mode: 'local' }); await emptyMain(root);
  await configure(root, { force: true, mode: 'own', remoteUrl: 'git@example.invalid:customer/app.git' });
  assert.ok(await git(root, 'rev-parse', 'HEAD')); assert.equal(await git(root, 'remote'), 'origin');
});
test('explicit local resets a dirty custom repository without deleting working source', async t => {
  const root = await folder(t); await repo(root, 'customer'); await git(root, 'remote', 'add', 'origin', 'https://example.invalid/own.git');
  await fs.writeFile(path.join(root, 'App.tsx'), 'user edit'); await configure(root, { prompt: () => '1' });
  await emptyMain(root); assert.equal(await fs.readFile(path.join(root, 'App.tsx'), 'utf8'), 'user edit');
});
test('invalid branch and credential-bearing remote fail before creating repository', async t => {
  for (const options of [{ mode: 'own', branch: '--oops', remoteUrl: 'https://example.invalid/a.git' }, { mode: 'own', remoteUrl: 'https://user:secret@example.invalid/a.git' }, { mode: 'own', remoteUrl: AUTHOR_REMOTE }]) {
    const root = await folder(t); await assert.rejects(configure(root, options)); await assert.rejects(fs.access(path.join(root, '.git')));
  }
  for (const value of ['ext::evil', 'file://host/x', 'https://example.invalid/r.git?token=bad', 'https://secret@example.invalid/r.git', '-x', 'a\nb']) assert.throws(() => validateRemote(value));
});
test('local reset erases old objects, tags, reflogs, aliases and all branches/remotes, retaining staged/untracked file contents', async t => {
  const root = await folder(t); await repo(root); const old = await git(root, 'rev-parse', 'HEAD');
  await git(root, 'branch', 'release'); await git(root, 'branch', 'testcode'); await git(root, 'tag', 'old');
  for (const name of ['origin','upstream','mirror']) await git(root, 'remote', 'add', name, `https://example.invalid/${name}.git`);
  await fs.mkdir(path.join(root, '.git/saplingagent')); await fs.writeFile(path.join(root, '.git/saplingagent/version-labels.json'), JSON.stringify({[old]:'Old alias'}));
  await fs.writeFile(path.join(root, 'App.tsx'), 'staged source'); await git(root, 'add', 'App.tsx');
  await fs.writeFile(path.join(root, 'extra.txt'), 'untracked source');
  const output=[]; await configure(root, { mode:'local', output: text => output.push(text) }); await emptyMain(root);
  assert.match(output[0], /commits, branches, tags, version names and remote configuration/);
  assert.equal(await fs.readFile(path.join(root, 'App.tsx'), 'utf8'), 'staged source'); assert.equal(await fs.readFile(path.join(root, 'extra.txt'), 'utf8'), 'untracked source');
  await assert.rejects(git(root, 'cat-file', '-t', old)); await assert.rejects(fs.access(path.join(root,'.git/logs'))); await assert.rejects(fs.access(path.join(root,'.git/saplingagent')));
  assert.doesNotMatch(await fs.readFile(path.join(root,'.git/config'),'utf8'), /https:|remote|url\./);
});
test('nested app initializes its own empty main and leaves parent history intact', async t => {
  const parent = await folder(t); await repo(parent); const root=path.join(parent,'child'); await fs.mkdir(root); await fs.writeFile(path.join(root,'app.txt'),'child');
  const sha=await git(parent,'rev-parse','HEAD'); await assert.rejects(readGitVersion(root),{code:'GIT_NOT_REPOSITORY'});
  await configure(root,{mode:'local'}); await emptyMain(root); assert.equal(await git(parent,'rev-parse','HEAD'),sha);
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
  await configure(root, { mode: 'local' }); await emptyMain(root);
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
test('local reset clears detached historical state and starts empty main while keeping file contents', async t => {
  const root=await folder(t); await repo(root); await git(root,'switch','--detach','HEAD'); await fs.writeFile(path.join(root,'App.tsx'),'pending');
  await configure(root,{force:true,mode:'local'}); await emptyMain(root); assert.equal(await fs.readFile(path.join(root,'App.tsx'),'utf8'),'pending');
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
test('local reset discards a previously staged private index without committing or deleting private files', async t => {
  const root = await folder(t); await git(root, 'init', '-b', 'release');
  await fs.mkdir(path.join(root, 'local-secrets')); await fs.writeFile(path.join(root, 'local-secrets/key.txt'), 'SYNTHETIC_PRIVATE');
  await git(root, 'add', 'local-secrets/key.txt');
  await configure(root, { mode: 'local' }); await emptyMain(root);
  assert.equal(await fs.readFile(path.join(root,'local-secrets/key.txt'),'utf8'),'SYNTHETIC_PRIVATE');
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
  await configure(root, { mode: 'local' }); await emptyMain(root);
});


test('explicit own-to-local reconfiguration erases previous history and all remotes', async t => {
  const root = await folder(t); await configure(root, { mode: 'own', remoteUrl: 'https://example.invalid/customer.git' });
  const sha = await git(root, 'rev-parse', 'HEAD');
  await configure(root, { force: true, mode: 'local' });
  await emptyMain(root); await assert.rejects(git(root, 'cat-file', '-t', sha));
});


test('explicit reconfiguration can change the previously managed own repository URL', async t => {
  const root = await folder(t); await configure(root, { mode: 'own', remoteUrl: 'https://example.invalid/first.git' });
  const sha = await git(root, 'rev-parse', 'HEAD');
  await configure(root, { force: true, mode: 'own', remoteUrl: 'https://example.invalid/second.git' });
  assert.equal(await git(root, 'remote', 'get-url', 'origin'), 'https://example.invalid/second.git');
  assert.equal(await git(root, 'rev-parse', 'HEAD'), sha);
});


test('local reset ignores invalid delivery metadata instead of importing any upstream branch/history', async t => {
  const root=await folder(t);await fs.writeFile(path.join(root,'delivery.json'),'{invalid');
  await configure(root,{mode:'local'});await emptyMain(root);
  assert.equal(await fs.readFile(path.join(root,'delivery.json'),'utf8'),'{invalid');
});

test('following release narrows future fetches and never imports author main/testcode/tags', async t => {
  const source=await folder(t);await repo(source,'release');await git(source,'branch','main');await git(source,'branch','testcode');await git(source,'tag','unrelated-tag');
  const root=await folder(t);await fs.writeFile(path.join(root,'delivery.json'),JSON.stringify({sourceCommit:await git(source,'rev-parse','HEAD')}));await git(root,'init','-b','release');await git(root,'config',`url.${source}.insteadOf`,AUTHOR_REMOTE);
  await configure(root,{mode:'upstream'});assert.equal(await git(root,'config','--get-all','remote.upstream.fetch'),'+refs/heads/release:refs/remotes/upstream/release');assert.equal(await git(root,'config','remote.upstream.tagOpt'),'--no-tags');
  await git(root,'fetch','upstream');const refs=(await git(root,'for-each-ref','--format=%(refname)','refs/remotes/')).split('\n');assert.deepEqual(refs.filter(ref=>ref!=='refs/remotes/upstream/HEAD'),['refs/remotes/upstream/release']);if(refs.includes('refs/remotes/upstream/HEAD'))assert.equal(await git(root,'symbolic-ref','refs/remotes/upstream/HEAD'),'refs/remotes/upstream/release');assert.equal(await git(root,'tag'),'');assert.equal(await git(root,'branch','--format=%(refname:short)'),'release');
});
