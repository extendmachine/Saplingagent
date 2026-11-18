import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {configurationWritePending,recoverConfigurationWrite} from './configuration-transaction.mjs';
import {ensureManagedDirectory} from './local-storage.mjs';

const busy=()=>Object.assign(Error('Another configuration write is running. Retry after it finishes; inspect an unverified write.lock before removing it.'),{code:'CONFIG_BUSY',status:409});

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const exec = promisify(execFile);
const inspect = file => fs.lstat(file).catch(error => {
  if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
  throw error;
});
const sameFile = (a, b) => a && b && a.dev === b.dev && a.ino === b.ino;

function exited(pid) {
  if (!Number.isSafeInteger(pid) || pid < 2) return false;
  try { process.kill(pid, 0); } catch (error) { return error.code === 'ESRCH'; }
  return false;
}

async function readReceipt(file) {
  const location = await inspect(file);
  const marker = location?.isDirectory() ? path.join(file, 'owner.json') : file;
  const stat = marker === file ? location : await inspect(marker);
  if (!stat?.isFile() || stat.size > 1024) return null;
  let owner;
  try { owner = JSON.parse(await fs.readFile(marker, 'utf8')); }
  catch (error) { if (error instanceof SyntaxError || ['ENOENT','ENOTDIR','EISDIR'].includes(error.code)) return null; throw error; }
  return {stat, marker, owner};
}

async function legacyClaimClosed(file) {
  // Older reapers held an open handle on an empty file until after unlink.
  // Probe that exact file. A missing probe or ambiguous result keeps it busy.
  const options = {timeout:3000, windowsHide:true, maxBuffer:32768};
  if (process.platform === 'win32') {
    const command = "try { $s=[IO.File]::Open($env:SAPLING_CLAIM_PATH,'Open','Read','None'); $s.Dispose(); exit 0 } catch { exit 1 }";
    try {
      await exec('powershell.exe', ['-NoProfile','-NonInteractive','-Command',command],
        {...options, env:{...process.env, SAPLING_CLAIM_PATH:file}});
      return true;
    } catch { return false; }
  }
  if (process.platform === 'darwin') {
    try { await exec('/usr/sbin/lsof', ['-nP','-t','--',file], options); }
    catch (error) { return error.code === 1 && error.stdout === '' && error.stderr === ''; }
  }
  return false;
}

async function reserveLegacyClaim(file, ownerId) {
  const claim = file + '.' + ownerId + '.reclaim';
  try {
    // The old reaper uses open(wx) on this path. A directory reserves it even
    // if this process dies before another byte is written.
    await fs.mkdir(claim, {mode:0o700});
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stat = await inspect(claim);
  if (!stat) throw busy();
  if (stat.isDirectory()) {
    if ((await fs.readdir(claim)).length) throw busy();
  } else if (!stat.isFile() || stat.size !== 0 || !await legacyClaimClosed(claim)) {
    throw busy();
  }
  return async () => {
    if (sameFile(stat, await inspect(claim))) {
      if (stat.isDirectory()) await fs.rmdir(claim);
      else await fs.unlink(claim);
    }
  };
}

async function replaceExitedWriter(file, stageMarker) {
  const prior = await readReceipt(file);
  const id = prior?.owner?.id;
  if (typeof id !== 'string' || !exited(prior.owner.pid)) throw busy();
  const legacy = uuid.test(id) && prior.marker === file;
  if (!legacy && !(id.startsWith('v2:') && uuid.test(id.slice(3)))) throw busy();
  const dbFile = path.join(path.dirname(file), 'write-recovery.sqlite');
  const existing = await inspect(dbFile);
  if (existing && (!existing.isFile() || existing.size !== 0 || existing.nlink > 1)) throw busy();
  // This mutex stores no tables. Its transaction journal lives in memory.
  for (const suffix of ['-journal','-wal','-shm']) if (await inspect(dbFile + suffix)) throw busy();
  const {DatabaseSync} = await import('node:sqlite');
  // Only SQLite opens this inode. A separate file descriptor closed by this
  // process could cancel its POSIX advisory locks.
  const db = new DatabaseSync(dbFile);
  try {
    try { db.exec('PRAGMA journal_mode=MEMORY; BEGIN IMMEDIATE'); }
    catch (error) { if ([5,6].includes(error.errcode & 255)) throw busy(); throw error; }
    if (!existing) await fs.chmod(dbFile, 0o600);
    const matches = async () => {
      const current = await readReceipt(file);
      return sameFile(prior.stat, current?.stat) && current.owner?.id === id && current.owner.pid === prior.owner.pid;
    };
    if (!await matches()) throw busy();
    const releaseClaim = legacy ? await reserveLegacyClaim(file, id) : null;
    try {
      if (legacy && !await matches()) throw busy();
      await fs.rename(stageMarker, prior.marker);
    } finally { if (releaseClaim) await releaseClaim().catch(() => {}); }
  } finally { db.close(); } // On process exit the OS releases this reservation.
}

async function discardCandidate(directory) {
  // An interrupted candidate holds at most one marker. Preserve foreign entries.
  if (!(await inspect(directory))?.isDirectory()) return;
  const entries = await fs.readdir(directory);
  if (entries.some(name => name !== 'owner.json')) return;
  await fs.unlink(path.join(directory, 'owner.json')).catch(() => {});
  await fs.rmdir(directory).catch(() => {});
}

async function tidyCandidates(directory) {
  for (const entry of await fs.readdir(directory, {withFileTypes:true})) {
    const match = /^write-candidate-([0-9]+)-(.+)$/.exec(entry.name);
    if (entry.isDirectory() && match && uuid.test(match[2]) && exited(Number(match[1]))) {
      await discardCandidate(path.join(directory, entry.name)).catch(() => {});
    }
  }
}

// New leases are published as nonempty directories in a single rename. A
// crash cannot leave an anonymous lock, even on volumes without hard links.
export async function acquireConfigurationWrite(root) {
  const directory = await ensureManagedDirectory(root, 'local-secrets/ai-config');
  await tidyCandidates(directory);
  const file = path.join(directory, 'write.lock');
  const nonce = randomUUID(), id = 'v2:' + nonce;
  const stageName = 'write-candidate-' + process.pid + '-' + nonce;
  const stage = path.join(directory, stageName), stageMarker = path.join(stage, 'owner.json');
  await fs.mkdir(stage, {mode:0o700});
  let identity;
  try {
    await fs.writeFile(stageMarker, JSON.stringify({id,pid:process.pid}) + '\n', {flag:'wx',mode:0o600});
    identity = await fs.lstat(stageMarker);
    let occupied = await inspect(file);
    if (!occupied) {
      try { await fs.rename(stage, file); }
      catch (error) { occupied = await inspect(file); if (!occupied) throw error; }
    }
    if (occupied) await replaceExitedWriter(file, stageMarker);
  } finally { await discardCandidate(stage).catch(() => {}); }

  let releasing;
  const releaseOnce = async currentRoot => {
    const target = path.join(await fs.realpath(currentRoot), 'local-secrets/ai-config/write.lock');
    const current = await readReceipt(target);
    if (!sameFile(identity, current?.stat) || current.owner?.id !== id) return;
    if (current.marker === target) { await fs.unlink(target); return; }
    // Retire the complete directory before removing its marker. Even a crash
    // here leaves the public pathname available for the next writer.
    const retired = path.join(path.dirname(target), 'write-candidate-' + process.pid + '-' + randomUUID());
    await fs.rename(target, retired);
    await discardCandidate(retired).catch(() => {});
  };
  const release = (currentRoot = root) => {
    releasing ??= releaseOnce(currentRoot).catch(error => { releasing = null; throw error; });
    return releasing;
  };
  try { await recoverConfigurationWrite(root); } catch (error) { await release(); throw error; }
  return release;
}
export async function withConfigurationWrite(root, work) {
  const release=await acquireConfigurationWrite(root);
  try {return await work();} finally {await release();}
}

export async function atomicConfigurationJSON(file, value) {
  const stat=await fs.lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(stat&&!stat.isFile())throw Object.assign(new Error('Configuration file must be a regular file.'),{code:'CONFIG_STORAGE_ERROR',status:409});
  const stage=file+'.'+randomUUID()+'.tmp';
  try {await fs.writeFile(stage,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await fs.rename(stage,file);}
  finally {await fs.rm(stage,{force:true});}
}

// Native Codex reads auth.json directly. Do not launch it between credential
// replacement and publication. A dead writer's previous image is restored here.
export async function ensureNativeConfigurationCommitted(root) {
  if(await configurationWritePending(root))await withConfigurationWrite(root,async()=>{});
}
