import http from 'node:http';
import {readLanguage} from '../../localization/store.mjs';
import {normalizeLanguage} from '../../localization/public.mjs';
import {renderHelpPage} from '../../localization/help.mjs';
import { kernelControlPage } from '../../control-page.mjs';
import { createControlHandler, localAccess, send } from './server.mjs';

import { renderRuntimeStatusPage } from './status-page.mjs';

export function createGateway(options) {
  const { manager } = options;
  const control = createControlHandler(options);
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    try { localAccess(req, options); } catch (error) { return send(res, error.status, { error: { code: error.code, message: 'Local endpoint authentication failed.' } }); }
    const route = new URL(req.url, 'http://127.0.0.1').pathname;
    if (route === '/__saplingagent/help' && req.method === 'GET') {
      const requested = new URL(req.url,'http://127.0.0.1').searchParams.get('lang');
      return void readLanguage(manager.root,normalizeLanguage(req.headers['accept-language'])).then(saved=>{
        if (res.destroyed) return;
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"frame-ancestors 'self'"});
        res.end(renderHelpPage(requested ? normalizeLanguage(requested,saved) : saved));
      }).catch(()=>send(res,503,{error:{code:'HELP_UNAVAILABLE',message:'Open docs/language-help.html in this project folder.'}}));
    }
    if (route === '/__saplingagent/kernel' && req.method === 'GET') { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"frame-ancestors 'self'"}); return res.end(kernelControlPage); }
    if (route.startsWith('/api/runtime/')) return void control(req, res);
    const page = () => { if (res.headersSent || res.destroyed) return; res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "frame-ancestors 'self'" }); res.end(renderRuntimeStatusPage(manager)); };
    if (route === '/__saplingagent/runtime' && req.method === 'GET') return page();
    const mutation = !['GET', 'HEAD'].includes(req.method);
    if (mutation && (manager.operation || manager.maintenance)) return send(res, 503, { error: { code: 'RUNTIME_RESTARTING', message: 'Services are restarting. Please wait.' } });
    if (mutation) manager.gatewayWrites++;
    let done = false;
    const finish = () => { if (done) return; done = true; if (mutation) manager.gatewayWrites--; };
    const api = route.startsWith('/api/');
    const port = api ? manager.config.agentPort : manager.config.vitePort;
    let upstreamResponse;
    const upstream = http.request({ hostname: '127.0.0.1', port, path: req.url, method: req.method, headers: req.headers }, response => {
      upstreamResponse = response;
      response.once('end', finish);
      response.once('close', finish);
      const failed = () => { finish(); res.destroy(); };
      response.once('aborted', failed);
      response.once('error', failed);
      if (res.destroyed) { if (mutation) response.resume(); else response.destroy(); return; }
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    upstream.once('error', () => { finish(); if (res.destroyed) return; if (res.headersSent) return res.destroy(); if (!api && req.method === 'GET' && (req.headers.accept || '').includes('text/html')) return page(); send(res, 503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'App service is unavailable. Use the runtime control to restart.', control: '/__saplingagent/runtime' } }); });
    // An aborted upload can close the request before any response/error arrives.
    upstream.once('close', () => { if (!upstreamResponse) finish(); });
    req.once('aborted', () => upstream.destroy());
    // Keep write accounting until the upstream operation completes, even if the browser disconnects.
    res.once('close', () => {
      if (res.writableEnded) return;
      if (!mutation) return upstream.destroy();
      // pipe() stops consuming when its destination closes; drain to receive end.
      upstreamResponse?.unpipe(res);
      upstreamResponse?.resume();
    });
    req.pipe(upstream);
  });
  server.on('upgrade', (req, socket, head) => {
    try { localAccess(req, options); } catch { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    const proxy = http.request({ hostname: '127.0.0.1', port: manager.config.vitePort, path: req.url, headers: req.headers });
    proxy.once('upgrade', (response, upstream, initial) => {
      sockets.add(socket); sockets.add(upstream);
      socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n` + Object.entries(response.headers).map(([key,value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`).join('') + '\r\n');
      if (initial.length) socket.write(initial); if (head.length) upstream.write(head);
      upstream.pipe(socket); socket.pipe(upstream);
      const close = () => { sockets.delete(socket); sockets.delete(upstream); socket.destroy(); upstream.destroy(); };
      socket.once('error', close); upstream.once('error', close); socket.once('close', close); upstream.once('close', close);
    });
    proxy.once('response', response => { response.resume(); socket.destroy(); });
    proxy.once('error', () => socket.destroy()); socket.once('close', () => proxy.destroy()); proxy.end();
  });
  server.requestTimeout = 0; server.headersTimeout = 10000;
  server.closeUpgrades = () => { for (const socket of sockets) socket.destroy(); };
  return server;
}
