// Native tools use the conventional credential and ledger paths. A private
// before-image journal lets project readers see one committed configuration.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureManagedDirectory } from './local-storage.mjs';

export const connectionsFile = 'ai-config/connections.json';
export const ledgerFile = 'notes/project-secrets.json';
export const codexAuthFile = 'codex/auth.json';
const journalFile = 'ai-config/configuration-journal.json';
const location = (root, name) => path.join(root, 'local-secrets', name);
const managed = name => typeof name === 'string' && ([connectionsFile, ledgerFile, codexAuthFile].includes(name) || /^api-keys\/ai-[a-z0-9-]{1,80}\.json$/.test(name));
const invalid = () => Object.assign(Error('Preserve and repair the local configuration journal before continuing.'), {code:'CONFIG_STORAGE_ERROR', status:500});
const serialize = value => JSON.stringify(value, null, 2) + '\n';

async function readBytes(file) {
  try {
    if (!(await fs.lstat(file)).isFile()) throw invalid();
    return await fs.readFile(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function journal(root) {
  const bytes = await readBytes(location(root, journalFile));
  if (bytes === null) return {id:null};
  let value;
  try { value = JSON.parse(bytes); } catch { throw invalid(); }
  const validEntry = entry => Array.isArray(entry) && entry.length === 2 && managed(entry[0])
    && (entry[1] === null || typeof entry[1] === 'string' && Buffer.from(entry[1], 'base64').toString('base64') === entry[1]);
  if (value?.schemaVersion !== 1 || typeof value.id !== 'string' ||
      value.before !== undefined && (!Array.isArray(value.before) || !value.before.length || !value.before.every(validEntry))) throw invalid();
  return value;
}

export async function configurationWritePending(root) {
  return Boolean((await journal(root)).before);
}

// Verify the generation even when an entire write/rollback completes between
// two reads. Interrupted transactions serve exact old bytes from the journal.
export async function withConfigurationSnapshot(root, query) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const start = await journal(root);
    const before = new Map(start.before);
    const readFile = async name => {
      if (!managed(name)) throw invalid();
      if (before.has(name)) {
        const bytes = before.get(name);
        return bytes === null ? null : Buffer.from(bytes, 'base64').toString('utf8');
      }
      return (await readBytes(location(root, name)))?.toString('utf8') ?? null;
    };
    let result, error;
    try { result = await query(readFile); } catch (issue) { error = issue; }
    if (start.id !== (await journal(root)).id) continue;
    if (error) throw error;
    return result;
  }
  throw Object.assign(Error('Configuration is changing. Retry after the save finishes.'), {code:'CONFIG_BUSY', status:409});
}

export function readConfigurationFiles(root, names) {
  return withConfigurationSnapshot(root, readFile => Promise.all(names.map(readFile)));
}

async function syncDirectory(directory) {
  if (process.platform === 'win32') return; // Windows does not expose directory handles for fsync.
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function replace(root, name, bytes) {
  const directory = await ensureManagedDirectory(root, 'local-secrets/' + path.posix.dirname(name));
  const file = location(root, name);
  const stat = await fs.lstat(file).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (stat && !stat.isFile()) throw invalid();
  if (bytes === null) {
    if (stat) { await fs.unlink(file); await syncDirectory(directory); }
    return;
  }
  const stage = file + '.' + randomUUID() + '.tmp';
  const handle = await fs.open(stage, 'wx', 0o600);
  try {
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(stage, file);
    await syncDirectory(directory);
  } finally { await fs.rm(stage, {force:true}); }
}

const settle = (root, id = randomUUID()) => replace(root, journalFile, serialize({schemaVersion:1, id}));

// Only the holder of the common configuration writer lease may repair files.
// An uncommitted native auth replacement can therefore be undone before login.
export async function recoverConfigurationWrite(root) {
  const pending = await journal(root);
  if (!pending.before) return;
  for (const [name, original] of pending.before) {
    const current = await readBytes(location(root, name));
    if ((current?.toString('base64') ?? null) !== original) {
      await replace(root, name, original === null ? null : Buffer.from(original, 'base64'));
    }
  }
  await settle(root);
}

export async function publishConfigurationFiles(root, changes) {
  const next = [...changes];
  if (!next.length || !next.every(([name]) => managed(name))) throw invalid();
  const before = [];
  for (const [name] of next) {
    const original = await readBytes(location(root, name));
    before.push([name, original?.toString('base64') ?? null]);
  }
  const committed = randomUUID();
  await replace(root, journalFile, serialize({schemaVersion:1, id:randomUUID(), before}));
  try {
    for (const [name, value] of next) await replace(root, name, serialize(value));
    await settle(root, committed);
  } catch (error) {
    // A directory sync can fail after the commit marker was already renamed.
    if ((await journal(root)).id === committed) return;
    await recoverConfigurationWrite(root);
    throw error;
  }
}
