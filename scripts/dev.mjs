import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { root, setup } from './setup.mjs';

await setup();
const config = JSON.parse(await fs.readFile(path.join(root, 'config/runtime.json'), 'utf8'));
const children = []; let stopping = false;
const frontLogDir = path.join(root, 'logs/front');
await fs.mkdir(frontLogDir, { recursive: true });
for (const name of await fs.readdir(frontLogDir)) if (/^front-\d{4}-\d{2}-\d{2}\.log$/.test(name) && (await fs.stat(path.join(frontLogDir, name))).mtimeMs < Date.now() - 30 * 86400000) await fs.unlink(path.join(frontLogDir, name));
function frontLog(event, fields = {}) {
  const now = new Date().toISOString();
  // Persist lifecycle metadata only; source diagnostics remain in the terminal.
  return fs.appendFile(path.join(frontLogDir, `front-${now.slice(0, 10)}.log`), JSON.stringify({ time: now, event, ...fields }) + '\n', { mode: 0o600 });
}
async function freePort(port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer(); probe.once('error', () => reject(new Error(`Port ${port} is occupied. Stop the existing project process before starting.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
async function stop(code = 0) {
  if (stopping) return; stopping = true;
  await frontLog('stop', { code }).catch(() => {});
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  await Promise.race([Promise.all(children.map(child => new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); }))), new Promise(resolve => setTimeout(resolve, 4000))]);
  for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
  process.exit(code);
}
function run(file, label, extra = []) {
  const child = spawn(process.execPath, [path.join(root, file), ...extra], { cwd: root, env: { ...process.env, SEED_ROOT: root, SEED_AGENT_PORT: String(config.agentPort), SEED_WORKSPACE_PORT: String(config.workspacePort), SEED_BUILDER_PORT: String(config.builderPort) }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  if (label === 'front') void frontLog('start', { port: config.frontPort }).catch(() => console.error('front lifecycle log could not be saved'));
  child.stdout.on('data', chunk => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on('data', chunk => process.stderr.write(`[${label}] ${chunk}`));
  child.once('error', () => { if (label === 'front') void frontLog('error').catch(() => {}); console.error(`${label} could not start`); void stop(1); });
  child.once('exit', (code, signal) => { if (label === 'front') void frontLog('exit', { code, signal }).catch(() => {}); if (!stopping) { console.error(`${label} stopped (${code})`); void stop(1); } });
}
async function waitHealth(port) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    try { const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) }); if (res.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Service ${port} did not start`);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void stop());
try {
  for (const port of [config.workspacePort, config.builderPort, config.agentPort, config.frontPort]) await freePort(port);
  await fs.access(path.join(root, 'front/node_modules/vite/bin/vite.js'));
  await fs.access(path.join(root, 'backend/mcp-runtime/node_modules/@modelcontextprotocol/sdk/package.json'));
  run('backend/workspace/server.mjs', 'workspace'); await waitHealth(config.workspacePort);
  run('backend/app-builder/server.mjs', 'builder'); await waitHealth(config.builderPort);
  run('backend/agent-runtime/server.mjs', 'agent'); await waitHealth(config.agentPort);
  run('front/node_modules/vite/bin/vite.js', 'front', [path.join(root, 'front'), '--host', '127.0.0.1', '--port', String(config.frontPort), '--strictPort']);
  console.log(`SeedAgent: http://127.0.0.1:${config.frontPort}/ (Agent initialization continues in background)`);
} catch (error) { console.error(error.message); await stop(1); }
