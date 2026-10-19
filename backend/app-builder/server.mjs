import { createDrainGate } from '../../kernel/contracts/runtime-drain.mjs';
import http from 'node:http';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { createBuilder, safePath, BuilderError } from './builder.mjs';
import { createPageBroker, PageError } from './page-broker.mjs';

const defaultRoot = fileURLToPath(new URL('../../', import.meta.url));
async function logger(root) {
  const directory = await safePath(root, 'logs/app-builder');
  await fs.mkdir(directory, { recursive: true }).catch(() => {});
  const cleanup = async () => {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      if (item.isFile() && /^app-builder-\d{4}-\d{2}-\d{2}\.log$/.test(item.name) && (await fs.stat(path.join(directory, item.name))).mtimeMs < Date.now() - 30 * 86400000) await fs.unlink(path.join(directory, item.name));
    }
  };
  await cleanup().catch(() => {}); let currentDay = '';
  return async (level, event, fields) => {
    const time = new Date().toISOString(); const day = time.slice(0, 10);
    if (day !== currentDay) { await cleanup(); currentDay = day; }
    await fs.appendFile(await safePath(root, `logs/app-builder/app-builder-${day}.log`), JSON.stringify({ time, level, event, ...fields }) + '\n', { mode: 0o600 });
  };
}
async function record(log, level, event, fields, result) {
  try { await log(level, event, fields); return result; }
  catch (error) { return { ...result, warnings: [...(result.warnings || []), { code: 'LOG_UNAVAILABLE', cause: error.code || 'LOG_WRITE_FAILED', message: 'Operation completed; metadata log could not be written' }] }; }
}
const authorized = (header, token) => {
  if (typeof header !== 'string') return false;
  const given = Buffer.from(header); const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
};
async function body(request) {
  let count = 0; const parts = [];
  for await (const part of request) {
    count += part.length; if (count > 64 * 1024 * 1024) throw new BuilderError('PAYLOAD_TOO_LARGE', 'Request exceeds the 64 MiB transport budget', 413);
    parts.push(part);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new BuilderError('INVALID_JSON', 'Request must contain valid JSON'); }
}
function send(response, status, data) {
  if (response.destroyed) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(data));
}
export async function createBuilderServer({ root = process.env.SEED_ROOT || defaultRoot, token, build } = {}) {
  root = await fs.realpath(root);
  token ??= (await fs.readFile(await safePath(root, 'local-secrets/runtime/service-token'), 'utf8')).trim();
  if (!token || token.length < 20) throw new Error('Local service token is missing or invalid');
  const builder = await createBuilder(root, build ? { build } : {}); const log = await logger(root); const pageBroker = createPageBroker();
  const drain = createDrainGate();
  const server = http.createServer(async (request, response) => {
    const requestId = randomUUID(); let leave;
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { ready: true, service: 'app-builder', version: '0.2.0', permissions: 'os-user-full-access' });
      if (!authorized(request.headers.authorization, token)) throw new BuilderError('UNAUTHORIZED', 'Internal service authentication required', 401);
      if (request.method === 'POST' && url.pathname === '/internal/runtime/prepare') return send(response, 200, drain.prepare());
      if (request.method === 'POST' && url.pathname === '/internal/runtime/release') return send(response, 200, drain.release());
      if (request.method !== 'GET') leave = drain.enter();
      if (request.method === 'POST' && url.pathname === '/page/heartbeat') return send(response, 200, pageBroker.heartbeat(await body(request)));
      if (request.method === 'POST' && url.pathname === '/page/results') return send(response, 200, pageBroker.complete(await body(request)));
      if (url.pathname === '/page/requests' && request.method === 'GET' || url.pathname === '/page/read' && request.method === 'POST') {
        const controller = new AbortController();
        const abort = () => { if (!response.writableEnded) controller.abort(); };
        response.once('close', abort); request.once('aborted', abort);
        try {
          const result = request.method === 'GET' ? await pageBroker.next(url.searchParams.get('pageId'), { signal: controller.signal }) : await pageBroker.read(await body(request), { signal: controller.signal });
          return send(response, 200, result);
        } finally { response.removeListener('close', abort); request.removeListener('aborted', abort); }
      }
      if (request.method === 'GET' && url.pathname === '/files') return send(response, 200, await builder.listFiles(url.searchParams.get('path') || '.', { limit: url.searchParams.get('limit'), cursor: url.searchParams.get('cursor') }));
      if (request.method === 'GET' && url.pathname === '/file') return send(response, 200, await builder.readFile(url.searchParams.get('path'), { encoding: url.searchParams.get('encoding') || 'utf8', offset: url.searchParams.get('offset'), maxBytes: url.searchParams.get('maxBytes') }));
      if (request.method === 'GET' && url.pathname === '/changes') return send(response, 200, { changes: await builder.listChanges() });
      if (request.method === 'POST' && url.pathname === '/changes') {
        const result = await builder.propose(await body(request));
        return send(response, 201, await record(log, 'info', 'candidate_recorded', { requestId, changeId: result.changeId, status: result.status }, result));
      }
      if (request.method === 'POST' && ['/files/write', '/files/delete'].includes(url.pathname)) {
        const input = await body(request);
        const result = url.pathname === '/files/write' ? await builder.writeFile(input) : await builder.deleteFile(input);
        return send(response, 200, await record(log, 'info', 'file_operation', { requestId, changeId: result.changeId, status: result.status }, result));
      }
      if (request.method === 'POST' && url.pathname === '/commands') {
        const controller = new AbortController();
        const abortRequest = () => controller.abort();
        const closeResponse = () => { if (!response.writableEnded) controller.abort(); };
        request.once('aborted', abortRequest); response.once('close', closeResponse);
        try {
          const result = await builder.runCommand(await body(request), { signal: controller.signal });
          return send(response, 200, await record(log, result.timedOut || result.cancelled ? 'warn' : 'info', 'command_completed', { requestId, exitCode: result.exitCode, timedOut: result.timedOut, cancelled: result.cancelled }, result));
        } finally { request.removeListener('aborted', abortRequest); response.removeListener('close', closeResponse); }
      }
      const action = url.pathname.match(/^\/changes\/([a-f0-9-]{36})\/(apply|rollback)$/);
      if (request.method === 'POST' && action) {
        const result = action[2] === 'apply' ? await builder.apply(action[1]) : await builder.rollback(action[1]);
        return send(response, 200, await record(log, 'info', 'change_updated', { requestId, changeId: result.changeId, status: result.status }, result));
      }
      throw new BuilderError('NOT_FOUND', 'Endpoint does not exist', 404);
    } catch (error) {
      const known = error instanceof BuilderError || error instanceof PageError || ['RUNTIME_BUSY', 'RUNTIME_RESTARTING'].includes(error.code);
      const filesystemStatus = ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : ['EACCES', 'EPERM', 'EROFS'].includes(error.code) ? 403 : ['EISDIR', 'EINVAL', 'ENAMETOOLONG', 'ERR_INVALID_ARG_VALUE', 'ERR_INVALID_ARG_TYPE'].includes(error.code) ? 400 : 500;
      const status = known ? error.status : filesystemStatus;
      const code = error.code || 'INTERNAL_ERROR';
      await log(status < 500 ? 'warn' : 'error', 'request_failed', { requestId, code }).catch(() => {});
      send(response, status, { error: { code, message: error.message || 'App builder operation failed', requestId } });
    } finally { leave?.(); }
  });
  server.requestTimeout = 150000; server.headersTimeout = 10000;
  const close = server.close.bind(server);
  server.close = (...args) => { pageBroker.close(); builder.cancelCommands(); return close(...args); };
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createBuilderServer(); const port = Number(process.env.SEED_BUILDER_PORT || 4312);
  server.listen(port, '127.0.0.1', () => console.log(`app-builder ready at http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
