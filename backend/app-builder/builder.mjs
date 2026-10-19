import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { commandShell, terminateOwned } from '../../kernel/contracts/local-process.mjs';
import { spawn } from 'node:child_process';

export class BuilderError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status = 400) => { throw new BuilderError(code, message, status); };
const digest = (value) => createHash('sha256').update(value).digest('hex');
const OUTPUT_LIMIT = 1024 * 1024;
function targetPath(root, value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) fail('INVALID_INPUT', 'path must be a nonempty filesystem path');
  return path.resolve(root, value);
}
export async function safePath(root, relative, { createParents = false, directory = false } = {}) {
  const target = targetPath(root, relative);
  if (createParents) await fs.mkdir(directory ? target : path.dirname(target), { recursive: true });
  return target;
}
function encoding(value = 'utf8') {
  if (!['utf8', 'base64'].includes(value)) fail('INVALID_INPUT', 'encoding must be utf8 or base64');
  return value;
}
function contentBytes(content, mode) {
  if (typeof content !== 'string') fail('INVALID_INPUT', 'content must be a string');
  return Buffer.from(content, encoding(mode));
}
function reason(value, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > 4000 || required && !value.trim()) fail('INVALID_INPUT', 'reason must be a bounded string');
  return value;
}
function integer(value, fallback, minimum, maximum, name) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) fail('INVALID_INPUT', `${name} is outside the supported pagination or timeout range`);
  return parsed;
}
async function exists(file) {
  try { return await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function metadataWrite(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}
async function snapshotOriginal(target, destination, operation) {
  let info;
  try { info = await fs.lstat(target); }
  catch (error) {
    if (error.code === 'ENOENT') return { hasOriginal: false, originalKind: 'missing', originalSnapshot: false, originalHash: null };
    return { hasOriginal: null, originalKind: 'unknown', originalSnapshot: false, backupError: error.code || 'BACKUP_FAILED' };
  }
  const result = { hasOriginal: true, originalKind: info.isSymbolicLink() ? 'symlink' : 'file', originalMode: info.mode & 0o7777, originalSnapshot: false, originalHash: null };
  if (info.isSymbolicLink()) {
    result.linkTarget = await fs.readlink(target);
    result.followedPath = path.resolve(path.dirname(target), result.linkTarget);
    result.hadReferent = !!await exists(result.followedPath);
    if (operation === 'delete' || !result.hadReferent) return result;
  }
  try {
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await fs.copyFile(target, destination); await fs.chmod(destination, 0o600);
    result.originalSnapshot = true;
    const size = (await fs.stat(destination)).size;
    if (size <= 4 * OUTPUT_LIMIT) result.originalHash = digest(await fs.readFile(destination));
  } catch (error) { result.backupError = error.code || 'BACKUP_FAILED'; }
  return result;
}
async function removeFile(target) { await fs.unlink(target).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }

export async function createBuilder(applicationRoot) {
  const root = path.resolve(applicationRoot);
  const snapshotRoot = path.join(root, 'snapshots/app-builder/changes');
  await fs.mkdir(snapshotRoot, { recursive: true, mode: 0o700 }).catch(() => {});
  const activeCommands = new Set();
  let queue = Promise.resolve();
  const serialize = (operation) => { const current = queue.then(operation); queue = current.catch(() => {}); return current; };
  const folder = (id) => {
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) fail('INVALID_INPUT', 'Invalid change identifier');
    return path.join(snapshotRoot, id);
  };
  const save = (meta) => metadataWrite(path.join(folder(meta.changeId), 'meta.json'), meta);
  const load = async (id) => {
    let meta;
    try { meta = JSON.parse(await fs.readFile(path.join(folder(id), 'meta.json'), 'utf8')); }
    catch (error) { if (error instanceof SyntaxError) fail('CORRUPT_SNAPSHOT', 'Snapshot JSON cannot be parsed', 500); throw error; }
    if (!meta || meta.changeId !== id || !Array.isArray(meta.files)) fail('CORRUPT_SNAPSHOT', 'Snapshot metadata cannot be used', 500);
    return meta;
  };
  const indexed = (meta) => meta.formatVersion === 2;
  const artifact = (meta, file, kind) => indexed(meta) ? path.join(folder(meta.changeId), kind, String(file.index)) : path.join(folder(meta.changeId), kind, file.path);
  const output = (meta) => ({ changeId: meta.changeId, status: meta.status, reason: meta.reason, createdAt: meta.createdAt, updatedAt: meta.updatedAt, files: meta.files.map((file) => ({ path: file.path, absolutePath: targetPath(root, file.path), operation: file.operation || 'write', originalHash: file.originalHash ?? null, appliedHash: file.appliedHash ?? null, originalSnapshot: file.originalSnapshot ?? file.originalHash !== null, backupError: file.backupError })), checks: [], error: meta.error, ...(meta.files.some((file) => file.backupError) ? { warnings: meta.files.filter((file) => file.backupError).map((file) => ({ code: 'BACKUP_UNAVAILABLE', cause: file.backupError, path: file.path, message: 'Original file was not saved; manual rollback is unavailable for this file' })) } : {}) });
  const api = {
    async listFiles(relative = '.', options = {}) {
      await queue;
      const target = targetPath(root, relative);
      const limit = integer(options.limit, 200, 1, 2000, 'limit');
      const offset = integer(options.cursor, 0, 0, Number.MAX_SAFE_INTEGER, 'cursor');
      const entries = (await fs.readdir(target, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
      const files = [];
      for (const entry of entries.slice(offset, offset + limit)) {
        const absolutePath = path.join(target, entry.name);
        const info = await fs.lstat(absolutePath);
        files.push({ path: path.isAbsolute(relative) ? absolutePath : path.join(relative, entry.name), absolutePath, size: info.size, type: entry.isSymbolicLink() ? 'symlink' : entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other', writable: true });
      }
      const truncated = offset + files.length < entries.length;
      return { files, total: entries.length, truncated, ...(truncated ? { nextCursor: String(offset + files.length) } : {}) };
    },
    async readFile(relative, options = {}) {
      await queue;
      const target = targetPath(root, relative); const mode = encoding(options.encoding);
      const offset = integer(options.offset, 0, 0, Number.MAX_SAFE_INTEGER, 'offset');
      const length = integer(options.maxBytes, OUTPUT_LIMIT, 1, 4 * OUTPUT_LIMIT, 'maxBytes');
      const handle = await fs.open(target, 'r');
      try {
        const info = await handle.stat();
        const buffer = Buffer.alloc(length);
        const result = await handle.read(buffer, 0, length, offset);
        const value = buffer.subarray(0, result.bytesRead);
        const truncated = info.isFile() ? offset + result.bytesRead < info.size : result.bytesRead === length;
        return { path: relative, absolutePath: target, content: value.toString(mode), encoding: mode, hash: digest(value), hashScope: offset === 0 && !truncated ? 'file' : 'returnedBytes', size: info.size, offset, returnedBytes: result.bytesRead, truncated, ...(truncated ? { nextOffset: offset + result.bytesRead } : {}) };
      } finally { await handle.close(); }
    },
    async listChanges() {
      await queue; const changes = [];
      for (const entry of await fs.readdir(snapshotRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
        try { changes.push(output(await load(entry.name))); }
        catch (error) { changes.push({ changeId: entry.name, status: 'unreadable', error: { code: error.code || 'READ_FAILED' } }); }
      }
      return changes.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    },
    propose(input) {
      return serialize(async () => {
        if (!input || !Array.isArray(input.files) || !input.files.length) fail('INVALID_INPUT', 'files must be a nonempty array');
        const now = new Date().toISOString();
        const meta = { formatVersion: 2, changeId: randomUUID(), status: 'preparing', reason: reason(input.reason, true), createdAt: now, updatedAt: now, files: [], checks: [] };
        await save(meta);
        try {
          for (const [index, item] of input.files.entries()) {
            if (!item || typeof item !== 'object') fail('INVALID_INPUT', 'Invalid file entry');
            const target = targetPath(root, item.path);
            const operation = item.operation === 'delete' ? 'delete' : 'write';
            const mode = encoding(item.encoding);
            const value = operation === 'write' ? contentBytes(item.content, mode) : null;
            const original = await snapshotOriginal(target, path.join(folder(meta.changeId), 'originals', String(index)), operation);
            const file = { index, path: item.path, absolutePath: target, operation, encoding: mode, ...original, appliedHash: value === null ? null : digest(value) };
            if (value !== null) { const candidate = artifact(meta, file, 'candidate'); await fs.mkdir(path.dirname(candidate), { recursive: true, mode: 0o700 }); await fs.writeFile(candidate, value, { mode: 0o600 }); }
            meta.files.push(file);
          }
          meta.status = 'ready'; meta.updatedAt = new Date().toISOString(); await save(meta); return output(meta);
        } catch (error) {
          meta.status = 'failed'; meta.error = { code: error.code || 'PREPARE_FAILED', message: 'Candidate record preparation failed' }; await save(meta); throw error;
        }
      });
    },
    apply(id) {
      return serialize(async () => {
        const meta = await load(id); meta.status = 'applying'; await save(meta);
        try {
          for (const file of meta.files) {
            const target = targetPath(root, file.path);
            if (file.operation === 'delete') await fs.unlink(target);
            else { const candidate = await fs.readFile(artifact(meta, file, 'candidate')); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, candidate); }
          }
          meta.status = 'applied'; meta.error = undefined; meta.updatedAt = new Date().toISOString(); await save(meta); return output(meta);
        } catch (error) {
          meta.status = 'failed'; meta.error = { code: error.code || 'APPLY_FAILED', message: 'File operation failed; completed operations were left in place' }; meta.updatedAt = new Date().toISOString(); await save(meta); throw error;
        }
      });
    },
    rollback(id) {
      return serialize(async () => {
        const meta = await load(id); meta.status = 'rollingBack'; await save(meta);
        try {
          for (const file of [...meta.files].reverse()) {
            const target = targetPath(root, file.path);
            const hadOriginal = indexed(meta) ? file.hasOriginal : file.originalHash !== null;
            if (hadOriginal === false) { await removeFile(target); continue; }
            if (indexed(meta) && file.originalKind === 'symlink') {
              await fs.mkdir(path.dirname(target), { recursive: true }); await removeFile(target); await fs.symlink(file.linkTarget, target);
              if ((file.operation || 'write') === 'write') {
                if (!file.hadReferent) await removeFile(file.followedPath);
                else if (file.originalSnapshot) await fs.writeFile(target, await fs.readFile(artifact(meta, file, 'originals')));
                else fail('BACKUP_UNAVAILABLE', 'Original referent could not be saved', 500);
              }
            } else {
              if (indexed(meta) && !file.originalSnapshot) fail('BACKUP_UNAVAILABLE', 'Original file could not be saved', 500);
              const original = await fs.readFile(artifact(meta, file, 'originals'));
              await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, original);
              if (file.originalMode !== undefined) await fs.chmod(target, file.originalMode);
            }
          }
          meta.status = 'rolledBack'; meta.error = undefined; meta.updatedAt = new Date().toISOString(); await save(meta); return output(meta);
        } catch (error) {
          meta.status = 'rollbackFailed'; meta.error = { code: error.code || 'ROLLBACK_FAILED', message: 'Manual rollback failed; completed operations were left in place' }; meta.updatedAt = new Date().toISOString(); await save(meta); throw error;
        }
      });
    },
    async writeFile(input) {
      if (!input || typeof input !== 'object') fail('INVALID_INPUT', 'Expected file write object');
      const target = targetPath(root, input.path); const value = contentBytes(input.content, input.encoding);
      const description = reason(input.reason) || 'Direct file write';
      let change;
      try { change = await api.propose({ reason: description, files: [{ path: input.path, content: input.content, encoding: input.encoding }] }); }
      catch (error) {
        await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, value);
        return { status: 'applied', checks: [], files: [{ path: input.path, absolutePath: target, operation: 'write' }], warnings: [{ code: 'SNAPSHOT_UNAVAILABLE', cause: error.code || 'RECORD_FAILED', message: 'File was written without a guaranteed rollback record' }] };
      }
      try { return await api.apply(change.changeId); }
      catch (error) {
        await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, value);
        return { status: 'applied', checks: [], files: [{ path: input.path, absolutePath: target, operation: 'write' }], warnings: [{ code: 'RECORD_UNAVAILABLE', cause: error.code || 'RECORD_FAILED', message: 'File was written; record completion could not be confirmed' }] };
      }
    },
    async deleteFile(input) {
      if (!input || typeof input !== 'object') fail('INVALID_INPUT', 'Expected file delete object');
      const target = targetPath(root, input.path); const description = reason(input.reason) || 'Direct file delete';
      let change;
      try { change = await api.propose({ reason: description, files: [{ path: input.path, operation: 'delete' }] }); }
      catch (error) {
        await fs.unlink(target);
        return { status: 'applied', checks: [], files: [{ path: input.path, absolutePath: target, operation: 'delete' }], warnings: [{ code: 'SNAPSHOT_UNAVAILABLE', cause: error.code || 'RECORD_FAILED', message: 'File was deleted without a guaranteed rollback record' }] };
      }
      try { return await api.apply(change.changeId); }
      catch (error) {
        // A record-save error can happen after unlink succeeded; preserve that successful deletion.
        if (await exists(target)) await fs.unlink(target);
        else if (error.code === 'ENOENT') throw error;
        return { status: 'applied', checks: [], files: [{ path: input.path, absolutePath: target, operation: 'delete' }], warnings: [{ code: 'RECORD_UNAVAILABLE', cause: error.code || 'RECORD_FAILED', message: 'File was deleted; record completion could not be confirmed' }] };
      }
    },
    async runCommand(input, { signal } = {}) {
      if (!input || typeof input.command !== 'string' || !input.command.trim() || input.command.includes('\0')) fail('INVALID_INPUT', 'command must be a nonempty shell command');
      const cwd = targetPath(root, input.cwd === undefined ? '.' : input.cwd);
      const timeoutMs = integer(input.timeoutMs, 60000, 1, 3600000, 'timeoutMs');
      if (signal?.aborted) return { exitCode: null, stdout: '', stderr: '', timedOut: false, cancelled: true, stdoutTruncated: false, stderrTruncated: false };
      const shell = commandShell(input.command);
      return new Promise((resolve, reject) => {
        const child = spawn(shell.command, shell.args, { cwd, env: process.env, shell: false, windowsVerbatimArguments: shell.windowsVerbatimArguments, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
        const streams = { stdout: [], stderr: [] }; const sizes = { stdout: 0, stderr: 0 }; const truncated = { stdout: false, stderr: false };
        for (const name of ['stdout', 'stderr']) child[name].on('data', (chunk) => { const room = OUTPUT_LIMIT - sizes[name]; if (chunk.length > room) truncated[name] = true; if (room > 0) { const value = chunk.subarray(0, room); streams[name].push(value); sizes[name] += value.length; } });
        let timedOut = false; let cancelled = false; let settled = false;
        const terminate = (timeout = false) => {
          if (settled || timedOut || cancelled) return;
          if (timeout) timedOut = true; else cancelled = true;
          void terminateOwned(child, { graceMs: 0 }).catch(error => {
            if (settled) return; settled = true; cleanup();
            child.stdout.destroy(); child.stderr.destroy(); reject(error);
          });
        };
        const cancel = () => terminate(false); activeCommands.add(cancel);
        signal?.addEventListener('abort', cancel, { once: true });
        const timer = setTimeout(() => terminate(true), timeoutMs);
        const cleanup = () => { clearTimeout(timer); activeCommands.delete(cancel); signal?.removeEventListener('abort', cancel); };
        child.on('error', (error) => { if (settled) return; settled = true; cleanup(); reject(error); });
        child.on('close', (exitCode) => { if (settled) return; settled = true; cleanup(); resolve({ exitCode, stdout: Buffer.concat(streams.stdout).toString('utf8'), stderr: Buffer.concat(streams.stderr).toString('utf8'), timedOut, cancelled, stdoutTruncated: truncated.stdout, stderrTruncated: truncated.stderr }); });
      });
    },
    cancelCommands() { for (const cancel of activeCommands) cancel(); },
  };
  // Startup deliberately does not interpret or restore old applying/failed snapshots.
  return api;
}
