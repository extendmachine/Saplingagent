import http from 'node:http';
import { readLanguage, writeLanguage } from '../../localization/store.mjs';
import { normalizeLanguage, supportedLanguages } from '../../localization/public.mjs';
import { kernelRequest } from '../../http.mjs';
import { timingSafeEqual } from 'node:crypto';
import { projectStatus, openProjectLogs } from './status.mjs';

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
async function instanceRequest(req, manager) {
  let bytes = 0; const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 1024) throw Object.assign(new Error('Request too large.'), { code: 'INVALID_REQUEST', status: 400 });
    chunks.push(chunk);
  }
  let input;
  try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}
  if (new URL(req.url, 'http://127.0.0.1').search || !input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.instanceId !== 'string') {
    throw Object.assign(new Error('Use only the observed runtime instance identifier.'), { code: 'INVALID_REQUEST', status: 400 });
  }
  if (input.instanceId !== manager.instanceId) throw Object.assign(new Error('The runtime changed. Reconnect before using its controls.'), { code: 'RUNTIME_INSTANCE_CHANGED', status: 409 });
}
export function createControlHandler(options) {
  const { manager } = options;
  let stopping = false;
  return async (req, res) => {
    try {
      localAccess(req, options);
      const route = new URL(req.url, 'http://127.0.0.1').pathname;
      if (route === '/api/runtime/language' && ['GET','POST'].includes(req.method)) {
        let language, holdingWrite = false;
        try {
          if (req.method === 'POST') {
            if (manager.operation || manager.maintenance || manager.closing || manager.closed) return send(res,409,{error:{code:'RUNTIME_BUSY',message:'Wait for the current runtime operation before changing language.'}});
            // Hold the existing drain counter through body reading and atomic persistence.
            manager.gatewayWrites = (manager.gatewayWrites || 0) + 1; holdingWrite = true;
            let bytes = 0; const chunks = [];
            for await (const chunk of req) {
              bytes += chunk.length;
              if (bytes > 256) return send(res,400,{error:{code:'INVALID_LANGUAGE',message:'Choose en or zh.'}});
              chunks.push(chunk);
            }
            let input; try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}
            if (!input || Array.isArray(input) || Object.keys(input).length !== 1 || !supportedLanguages.includes(input.language))
              return send(res,400,{error:{code:'INVALID_LANGUAGE',message:'Choose en or zh.'}});
            language = await writeLanguage(manager.root,input.language);
          } else language = await readLanguage(manager.root,normalizeLanguage(req.headers['accept-language']));
          return send(res,200,{language,supported:supportedLanguages});
        } catch (error) { return send(res,error.status || 503,{error:{code:error.status ? error.code : 'LANGUAGE_SAVE_FAILED',message:'The project language preference could not be read or saved. Check folder access, wait for configuration to finish and retry.'}}); }
        finally { if (holdingWrite) manager.gatewayWrites--; }
      }
      if (await kernelRequest(req,res,options,route,send)) return;
      if (req.method === 'GET' && route === '/health') return send(res, 200, { ready: true, service: 'runtime-manager' });
      if (req.method === 'GET' && route === '/api/runtime/status') return send(res, 200, await projectStatus(manager));
      if (req.method === 'POST' && route === '/api/runtime/open-logs') {
        await instanceRequest(req, manager);
        return send(res, 200, await (options.openLogs || openProjectLogs)(manager.root));
      }
      if (req.method === 'POST' && route === '/api/runtime/stop-and-wait') {
        await instanceRequest(req, manager);
        if (!options.onMaintenance) return send(res, 503, { error: { code: 'STOP_UNAVAILABLE', message: 'Stop this legacy runtime from its launcher.' } });
        if (stopping || manager.closing) return send(res, 409, { error: { code: 'RUNTIME_BUSY', message: 'A stop operation is already in progress.' } });
        stopping = true;
        try {
          if (!manager.closed) await manager.prepareMaintenance();
          await manager.close();
          if (manager.state().services.some(service => service.running)) throw Object.assign(new Error('Owned services have not stopped.'), { code: 'SERVICE_STOP_FAILED' });
          let scheduled = false;
          const finish = () => {
            if (scheduled) return; scheduled = true;
            setImmediate(() => Promise.resolve().then(() => options.onMaintenance()).catch(() => manager.log('shutdown_callback_failed')));
          };
          res.once('finish', finish); res.once('close', finish);
          if (res.destroyed) finish();
          send(res, 200, { stopped: true, instanceId: manager.instanceId });
        } finally { stopping = false; }
        return;
      }
      if (req.method === 'POST' && route === '/api/runtime/stop') {
        if(!options.onMaintenance)return send(res,503,{error:{code:'STOP_UNAVAILABLE',message:'Stop this legacy runtime from its launcher.'}});
        // Failed close has already drained and closed the mutation gate. Retry its
        // owned children before the owner callback can close the recovery listeners.
        if (manager.closed) await manager.close();
        else await manager.prepareMaintenance();
        send(res,202,{stopping:true});setTimeout(()=>void options.onMaintenance(),30);return;
      }
      if (req.method === 'POST' && route === '/api/runtime/restart') {
        let bytes = 0; const chunks = [];
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 1024) return send(res, 413, { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Restart request is too large.' } }); chunks.push(chunk); }
        let input;
        try { input = bytes ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { return send(res, 400, { error: { code: 'INVALID_SCOPE', message: 'Use scope all or backend.' } }); }
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['scope', 'instanceId'].includes(key)) || input.scope !== undefined && !['all', 'backend'].includes(input.scope) || input.instanceId !== undefined && typeof input.instanceId !== 'string') return send(res, 400, { error: { code: 'INVALID_SCOPE', message: 'Use scope all or backend and, optionally, the observed instanceId.' } });
        if (input.instanceId !== undefined && input.instanceId !== manager.instanceId) return send(res, 409, { error: { code: 'RUNTIME_INSTANCE_CHANGED', message: 'The runtime changed. Reconnect before using its controls.' } });
        return send(res, 202, { jobId: manager.restart({ scope: input.scope || 'all' }), status: manager.state() });
      }
      send(res, 404, { error: { code: 'NOT_FOUND', message: 'Endpoint does not exist.' } });
    } catch (error) {
      const messages = {
        INVALID_REQUEST: 'Use only the observed runtime instance identifier.',
        RUNTIME_INSTANCE_CHANGED: 'The runtime changed. Reconnect before using its controls.',
        KERNEL_BUSY: 'Wait for startup, restart or active work to finish before stopping.',
        RUNTIME_BUSY: 'A task or file operation is still running. Finish it before stopping.',
        SERVICE_STOP_FAILED: 'An owned service could not stop. Retry Stop app or inspect local logs.',
        LOGS_UNAVAILABLE: 'The project logs folder could not be opened. Inspect logs in this project folder.'
      };
      send(res, error.status || 503, { error: { code: error.code || 'MANAGER_UNAVAILABLE', message: messages[error.code] || (error.status ? 'Local endpoint authentication failed.' : 'Runtime manager could not accept the operation.') } });
    }
  };
}
export function createManagerServer(options) {
  const server = http.createServer(createControlHandler(options));
  server.requestTimeout = 5000; server.headersTimeout = 5000;
  return server;
}
