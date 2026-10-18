import http from 'node:http';
import { kernelRequest } from '../../kernel/http.mjs';
import { timingSafeEqual } from 'node:crypto';

export function localAccess(req, { token, frontPort, managerPort }) {
  const hosts = [`127.0.0.1:${frontPort}`, `localhost:${frontPort}`, `127.0.0.1:${managerPort}`, `localhost:${managerPort}`];
  const origins = [`http://127.0.0.1:${frontPort}`, `http://localhost:${frontPort}`];
  const fail = (code, status) => { throw Object.assign(new Error(code), { code, status }); };
  if (!hosts.includes(req.headers.host)) fail('INVALID_HOST', 403);
  if (req.headers['sec-fetch-site'] === 'cross-site' || req.headers.origin && !origins.includes(req.headers.origin)) fail('INVALID_ORIGIN', 403);
  if (req.method !== 'GET' && !origins.includes(req.headers.origin) && req.headers['sec-fetch-site'] !== 'same-origin') {
    const given = Buffer.from(req.headers.authorization || ''), expected = Buffer.from(`Bearer ${token}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) fail('UNAUTHORIZED', 401);
  }
}
export const send = (res, status, value) => {
  if (res.destroyed || res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value));
};
export function createControlHandler(options) {
  const { manager } = options;
  return async (req, res) => {
    try {
      localAccess(req, options);
      const route = new URL(req.url, 'http://127.0.0.1').pathname;
      if (await kernelRequest(req,res,options,route,send)) return;
      if (req.method === 'GET' && route === '/health') return send(res, 200, { ready: true, service: 'runtime-manager' });
      if (req.method === 'GET' && route === '/api/runtime/status') return send(res, 200, manager.state());
      if (req.method === 'POST' && route === '/api/runtime/restart') {
        let bytes = 0; const chunks = [];
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 1024) return send(res, 413, { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Restart request is too large.' } }); chunks.push(chunk); }
        let input;
        try { input = bytes ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { return send(res, 400, { error: { code: 'INVALID_SCOPE', message: 'Use scope all or backend.' } }); }
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'scope') || input.scope !== undefined && !['all', 'backend'].includes(input.scope)) return send(res, 400, { error: { code: 'INVALID_SCOPE', message: 'Use scope all or backend.' } });
        return send(res, 202, { jobId: manager.restart({ scope: input.scope || 'all' }), status: manager.state() });
      }
      send(res, 404, { error: { code: 'NOT_FOUND', message: 'Endpoint does not exist.' } });
    } catch (error) { send(res, error.status || 503, { error: { code: error.code || 'MANAGER_UNAVAILABLE', message: error.status ? 'Local endpoint authentication failed.' : 'Runtime manager could not accept the operation.' } }); }
  };
}
export function createManagerServer(options) {
  const server = http.createServer(createControlHandler(options));
  server.requestTimeout = 5000; server.headersTimeout = 5000;
  return server;
}
