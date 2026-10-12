import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { terminateOwned } from '../../contracts/local-process.mjs';
import { randomUUID } from 'node:crypto';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const failure = (code, message, service) => Object.assign(new Error(message), { code, service });
const alive = child => child && child.exitCode === null && child.signalCode === null && !child.spawnFailed;
export async function availablePort(port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(failure('PORT_OCCUPIED', `Port ${port} is occupied. Stop its existing service first.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
export class RuntimeManager {
  constructor({ root, token, definitions, frontDefinition, healthTimeout = 20000, agentTimeout = 120000, stopTimeout = 4000, output = true }) {
    Object.assign(this, { root, token, definitions, frontDefinition, healthTimeout, agentTimeout, stopTimeout, output });
    this.instanceId = randomUUID(); this.generation = 0; this.phase = 'starting'; this.children = new Map();
    this.intentional = new Set(); this.error = null; this.operation = null; this.closed = false;
    this.gatewayWrites = 0; this.activeDefinitions = definitions;
    this.controlAbort = new AbortController();
  }
  state() {
    return { instanceId: this.instanceId, generation: this.generation, phase: this.phase, busy: !!this.operation, canRestart: !this.operation && !this.closed, jobId: this.jobId || null, scope: this.scope || 'all', error: this.error,
      services: [...this.children].map(([name, child]) => ({ name, pid: child.pid || null, running: !!alive(child) })) };
  }
  async log(event, fields = {}) {
    try {
      const directory = path.join(this.root, 'logs/runtime-manager'); await fs.mkdir(directory, { recursive: true });
      const day = new Date().toISOString().slice(0, 10);
      if (day !== this.logDay) {
        this.logDay = day;
        for (const file of await fs.readdir(directory)) if (/^runtime-manager-\d{4}-\d{2}-\d{2}\.log$/.test(file) && (await fs.stat(path.join(directory, file))).mtimeMs < Date.now() - 30 * 86400000) await fs.unlink(path.join(directory, file));
      }
      await fs.appendFile(path.join(directory, `runtime-manager-${day}.log`), JSON.stringify({ time: new Date().toISOString(), event, ...fields }) + '\n', { mode: 0o600 });
    } catch { /* Metadata logging must not prevent lifecycle operations. */ }
  }
  launch(definition, config) {
    if (this.closed) throw failure('MANAGER_STOPPED', 'Runtime manager is stopping.');
    const env = { ...process.env, SEED_ROOT: this.root, SEED_RUNTIME_MANAGER_PORT: String(config.runtimeManagerPort), SEED_AGENT_PORT: String(config.agentPort), SEED_WORKSPACE_PORT: String(config.workspacePort), SEED_BUILDER_PORT: String(config.builderPort), SEED_PDF_EDITOR_PORT: String(config.pdfEditorPort), SEED_OPENCODE_PORT: String(config.openCodePort), ...definition.env };
    const child = spawn(process.execPath, [path.join(this.root, definition.file), ...(definition.args || [])], { cwd: this.root, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    this.children.set(definition.name, child);
    child.stdout.on('data', chunk => { if (this.output) process.stdout.write(`[${definition.name}] ${chunk}`); });
    child.stderr.on('data', chunk => { if (this.output) process.stderr.write(`[${definition.name}] ${chunk}`); });
    const failed = () => {
      if (this.closed || this.intentional.has(child)) return;
      this.error = { code: 'SERVICE_EXITED', message: `${definition.name} stopped. Check its local terminal diagnostics and retry.`, service: definition.name };
      this.phase = 'failed'; void this.log('service_exited', { service: definition.name });
    };
    child.once('error', () => { child.spawnFailed = true; failed(); }); child.once('exit', failed);
    return child;
  }
  async json(port, route, method = 'GET', timeout = 1500) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { Authorization: `Bearer ${this.token}` }, signal: AbortSignal.any([AbortSignal.timeout(timeout), this.controlAbort.signal]) });
    const data = await response.json();
    if (!response.ok) throw Object.assign(failure(data.error?.code || 'SERVICE_ERROR', data.error?.code === 'RUNTIME_BUSY' ? 'A task or file operation is still running. Wait or stop it before restarting.' : 'A service could not prepare for restart. Check its local diagnostics.'), { status: response.status });
    return data;
  }
  async waitHealth(definition, timeout, agent = false) {
    const end = Date.now() + timeout;
    while (!this.closed && Date.now() < end) {
      if (!alive(this.children.get(definition.name))) throw failure('SERVICE_EXITED', `${definition.name} could not start. Check its local terminal diagnostics.`, definition.name);
      try {
        const data = await this.json(definition.port, agent ? '/api/status' : '/health');
        if (data.ready && (!agent || data.authenticated && data.mcp?.ready)) return;
      } catch {}
      await delay(150);
    }
    throw failure('SERVICE_NOT_READY', `${definition.name} did not become ready. Check installation, login and its local diagnostics.`, definition.name);
  }
  async stopChild(name) {
    const child = this.children.get(name); if (!child) return;
    this.intentional.add(child);
    try { await terminateOwned(child, { graceMs: this.stopTimeout }); }
    catch { throw failure('SERVICE_STOP_FAILED', `${name} did not stop. Close the launch window and check local processes.`, name); }
    this.children.delete(name);
  }
  async stopBackends() { for (const name of [...this.children.keys()].reverse()) if (name !== 'front') await this.stopChild(name); }
  async loadConfig() {
    let config;
    try { config = JSON.parse(await fs.readFile(path.join(this.root, 'config/runtime.json'), 'utf8')); }
    catch { throw failure('INVALID_CONFIG', 'Runtime configuration could not be read. Repair config/runtime.json and retry.'); }
    const ports = ['frontPort','agentPort','workspacePort','builderPort','pdfEditorPort','runtimeManagerPort','vitePort','openCodePort'];
    config.vitePort ??= 5174; config.pdfEditorPort ??= 4313; config.runtimeManagerPort ??= 4314; config.openCodePort ??= 4315;
    if (ports.some(key => !Number.isInteger(config[key]) || config[key] < 1024 || config[key] > 65535) || new Set(ports.map(key => config[key])).size !== ports.length) throw failure('INVALID_CONFIG', 'Service ports must be distinct integers from 1024 to 65535.');
    if (this.config && ports.some(key => config[key] !== this.config[key])) throw failure('LAUNCHER_RESTART_REQUIRED', 'Service ports changed. Restart with the launcher for your operating system.');
    return config;
  }
  async startBackends(config) {
    this.activeDefinitions = [];
    for (const definition of this.definitions) {
      if (definition.optional && !await fs.access(path.join(this.root, definition.file)).then(() => true, () => false)) continue;
      this.activeDefinitions.push(definition);
      definition.port = config[definition.portKey];
      await availablePort(definition.port);
      this.phase = 'starting'; this.launch(definition, config);
      await this.waitHealth(definition, this.healthTimeout);
    }
    this.phase = 'connecting';
    const agent = this.activeDefinitions.find(x => x.name === 'agent');
    if (agent) await this.waitHealth(agent, this.agentTimeout, true);
    if (this.phase === 'failed' || this.closed || this.activeDefinitions.some(x => !alive(this.children.get(x.name)))) throw failure('SERVICE_EXITED', 'A backend stopped during startup. Check local diagnostics.');
    this.config = config;
  }
  startOperation(work) {
    if (this.operation) return this.jobId;
    this.jobId = randomUUID(); this.error = null;
    // Defer execution until the job/lock are visible to all HTTP requests.
    this.operation = Promise.resolve().then(work).catch(error => {
      if (this.closed) return;
      this.phase = 'failed'; this.error = { code: error.code || 'RESTART_FAILED', message: error.code ? error.message : 'Services could not restart. Check local diagnostics.', ...(error.service ? { service: error.service } : {}) };
      return this.log('restart_failed', { code: this.error.code, service: error.service, jobId: this.jobId });
    }).finally(() => { this.operation = null; });
    return this.jobId;
  }
  async start() {
    const config = await this.loadConfig(); this.config = config;
    this.scope = 'all';
    this.startOperation(async () => { await this.startFrontend(config); await this.startBackends(config); await this.ready(); });
  }
  async startFrontend(config) {
    if (!this.frontDefinition) return;
    const port = config[this.frontDefinition.portKey || 'frontPort'];
    await availablePort(port);
    const definition = { ...this.frontDefinition, args: typeof this.frontDefinition.args === 'function' ? this.frontDefinition.args(config) : this.frontDefinition.args };
    this.launch(definition, config);
    const end = Date.now() + this.healthTimeout;
    while (!this.closed && Date.now() < end) {
      if (!alive(this.children.get('front'))) throw failure('SERVICE_EXITED', 'Frontend could not start. Check its local diagnostics.', 'front');
      try { if ((await fetch(`http://127.0.0.1:${port}/`, {signal: AbortSignal.timeout(1000)})).ok) return; } catch {}
      await delay(100);
    }
    throw failure('SERVICE_NOT_READY', 'Frontend did not become ready. Repair dependencies and retry.', 'front');
  }
  async ready() {
    if (this.closed || [...this.children.values()].some(child => !alive(child))) throw failure('SERVICE_EXITED', 'A service stopped during startup.');
    this.phase = 'ready'; this.error = null; this.generation++;
    await this.log('ready', { generation: this.generation, jobId: this.jobId, scope: this.scope });
  }
  async prepareLegacy(definition) {
    if (definition.name !== 'agent') return;
    const data = await this.json(definition.port, '/api/sessions');
    if (!Array.isArray(data.sessions)) throw failure('LEGACY_STATUS_UNAVAILABLE', 'Legacy Agent session status could not be verified. Stop with the launcher.');
    for (const session of data.sessions) {
      const saved = await this.json(definition.port, `/api/sessions/${encodeURIComponent(session.id)}`);
      if (saved.session?.running) throw failure('RUNTIME_BUSY', 'An AI task is still running. Wait or stop it before restarting.');
    }
  }
  restart({ scope = 'backend' } = {}) {
    if (this.closed) throw failure('MANAGER_STOPPED', 'Runtime manager is stopping.');
    if (this.operation) return this.jobId;
    this.scope = scope;
    return this.startOperation(async () => {
      const previousPhase = this.phase;
      this.phase = 'preparing';
      const prepared = [];
      let config;
      try {
        config = await this.loadConfig();
        if (this.gatewayWrites) throw failure('RUNTIME_BUSY', 'A browser operation is still running. Wait before restarting.');
        // Gate Agent first so new AI/proxy/Git work cannot race the downstream gates.
        for (const definition of [...this.activeDefinitions].reverse()) {
          if (!alive(this.children.get(definition.name))) continue;
          prepared.push(definition);
          try { await this.json(definition.port, '/internal/runtime/prepare', 'POST'); }
          catch (error) { if (error.status === 404) { prepared.pop(); await this.prepareLegacy(definition); } else { error.service = definition.name; throw error; } }
        }
      } catch (error) {
        let released = true;
        for (const definition of prepared.reverse()) try { await this.json(definition.port, '/internal/runtime/release', 'POST'); } catch { released = false; }
        if (error.code === 'RUNTIME_BUSY' && released && previousPhase === 'ready') {
          this.phase = 'ready'; this.error = { code: error.code, message: error.message }; return;
        }
        throw error;
      }
      this.phase = 'stopping'; await this.log('restart', { jobId: this.jobId, scope });
      if (scope === 'all') await this.stopChild('front');
      await this.stopBackends();
      await this.startBackends(config);
      if (scope === 'all') await this.startFrontend(config);
      await this.ready();
    });
  }
  async close() {
    if (this.closing) return this.closing;
    this.closed = true; this.controlAbort.abort();
    this.closing = (async () => {
      await this.operation;
      await this.stopBackends(); await this.stopChild('front');
      await this.log('stop');
    })();
    return this.closing;
  }
}
