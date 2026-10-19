import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const validThreadId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/i.test(id);
export const relocationError = (code, message) => Object.assign(new Error(message), { code });
const checkAbort = signal => {
  if (signal?.aborted) throw relocationError('CODEX_RESUME_CANCELLED', 'Conversation resume was cancelled.');
};

export function isMissingRolloutError(error, threadId) {
  if (!validThreadId(threadId)) return false;
  const match = /^failed to resolve rollout path `([^`]+)`: (?:file does not exist|No such file or directory(?: \(os error 2\))?)$/i.exec(error?.message || '');
  if (!match) return false;
  const oldPath = match[1].replaceAll('\\', '/');
  return /\/local-secrets\/codex\/(?:sessions|archived_sessions)\//.test(oldPath)
    && path.posix.basename(oldPath).startsWith('rollout-')
    && path.posix.basename(oldPath).endsWith(`-${threadId}.jsonl`);
}

// Read only the bounded first metadata record. Transcript bodies, credentials and
// SQLite databases are never read or rewritten by this recovery path.
async function verifyMetadata(file, threadId, signal) {
  checkAbort(signal);
  const before = await fs.lstat(file);
  if (!before.isFile() || before.isSymbolicLink()) throw relocationError('CODEX_ROLLOUT_INVALID', 'The relocated conversation is not a regular local file.');
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const current = await handle.stat();
    if (!current.isFile() || current.dev !== before.dev || current.ino !== before.ino) throw relocationError('CODEX_ROLLOUT_INVALID', 'The relocated conversation changed during inspection.');
    const bytes = Buffer.alloc(65537);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const newline = bytes.subarray(0, bytesRead).indexOf(10);
    const length = newline < 0 ? bytesRead : newline;
    if (length > 65536) throw relocationError('CODEX_ROLLOUT_INVALID', 'The relocated conversation metadata exceeds the supported limit.');
    let record;
    try { record = JSON.parse(bytes.toString('utf8', 0, length)); }
    catch { throw relocationError('CODEX_ROLLOUT_INVALID', 'The relocated conversation metadata could not be read.'); }
    if (record?.type !== 'session_meta' || record.payload?.id !== threadId) throw relocationError('CODEX_ROLLOUT_MISMATCH', 'The relocated conversation metadata does not match its saved identity.');
    checkAbort(signal);
  } finally { await handle.close(); }
}

export async function findRelocatedRollout(root, threadId, { signal, maxEntries = 20000 } = {}) {
  if (!validThreadId(threadId)) return null;
  checkAbort(signal);
  const realRoot = await fs.realpath(root);
  let current = realRoot;
  for (const part of ['local-secrets', 'codex']) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) return null;
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw relocationError('CODEX_ROLLOUT_INVALID', 'Conversation recovery needs the current project’s regular local Codex folder.');
  }
  const candidates = [];
  let visited = 0;
  const walk = async (directory, depth = 0) => {
    checkAbort(signal);
    const stat = await fs.lstat(directory).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) return;
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw relocationError('CODEX_ROLLOUT_INVALID', 'A conversation folder is not a regular local directory.');
    const entries = await fs.opendir(directory);
    for await (const entry of entries) {
      checkAbort(signal);
      if (++visited > maxEntries) throw relocationError('CODEX_ROLLOUT_SCAN_LIMIT', 'Conversation recovery reached its scan limit; inspect the saved conversation files before retrying.');
      const file = path.join(directory, entry.name);
      if (entry.name.startsWith('rollout-') && entry.name.endsWith(`-${threadId}.jsonl`)) candidates.push(file);
      else if (entry.isDirectory()) {
        if (depth >= 6) throw relocationError('CODEX_ROLLOUT_SCAN_LIMIT', 'Conversation recovery found an unexpectedly deep folder.');
        await walk(file, depth + 1);
      }
      if (candidates.length > 1) throw relocationError('CODEX_ROLLOUT_AMBIGUOUS', 'More than one saved rollout matches this conversation. No file was selected.');
    }
  };
  await walk(path.join(current, 'sessions'));
  await walk(path.join(current, 'archived_sessions'));
  if (!candidates.length) return null;
  const file = candidates[0];
  if (await fs.realpath(file) !== file) throw relocationError('CODEX_ROLLOUT_INVALID', 'The saved conversation path resolves outside its regular local location.');
  await verifyMetadata(file, threadId, signal);
  return file;
}
