import { createDrainGate } from '../../kernel/contracts/runtime-drain.mjs';
import http from 'node:http';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { createStore, safePath, WorkspaceError } from './store.mjs';
import { createAttachmentStore } from './attachments.mjs';
import { AttachmentError, ATTACHMENT_JSON_BYTES } from '../../contracts/attachments.mjs';

const defaultRoot = fileURLToPath(new URL('../../', import.meta.url));
async function createLogger(root) {
  const directory = await safePath(root, 'logs/workspace', true);
  const cleanup = async () => {
    const cutoff = Date.now() - 30 * 86400000;
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isFile() && /^workspace-\d{4}-\d{2}-\d{2}\.log$/.test(entry.name) && (await fs.stat(path.join(directory, entry.name))).mtimeMs < cutoff) await fs.unlink(path.join(directory, entry.name));
    }
  };
  await cleanup();
  let currentDay = '';
  return async (level, event, fields = {}) => {
    const now = new Date(); const day = now.toISOString().slice(0, 10);
    if (day !== currentDay) { await cleanup(); currentDay = day; }
    await fs.appendFile(await safePath(root, `logs/workspace/workspace-${day}.log`), `${JSON.stringify({ time: now.toISOString(), level, event, ...fields })}\n`, { mode: 0o600 });
  };
}
function authorized(header, token) {
  if (typeof header !== 'string') return false;
  const supplied = Buffer.from(header); const expected = Buffer.from(`Bearer ${token}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
async function body(request, limit = 5 * 1024 * 1024) {
  let size = 0; const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new WorkspaceError('PAYLOAD_TOO_LARGE', 'Request is too large', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new WorkspaceError('INVALID_JSON', 'Request must contain valid JSON'); }
}
const send = (response, status, data) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(data));
};
export async function createWorkspaceServer({ root = process.env.SEED_ROOT || defaultRoot, token } = {}) {
  root = await fs.realpath(root);
  token ??= (await fs.readFile(await safePath(root, 'local-secrets/runtime/service-token'), 'utf8')).trim();
  if (!token || token.length < 20) throw new Error('Local service token is missing or invalid');
  const store = await createStore(root); const attachments = await createAttachmentStore(root); const log = await createLogger(root);
  const drain = createDrainGate();
  const server = http.createServer(async (request, response) => {
    const requestId = randomUUID();
    let leave;
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { ready: true, service: 'workspace', version: '0.1.0' });
      if (!authorized(request.headers.authorization, token)) throw new WorkspaceError('UNAUTHORIZED', 'Internal service authentication required', 401);
      if (request.method === 'POST' && url.pathname === '/internal/runtime/prepare') return send(response, 200, drain.prepare());
      if (request.method === 'POST' && url.pathname === '/internal/runtime/release') return send(response, 200, drain.release());
      if (request.method !== 'GET') leave = drain.enter();
      if (request.method === 'POST' && url.pathname === '/attachments') return send(response, 201, await attachments.put(await body(request, ATTACHMENT_JSON_BYTES)));
      const attachmentRoute = url.pathname.match(/^\/attachments\/([^/]+)(?:\/(data|content))?$/);
      if (request.method === 'GET' && attachmentRoute) {
        const result = await attachments.get(attachmentRoute[1], { data: !!attachmentRoute[2] });
        if (attachmentRoute[2] !== 'content') return send(response, 200, result);
        const bytes = Buffer.from(result.data, 'base64'), attachment = result.attachment;
        response.writeHead(200, { 'Content-Type': attachment.kind === 'image' ? attachment.contentType : 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `${attachment.kind === 'image' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.name).replaceAll("'", '%27')}` });
        response.end(bytes); return;
      }
      const id = url.pathname.match(/^\/sessions\/([^/]+)$/)?.[1];
      const preferenceId = url.pathname.match(/^\/preferences\/([^/]+)$/)?.[1];
      if (request.method === 'GET' && url.pathname === '/sessions') return send(response, 200, { sessions: await store.listSessions() });
      if (request.method === 'POST' && url.pathname === '/sessions') return send(response, 201, { session: await store.createSession(await body(request)) });
      if (request.method === 'GET' && id) return send(response, 200, { session: await store.getSession(id) });
      if (request.method === 'PATCH' && id) return send(response, 200, { session: await store.patchSession(id, await body(request)) });
      if (request.method === 'GET' && url.pathname === '/preferences') return send(response, 200, { preferences: await store.listPreferences() });
      if (request.method === 'POST' && url.pathname === '/preferences') return send(response, 201, { preference: await store.createPreference(await body(request)) });
      if (request.method === 'DELETE' && preferenceId) return send(response, 200, await store.deletePreference(preferenceId));
      throw new WorkspaceError('NOT_FOUND', 'Endpoint does not exist', 404);
    } catch (error) {
      const known = error instanceof WorkspaceError || error instanceof AttachmentError || ['RUNTIME_BUSY', 'RUNTIME_RESTARTING'].includes(error.code);
      await log(known && error.status < 500 ? 'warn' : 'error', 'request_failed', { requestId, code: known ? error.code : 'INTERNAL_ERROR' }).catch(() => {});
      send(response, known ? error.status : 500, { error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'Workspace operation failed', requestId } });
    } finally { leave?.(); }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createWorkspaceServer();
  const port = Number(process.env.SEED_WORKSPACE_PORT || 4311);
  server.listen(port, '127.0.0.1', () => console.log(`workspace ready at http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
