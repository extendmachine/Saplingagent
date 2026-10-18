import http from 'node:http';
import { kernelControlPage } from '../../kernel/control-page.mjs';
import { createControlHandler, localAccess, send } from './server.mjs';

const recovery = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saplingagent runtime</title><style>body{font:16px system-ui;background:#fafbf7;color:#303b2c;max-width:620px;margin:12vh auto;padding:24px}button,a{display:inline-block;padding:12px;margin:8px 8px 0 0}pre{white-space:pre-wrap}button{cursor:pointer}</style><h1>Saplingagent runtime</h1><p>This control stays available while the app restarts its frontend, backend and project services. Keep this page open; successful full restart returns to the app.</p><pre id="status" role="status">Checking services…</pre><button id="all">Restart app</button><button id="backend">Restart backend only</button><a href="/">Open app</a><script>
const status=document.getElementById('status'), buttons=[document.getElementById('all'),document.getElementById('backend')];let pending=false,target=null;
async function update(){try{const r=await fetch('/api/runtime/status',{signal:AbortSignal.timeout(3000)});if(!r.ok)throw Error('Control unavailable');const s=await r.json();status.textContent=s.phase+(s.error?' — '+s.error.message:'')+'\\n'+s.services.map(x=>x.name+': '+(x.running?'running':'stopped')+(x.port?' · '+x.port:'')).join('\\n');buttons.forEach(b=>b.disabled=pending||!s.canRestart);if(target&&!s.busy&&s.phase==='ready'&&(s.instanceId!==target.instanceId||s.generation>target.generation)){target=null;location.replace('/')}if(s.phase==='failed'||s.error)target=null}catch{status.textContent='Control unavailable. Keep the launcher running and retry when the control reconnects.'}}
for(const b of buttons)b.onclick=async()=>{pending=true;target=null;buttons.forEach(x=>x.disabled=true);try{const r=await fetch('/api/runtime/restart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:b.id}),signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Restart request failed');const result=await r.json();if(b.id==='all')target={instanceId:result.status.instanceId,generation:result.status.generation}}catch(e){status.textContent=e.message}finally{pending=false;await update()}};update();setInterval(update,1000);
</script></html>`;
export function createGateway(options) {
  const { manager } = options;
  const control = createControlHandler(options);
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    try { localAccess(req, options); } catch (error) { return send(res, error.status, { error: { code: error.code, message: 'Local endpoint authentication failed.' } }); }
    const route = new URL(req.url, 'http://127.0.0.1').pathname;
    if (route === '/__saplingagent/kernel' && req.method === 'GET') { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"frame-ancestors 'self'"}); return res.end(kernelControlPage); }
    if (route.startsWith('/api/runtime/')) return void control(req, res);
    const page = () => { if (res.headersSent || res.destroyed) return; res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(recovery); };
    if (route === '/__saplingagent/runtime' && req.method === 'GET') return page();
    const mutation = !['GET', 'HEAD'].includes(req.method);
    if (mutation && (manager.operation || manager.maintenance)) return send(res, 503, { error: { code: 'RUNTIME_RESTARTING', message: 'Services are restarting. Please wait.' } });
    if (mutation) manager.gatewayWrites++;
    let done = false;
    const finish = () => { if (done) return; done = true; if (mutation) manager.gatewayWrites--; };
    const api = route.startsWith('/api/');
    const port = api ? manager.config.agentPort : manager.config.vitePort;
    const upstream = http.request({ hostname: '127.0.0.1', port, path: req.url, method: req.method, headers: req.headers }, response => {
      if (res.destroyed) { response.destroy(); finish(); return; }
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
      response.once('end', finish);
      response.once('error', () => { finish(); res.destroy(); });
    });
    upstream.once('error', () => { finish(); if (res.headersSent) return res.destroy(); if (!api && req.method === 'GET' && (req.headers.accept || '').includes('text/html')) return page(); send(res, 503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'App service is unavailable. Use the runtime control to restart.', control: '/__saplingagent/runtime' } }); });
    req.once('aborted', () => upstream.destroy());
    // Keep write accounting until the upstream operation completes, even if the browser disconnects.
    res.once('close', () => { if (!res.writableEnded && !mutation) upstream.destroy(); });
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
