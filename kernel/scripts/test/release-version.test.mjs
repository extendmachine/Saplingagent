import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { verifyRelease } from '../verify-release.mjs';

async function fixture(t) {
  const parent = fileURLToPath(new URL('../../../.cache/release-gate/', import.meta.url));
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'repo-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'Synthetic release test'); git('config', 'user.email', 'release@example.invalid');
  const write = async (name, value) => { await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true }); await fs.writeFile(path.join(root, name), value); };
  const names = ['kernel/manager.mjs', 'kernel/recover.mjs', 'contracts/kernel.mjs', 'Saplingagent.sh', 'scripts/dev.mjs'];
  const files = [];
  for (const name of names) {
    const bytes = Buffer.from('Synthetic ' + name + '\n'); await write(name, bytes);
    files.push({ path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), executable: false });
  }
  await write('kernel/manifest.json', JSON.stringify({ schemaVersion: 3, version: '0.9.1', appApi: 1, minNode: '24.11.0', files }));
  await write('config/release.json', JSON.stringify({ schemaVersion: 1, version: '0.9.1' }));
  git('add', '.'); git('commit', '-m', 'Freeze synthetic source');
  return { root, git, write, commit: git('rev-parse', 'HEAD'), verify: options => verifyRelease({ sourceRoot: root, ref: 'HEAD', version: '0.9.1', ...options }) };
}

test('gate reads committed version, validates source and immutable tag, ignoring pending metadata', async t => {
  const f = await fixture(t); f.git('tag', 'v0.9.1');
  await f.write('config/release.json', '{broken pending metadata');
  const result = f.verify({ tag: 'v0.9.1' });
  assert.equal(result.commit, f.commit); assert.equal(result.version, '0.9.1'); assert.equal(result.kernelVersion, '0.9.1');
  assert.throws(() => f.verify({ version: '0.9.0' }), /committed/);
  assert.match(f.git('status', '--porcelain'), /config\/release.json/);
});
test('gate rejects a tag pointing at older code and release-only application changes', async t => {
  const f = await fixture(t); f.git('tag', 'v0.9.1');
  await f.write('README.md', 'Presentation change'); f.git('add', '.'); f.git('commit', '-m', 'Presentation only');
  assert.equal(f.verify().version, '0.9.1');
  assert.throws(() => f.verify({ tag: 'v0.9.1' }), /tag\/version/);
  await f.write('front/main.tsx', 'Unreviewed release code'); f.git('add', '.'); f.git('commit', '-m', 'Release code drift');
  assert.throws(() => f.verify({ main: f.commit }), /differs from the frozen main/);
});
test('gate rejects stale kernel hashes even when version and main agree', async t => {
  const f = await fixture(t); await f.write('kernel/manager.mjs', 'Changed source without manifest');
  f.git('add', '.'); f.git('commit', '-m', 'Broken hash');
  assert.throws(() => f.verify({ main: 'HEAD' }), /Stale kernel source hash/);
});

test('publication refuses stale compatibility metadata instead of publishing two version identities',async t=>{
 const f=await fixture(t);await f.write('config/release.json',JSON.stringify({schemaVersion:1,version:'0.9.2'}));f.git('add','.');f.git('commit','-m','Stale version mirror');assert.throws(()=>f.verify({main:'HEAD',version:'0.9.1'}),/compatibility mirror disagree/);
});
