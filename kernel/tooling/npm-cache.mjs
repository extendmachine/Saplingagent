// Reuse integrity-addressed tarballs with the pinned npm. npm still owns each
// project's metadata, configuration, credentials, logs and writable install.
import fs from 'node:fs/promises';
import {constants, createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {runtimeHome, runtimeMode} from './bindings.mjs';
import {ensureManagedDirectory} from '../contracts/local-storage.mjs';
import reviewed from './public-npm-locks.json' with { type: 'json' };

const reviewedSets = new Set(Object.values(reviewed));
const localContent = '.cache/npm/_cacache/content-v2/sha512';
const sharedContent = 'cache/public-npm-v1/sha512';

async function packagePlan(cwd) {
  let bytes;
  try { bytes = await fs.readFile(path.join(cwd, 'npm-shrinkwrap.json')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    bytes = await fs.readFile(path.join(cwd, 'package-lock.json'));
  }
  const entries = new Map();
  let allPublic = true;
  for (const [location, item] of Object.entries(JSON.parse(bytes).packages || {})) {
    if (!location) continue;
    const publicUrl = /^https:\/\/registry\.npmjs\.org\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+\/-\/[a-zA-Z0-9.+_-]+\.tgz$/.test(item?.resolved);
    if (!publicUrl || !/^sha512-[a-zA-Z0-9+/]{86}==$/.test(item?.integrity)) {
      allPublic = false;
      continue;
    }
    entries.set(item.resolved+' '+item.integrity, Buffer.from(item.integrity.slice(7), 'base64').toString('hex'));
  }
  const fingerprint = createHash('sha256').update([...entries.keys()].sort().join('\n')).digest('hex');
  return {digests: new Set(entries.values()), publish: allPublic && reviewedSets.has(fingerprint)};
}

async function regularAt(base, relative) {
  const file = path.join(base, relative);
  try {
    return (await fs.lstat(file)).isFile() && await fs.realpath(file) === file;
  } catch { return false; }
}

async function copyVerified(from, fromDir, to, toDir, digest, replace) {
  const suffix = digest.slice(0,2)+'/'+digest.slice(2,4)+'/'+digest.slice(4);
  const source = fromDir+'/'+suffix, destination = toDir+'/'+suffix;
  const target = path.join(to, destination);
  const existing = await fs.lstat(target).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (existing && (!replace || !existing.isFile() || await fs.realpath(target) !== target)) return;
  if (!await regularAt(from, source)) return;
  const directory = await ensureManagedDirectory(to, path.posix.dirname(destination));
  const stage = path.join(directory, randomUUID()+'.tmp');
  try {
    await fs.copyFile(path.join(from, source), stage, constants.COPYFILE_FICLONE | constants.COPYFILE_EXCL);
    await fs.chmod(stage, 0o600);
    const hash = createHash('sha512');
    for await (const chunk of createReadStream(stage)) hash.update(chunk);
    if (hash.digest('hex') !== digest) return 'corrupt';
    await fs.rename(stage, target);
  } finally { await fs.rm(stage, {force:true}); }
}

export async function withPublicNpmCache(root, cwd, install, {signal} = {}) {
  signal?.throwIfAborted();
  if (runtimeMode(root) === 'portable') return install();
  const plan = await packagePlan(cwd).catch(() => null);
  if (!plan?.digests.size) return install();
  const project = await fs.realpath(root), home = runtimeHome(project);
  let library = await fs.realpath(home).catch(() => null);
  const corrupt = new Set();
  if (library && await fs.access(path.join(library, sharedContent)).then(() => true, () => false)) {
    for (const digest of plan.digests) {
      signal?.throwIfAborted();
      if (await copyVerified(library, sharedContent, project, localContent, digest, false).catch(() => null) === 'corrupt') corrupt.add(digest);
    }
  }
  const result = await install();
  if (plan.publish) {
    // A custom lock may consume prior public bytes, but can never authorize
    // publication of its own packages. An unavailable cache is just a miss.
    library ??= await fs.mkdir(home, {recursive:true,mode:0o700}).then(() => fs.realpath(home)).catch(() => null);
    if (library) for (const digest of plan.digests) {
      signal?.throwIfAborted();
      await copyVerified(project, localContent, library, sharedContent, digest, corrupt.has(digest)).catch(() => {});
    }
  }
  return result;
}
