import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { attachmentIds, attachmentSummary } from '../../contracts/attachments.mjs';

export class WorkspaceError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = (message) => { throw new WorkspaceError('INVALID_INPUT', message); };
const text = (value, name, limit, blank = false) => {
  if (typeof value !== 'string' || value.length > limit || (!blank && !value.trim())) fail(`${name} must be a valid string`);
  return value;
};
const validId = (id) => {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) fail('Invalid identifier');
  return id;
};
const engine = (value) => {
  if (!['codex', 'opencode', 'claude'].includes(value)) fail('engine must be codex, opencode or claude');
  return value;
};
const providerId = (value) => value === null ? null : text(value, 'providerId', 160);
const modelId = (value) => value === null ? null : text(value, 'modelId', 240);
const tokenCount = (value, name, minimum = 0) => {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${name} must be a safe integer of at least ${minimum}`);
  return value;
};
const contextUsage = (value) => {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('contextUsage must be an object or null');
  const result = {
    usedTokens: tokenCount(value.usedTokens, 'contextUsage.usedTokens'),
    contextWindow: tokenCount(value.contextWindow, 'contextUsage.contextWindow', 1),
    updatedAt: text(value.updatedAt, 'contextUsage.updatedAt', 80),
  };
  if (!Number.isFinite(Date.parse(result.updatedAt))) fail('contextUsage.updatedAt must be a valid timestamp');
  return result;
};
const normalizeSession = (session) => ({
  ...session,
  engine: session.engine === undefined ? 'codex' : engine(session.engine),
  providerId: session.providerId === undefined ? null : providerId(session.providerId),
  modelId: session.modelId === undefined ? null : modelId(session.modelId),
});
export async function safePath(root, relative, directory = false) {
  const pieces = relative.split('/');
  let current = root;
  for (let i = 0; i < pieces.length; i++) {
    if (!pieces[i] || pieces[i] === '.' || pieces[i] === '..') fail('Invalid storage path');
    current = path.join(current, pieces[i]);
    const isDir = i < pieces.length - 1 || directory;
    let info;
    try { info = await fs.lstat(current); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (isDir) { await fs.mkdir(current, { mode: 0o700 }); info = await fs.lstat(current); }
    }
    if (info?.isSymbolicLink() || (isDir && info && !info.isDirectory()) || (!isDir && info && !info.isFile())) {
      throw new WorkspaceError('UNSAFE_STORAGE', 'Storage contains an unsupported path', 409);
    }
  }
  return current;
}
async function readJson(root, relative, fallback) {
  const file = await safePath(root, relative);
  let handle;
  try {
    handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    if ((await handle.stat()).size > 8 * 1024 * 1024) throw new WorkspaceError('CORRUPT_STORAGE', 'Stored JSON exceeds supported size', 500);
    return JSON.parse(await handle.readFile('utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    if (error instanceof SyntaxError) throw new WorkspaceError('CORRUPT_STORAGE', 'Stored JSON requires recovery', 500);
    throw error;
  } finally { await handle?.close(); }
}
async function atomicJson(root, relative, data) {
  const file = await safePath(root, relative);
  const temporary = `${file}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`);
    await handle.sync();
    await handle.close(); handle = null;
    await safePath(root, relative);
    await fs.rename(temporary, file);
  } finally { await handle?.close(); await fs.rm(temporary, { force: true }); }
}
function messages(value) {
  if (!Array.isArray(value) || value.length > 10000) fail('messages must be an array of at most 10000 items');
  const ids = new Set();
  const result = value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('Invalid message');
    const id = validId(item.id);
    if (ids.has(id)) fail('Duplicate message id'); ids.add(id);
    if (!['user', 'assistant', 'system', 'tool'].includes(item.role)) fail('Invalid message role');
    const output = { id, role: item.role, text: text(item.text, 'message.text', 500000, true) };
    if (item.status !== undefined) output.status = text(item.status, 'message.status', 40);
    if (item.requestId !== undefined) output.requestId = text(item.requestId, 'message.requestId', 160);
    if (item.attachments !== undefined) {
      try { attachmentIds(item.attachments.map(value => value.id)); output.attachments = item.attachments.map(attachmentSummary); }
      catch (error) { fail(error.message); }
    }
    return output;
  });
  if (Buffer.byteLength(JSON.stringify(result)) > 4 * 1024 * 1024) fail('Session messages exceed 4 MiB');
  return result;
}
export async function createStore(applicationRoot) {
  const root = await fs.realpath(applicationRoot);
  await safePath(root, 'data/workspace/sessions', true);
  let queue = Promise.resolve();
  const serialize = (operation) => {
    const current = queue.then(operation);
    queue = current.catch(() => {});
    return current;
  };
  const get = async (id) => {
    const session = await readJson(root, `data/workspace/sessions/${validId(id)}.json`, null);
    if (!session) throw new WorkspaceError('NOT_FOUND', 'Session does not exist', 404);
    if (typeof session !== 'object' || Array.isArray(session) || session.id !== id || typeof session.title !== 'string' || !Array.isArray(session.messages) || !Number.isInteger(session.revision) || session.revision < 1 || typeof session.createdAt !== 'string' || typeof session.updatedAt !== 'string') throw new WorkspaceError('CORRUPT_STORAGE', 'Stored session schema requires recovery', 500);
    return normalizeSession(session);
  };
  return {
    async listSessions() {
      await queue;
      const directory = await safePath(root, 'data/workspace/sessions', true);
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const sessions = [];
      for (const entry of entries) {
        if (!entry.name.endsWith('.json')) continue;
        if (entry.isSymbolicLink() || !entry.isFile()) throw new WorkspaceError('UNSAFE_STORAGE', 'Session storage contains an unsupported file', 409);
        const session = await get(entry.name.slice(0, -5));
        sessions.push({ id: session.id, title: session.title, updatedAt: session.updatedAt, engine: session.engine, providerId: session.providerId, modelId: session.modelId });
      }
      return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    getSession: async (id) => { await queue; return get(id); },
    createSession(input = {}) {
      return serialize(async () => {
        if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid session input');
        const now = new Date().toISOString();
        const selectedEngine = input.engine === undefined ? 'codex' : engine(input.engine);
        const session = { id: randomUUID(), title: input.title === undefined ? 'New conversation' : text(input.title, 'title', 200), engine: selectedEngine, providerId: input.providerId === undefined ? null : providerId(input.providerId), modelId: input.modelId === undefined ? null : modelId(input.modelId), threadId: null, messages: [], running: false, activeRequestId: null, createdAt: now, updatedAt: now, revision: 1 };
        if (selectedEngine === 'codex' && (session.providerId !== null || session.modelId !== null)) fail('Codex sessions do not accept providerId or modelId');
        if (selectedEngine !== 'codex' && (!session.providerId || !session.modelId)) fail('API agent sessions require providerId and modelId');
        await atomicJson(root, `data/workspace/sessions/${session.id}.json`, session);
        return session;
      });
    },
    patchSession(id, input) {
      return serialize(async () => {
        if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid session patch');
        const session = await get(id);
        if (input.expectedRevision !== undefined && input.expectedRevision !== session.revision) throw new WorkspaceError('CONFLICT', 'Session revision has changed', 409);
        if (input.threadId !== undefined) session.threadId = input.threadId === null ? null : text(input.threadId, 'threadId', 300);
        if (input.engine !== undefined && engine(input.engine) !== session.engine) fail('A session engine cannot be changed');
        if (input.providerId !== undefined && providerId(input.providerId) !== session.providerId) fail('A session provider cannot be changed');
        if (input.modelId !== undefined && modelId(input.modelId) !== session.modelId) fail('A session model cannot be changed');
        if (input.title !== undefined) session.title = text(input.title, 'title', 200);
        if (input.messages !== undefined) session.messages = messages(input.messages);
        if (input.running !== undefined) {
          if (typeof input.running !== 'boolean') fail('running must be boolean');
          session.running = input.running;
        }
        if (input.activeRequestId !== undefined) session.activeRequestId = input.activeRequestId === null ? null : text(input.activeRequestId, 'activeRequestId', 160);
        if (input.contextUsage !== undefined) session.contextUsage = contextUsage(input.contextUsage);
        if (input.requests !== undefined) {
          if (!Array.isArray(input.requests) || input.requests.length > 500) fail('requests must contain at most 500 items');
          const requestIds = new Set();
          session.requests = input.requests.map((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) fail('Invalid request ledger item');
            const requestId = text(item.id, 'request.id', 160);
            if (requestIds.has(requestId)) fail('Duplicate request id'); requestIds.add(requestId);
            if (!['inProgress', 'completed', 'failed', 'interrupted'].includes(item.status)) fail('Invalid request status');
            const startedAt = text(item.startedAt, 'request.startedAt', 80);
            if (!Number.isFinite(Date.parse(startedAt))) fail('Invalid request timestamp');
            const entry = { id: requestId, status: item.status, startedAt };
            if (item.completedAt !== undefined) {
              entry.completedAt = text(item.completedAt, 'request.completedAt', 80);
              if (!Number.isFinite(Date.parse(entry.completedAt))) fail('Invalid completion timestamp');
            }
            if (item.error !== undefined) entry.error = text(item.error, 'request.error', 1000, true);
            return entry;
          });
        }
        session.updatedAt = new Date().toISOString(); session.revision++;
        await atomicJson(root, `data/workspace/sessions/${validId(id)}.json`, session);
        return session;
      });
    },
    async listPreferences() {
      await queue; return readJson(root, 'data/workspace/preferences.json', []);
    },
    createPreference(input) {
      return serialize(async () => {
        if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid preference');
        const key = text(input.key, 'key', 256);
        const evidence = text(input.evidence, 'evidence', 8192);
        const encoded = JSON.stringify(input.value);
        if (encoded === undefined || Buffer.byteLength(encoded) > 65536) fail('value must be JSON no larger than 64 KiB');
        const items = await readJson(root, 'data/workspace/preferences.json', []);
        if (!Array.isArray(items)) throw new WorkspaceError('CORRUPT_STORAGE', 'Stored preferences require recovery', 500);
        if (items.length >= 5000) fail('Too many saved preferences');
        const preference = { id: randomUUID(), key, value: JSON.parse(encoded), evidence, createdAt: new Date().toISOString() };
        items.push(preference);
        if (Buffer.byteLength(JSON.stringify(items)) > 4 * 1024 * 1024) fail('Preferences exceed the 4 MiB storage limit');
        await atomicJson(root, 'data/workspace/preferences.json', items);
        return preference;
      });
    },
    deletePreference(id) {
      return serialize(async () => {
        validId(id);
        const items = await readJson(root, 'data/workspace/preferences.json', []);
        if (!Array.isArray(items)) throw new WorkspaceError('CORRUPT_STORAGE', 'Stored preferences require recovery', 500);
        if (!items.some((item) => item.id === id)) throw new WorkspaceError('NOT_FOUND', 'Preference does not exist', 404);
        await atomicJson(root, 'data/workspace/preferences.json', items.filter((item) => item.id !== id));
        return { ok: true };
      });
    },
  };
}
