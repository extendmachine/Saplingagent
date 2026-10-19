import net from 'node:net';

export const portKeys = ['frontPort', 'vitePort', 'agentPort', 'workspacePort', 'builderPort', 'pdfEditorPort', 'runtimeManagerPort', 'openCodePort'];
const exhausted = () => Object.assign(new Error('No available loopback port remains at or above the configured start.'), { code: 'PORT_UNAVAILABLE' });
const valid = port => Number.isInteger(port) && port >= 1024 && port <= 65535;

// Bind the real listener, so a competing startup cannot claim a probed port.
export async function listenAscending(server, start, excluded = new Set()) {
  if (!valid(start)) throw Object.assign(new Error('Invalid loopback port start.'), { code: 'INVALID_CONFIG' });
  for (let port = start; port <= 65535; port++) {
    if (excluded.has(port)) continue;
    const bound = await new Promise((resolve, reject) => {
      const cleanup = () => { server.off('error', onError); server.off('listening', onListen); };
      const onError = error => { cleanup(); if (['EADDRINUSE', 'EACCES'].includes(error.code)) resolve(false); else reject(error); };
      const onListen = () => { cleanup(); resolve(true); };
      server.once('error', onError); server.once('listening', onListen);
      server.listen(port, '127.0.0.1');
    });
    if (bound) return port;
  }
  throw exhausted();
}

export async function selectRuntimePorts(config, {fixed={}}={}) {
  const selected = {}, used = new Set(Object.values(fixed));
  for (const key of portKeys) {
    if(fixed[key]){selected[key]=fixed[key];continue;}
    const probe = net.createServer();
    try { selected[key] = await listenAscending(probe, config[key], used); used.add(selected[key]); }
    finally { if (probe.listening) await new Promise(resolve => probe.close(resolve)); }
  }
  return selected;
}
