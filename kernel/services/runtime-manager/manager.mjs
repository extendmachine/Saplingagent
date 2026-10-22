import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { terminateOwned } from '../../contracts/local-process.mjs';
import { randomUUID } from 'node:crypto';
import { portKeys,selectRuntimePorts } from './ports.mjs';
import { loadProjectServices, assignProjectPorts, serviceCommand, servicePortEnv } from './services.mjs';
import { readMcpAccess } from '../../contracts/mcp-access.mjs';

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
    this.gatewayWrites = 0; this.activeDefinitions = definitions; this.projectPorts = {};
    this.controlAbort = new AbortController();
  }
  state() {
    return { applicationRoot:path.resolve(this.root),instanceId: this.instanceId, generation: this.generation, phase: this.phase, busy: !!this.operation || !!this.maintenance, canRestart: !this.operation && !this.maintenance && !this.closed, jobId: this.jobId || null, scope: this.scope || 'all', error: this.error,
      aiConnection: this.config?.externalMcpOnly ? 'external-mcp' : 'builtin',
      ports: this.config ? Object.fromEntries(portKeys.map(key => [key, this.config[key]])) : null,
      services: [...this.children].map(([name, child]) => {
        const definition = name === 'front' ? this.frontDefinition : this.activeDefinitions.find(x => x.name === name);
        const portKey = definition?.portKey || (name === 'front' ? 'frontPort' : null);
        const port = portKey ? this.config?.[portKey] : definition?.port;
        return { name, pid: child.pid || null, running: !!alive(child), healthCheck: definition?.healthCheck || 'http', ...(Number.isInteger(port) ? { port } : {}), ...(definition?.project ? { project: true } : {}) };
      }) };
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
    const projectEnv = Object.fromEntries(Object.entries(this.projectPorts).map(([name, port]) => [servicePortEnv(name), String(port)]));
    const spec = definition.launchSpec;
    const env = { ...process.env, SEED_ROOT: this.root, SEED_FRONT_PORT: String(config.frontPort), SEED_RUNTIME_MANAGER_PORT: String(config.runtimeManagerPort), SEED_AGENT_PORT: String(config.agentPort), SEED_WORKSPACE_PORT: String(config.workspacePort), SEED_BUILDER_PORT: String(config.builderPort), SEED_PDF_EDITOR_PORT: String(config.pdfEditorPort), SEED_OPENCODE_PORT: String(config.openCodePort), SEED_SERVICE_PORTS: JSON.stringify(this.projectPorts), ...projectEnv, ...(spec?.env || definition.env), ...(definition.project && definition.port ? { PORT: String(definition.port), SEED_SERVICE_PORT: String(definition.port) } : {}) };
    const child = spawn(spec?.command || process.execPath, spec?.args || [path.join(this.root, definition.file), ...(definition.args || [])], { cwd: spec?.cwd || this.root, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    this.children.set(definition.name, child);
    child.stdout.on('data', chunk => { if (this.output) process.stdout.write(`[${definition.name}] ${chunk}`); });
    child.stderr.on('data', chunk => { if(/EADDRINUSE|Port \d+ is already in use/.test(String(chunk)))child.bindConflict=true;if (this.output) process.stderr.write(`[${definition.name}] ${chunk}`); });
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
    if (definition.project && definition.healthCheck === 'process') {
      await delay(100);
      if (!alive(this.children.get(definition.name))) throw failure(this.children.get(definition.name)?.bindConflict?'PORT_OCCUPIED':'SERVICE_EXITED', `${definition.name} could not start. Check its local terminal diagnostics.`, definition.name);
      return;
    }
    const end = Date.now() + timeout;
    while (!this.closed && Date.now() < end) {
      if (!alive(this.children.get(definition.name))) throw failure(this.children.get(definition.name)?.bindConflict?'PORT_OCCUPIED':'SERVICE_EXITED', `${definition.name} could not start. Check its local terminal diagnostics.`, definition.name);
      try {
        if (definition.project) {
          if (definition.healthCheck === 'tcp') {
            if (await new Promise(resolve => {
              const socket = net.connect({ host: '127.0.0.1', port: definition.port });
              const finish = ready => { socket.destroy(); resolve(ready); };
              socket.setTimeout(500, () => finish(false)); socket.once('error', () => finish(false)); socket.once('connect', () => finish(true));
            })) return;
          } else {
            const response = await fetch(`http://127.0.0.1:${definition.port}${definition.healthPath}`, { signal: AbortSignal.any([AbortSignal.timeout(1000), this.controlAbort.signal]) });
            if (response.ok) {
              if ((response.headers.get('content-type') || '').includes('json')) { if ((await response.json())?.ready !== false) return; }
              else { await response.body?.cancel(); return; }
            } else await response.body?.cancel();
          }
          await delay(100); continue;
        }
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
    catch { throw failure('SERVICE_STOP_FAILED', `${name} did not stop. Check local diagnostics and retry Restart app.`, name); }
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
    this.nextSourcePorts = Object.fromEntries(ports.map(key => [key, config[key]]));
    const overrides = Object.fromEntries(Object.entries(this.portOverrides || {}).filter(([key]) => ['frontPort', 'runtimeManagerPort'].includes(key) || !this.sourcePorts || config[key] === this.sourcePorts[key]));
    this.sourcePorts ??= Object.fromEntries(ports.map(key => [key, config[key]]));
    const mcp = await readMcpAccess(this.root);
    const effective = { ...config, ...overrides, externalMcpOnly: mcp.enabled && mcp.externalOnly };
    if (new Set(ports.map(key => effective[key])).size !== ports.length) throw failure('INVALID_CONFIG', 'Internal ports must differ from the current public and control addresses.');
    return effective;
  }
  async servicePlan(config) {
    const plan = await loadProjectServices(this.root, this.definitions);
    const old = new Map(this.activeDefinitions.filter(x => x.project).map(x => [x.name, x]));
    const ownedPorts = new Set(this.activeDefinitions.filter(x => alive(this.children.get(x.name))).map(x => x.port));
    await assignProjectPorts(plan, config, old, ownedPorts);
    for (const definition of plan) {
      if (!definition.project) definition.port = config[definition.portKey];
      else definition.launchSpec = await serviceCommand(this.root, definition, definition.port);
    }
    return plan;
  }
  activatePlan(plan) {
    this.projectPorts = Object.fromEntries(plan.filter(x => x.project && x.port).map(x => [x.name, x.port]));
  }
  async startBackends(config, plan) {
    this.activeDefinitions = [];
    const requireAgentAuthentication = !config.externalMcpOnly;
    for (const definition of plan) {
      this.activeDefinitions.push(definition);
      if (definition.port) await availablePort(definition.port);
      this.phase = 'starting'; this.launch(definition, config);
      if (definition.name === 'agent') this.phase = 'connecting';
      const authenticatedAgent = definition.name === 'agent' && requireAgentAuthentication;
      await this.waitHealth(definition, authenticatedAgent ? this.agentTimeout : definition.timeoutMs || this.healthTimeout, authenticatedAgent);
    }
    this.phase = 'connecting';
    const agent = this.activeDefinitions.find(x => x.name === 'agent');
    if (agent) await this.waitHealth(agent, requireAgentAuthentication ? this.agentTimeout : this.healthTimeout, requireAgentAuthentication);
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
    this.startOperation(async () => {
      for(let attempt=0;attempt<8;attempt++){
        const current=this.config;const plan=await this.servicePlan(current);this.activatePlan(plan);
        try{await this.startFrontend(current);await this.startBackends(current,plan);await this.ready();return;}
        catch(error){if(error.code!=='PORT_OCCUPIED'||attempt===7)throw error;
          await this.stopBackends();await this.stopChild('front');
          const ports=await selectRuntimePorts(current,{fixed:{frontPort:current.frontPort,runtimeManagerPort:current.runtimeManagerPort}});
          this.config={...current,...ports};this.portOverrides=ports;this.error=null;
          await this.log('startup_port_retry',{attempt:attempt+1,ports});
        }
      }
    });
  }
  async startFrontend(config) {
    if (!this.frontDefinition) return;
    const port = config[this.frontDefinition.portKey || 'frontPort'];
    await availablePort(port);
    const definition = { ...this.frontDefinition, args: typeof this.frontDefinition.args === 'function' ? this.frontDefinition.args(config) : this.frontDefinition.args };
    this.launch(definition, config);
    const end = Date.now() + this.healthTimeout;
    while (!this.closed && Date.now() < end) {
      if (!alive(this.children.get('front'))) throw failure(this.children.get('front')?.bindConflict?'PORT_OCCUPIED':'SERVICE_EXITED', 'Frontend could not start. Check its local diagnostics.', 'front');
      try { if ((await fetch(`http://127.0.0.1:${port}/`, {signal: AbortSignal.timeout(1000)})).ok) return; } catch {}
      await delay(100);
    }
    throw failure('SERVICE_NOT_READY', 'Frontend did not become ready. Repair dependencies and retry.', 'front');
  }
  async ready() {
    if (this.closed || [...this.children.values()].some(child => !alive(child))) throw failure('SERVICE_EXITED', 'A service stopped during startup.');
    this.phase = 'ready'; this.error = null; this.generation++;
    this.sourcePorts = this.nextSourcePorts;
    this.portOverrides = Object.fromEntries(portKeys.map(key => [key, this.config[key]]));
    const file = path.join(this.root, '.runtime/runtime-address.json');
    try {
      const record = JSON.parse(await fs.readFile(file, 'utf8'));
      if (record.instanceId === this.instanceId) {
        const temporary = `${file}.${this.instanceId}.tmp`;
        await fs.writeFile(temporary, JSON.stringify({ ...record, ports: this.portOverrides }) + '\n', { mode: 0o600 }); await fs.rename(temporary, file);
      }
    } catch (error) { if (error.code !== 'ENOENT') await this.log('discovery_update_failed', { code: error.code || 'INVALID_DISCOVERY' }); }
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
  restart({ scope = 'all' } = {}) {
    if (this.closed) throw failure('MANAGER_STOPPED', 'Runtime manager is stopping.');
    if (this.maintenance) throw failure('KERNEL_BUSY', 'Kernel maintenance is active.');
    if (this.operation) return this.jobId;
    this.scope = scope;
    return this.startOperation(async () => {
      const previousPhase = this.phase;
      this.phase = 'preparing';
      const prepared = [];
      let config;
      let plan;
      try {
        if (this.gatewayWrites) throw failure('RUNTIME_BUSY', 'A browser operation is still running. Wait before restarting.');
        // Gate Agent first so new AI/proxy/Git work cannot race the downstream gates.
        const gates = [...this.activeDefinitions.filter(x => x.name === 'agent'), ...this.activeDefinitions.filter(x => x.name !== 'agent').reverse()];
        for (const definition of gates) {
          if (!alive(this.children.get(definition.name))) continue;
          if (definition.project && (!definition.drain || !definition.port)) continue;
          prepared.push(definition);
          try { await this.json(definition.port, '/internal/runtime/prepare', 'POST'); }
          catch (error) { if (error.status === 404) { prepared.pop(); await this.prepareLegacy(definition); } else { error.service = definition.name; throw error; } }
        }
        config = await this.loadConfig();
        plan = await this.servicePlan(config);
        if (scope === 'backend' && this.config && portKeys.some(key => config[key] !== this.config[key])) throw failure('FULL_RESTART_REQUIRED', 'Use Restart app to apply changed internal ports.');
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
      this.config = config; this.activatePlan(plan);
      await this.startBackends(config, plan);
      if (scope === 'all') await this.startFrontend(config);
      await this.ready();
    });
  }
  async prepareMaintenance() {
    if (this.closed || this.operation || this.maintenance || this.gatewayWrites) throw Object.assign(failure('KERNEL_BUSY', 'Wait for active work before kernel maintenance.'), {status:409});
    this.maintenance = true;
    const previous = this.phase, prepared = [];
    const undo = async () => {
      let released = true;
      for (const definition of prepared.reverse()) try { await this.json(definition.port, '/internal/runtime/release', 'POST'); } catch { released = false; }
      this.maintenance = false; this.phase = released ? previous : 'failed';
      if (!released) this.error = {code:'DRAIN_RELEASE_FAILED',message:'A service gate could not be released. Restart from runtime recovery.'};
    };
    try {
      this.phase = 'preparing';
      const gates = [...this.activeDefinitions.filter(x => x.name === 'agent'), ...this.activeDefinitions.filter(x => x.name !== 'agent').reverse()];
      for (const definition of gates) {
        if (!alive(this.children.get(definition.name))) continue;
        if (definition.project && (!definition.drain || !definition.port)) continue;
        prepared.push(definition);
        try { await this.json(definition.port, '/internal/runtime/prepare', 'POST'); }
        catch(error) { if(error.status === 404) { prepared.pop(); await this.prepareLegacy(definition); } else throw error; }
      }
      return undo;
    } catch(error) { await undo(); error.status ||= 409; throw error; }
  }
  async close() {
    if (this.closing) return this.closing;
    this.closed = true; this.phase = 'stopping'; this.controlAbort.abort();
    this.closing = (async () => {
      await this.operation;
      await this.stopBackends(); await this.stopChild('front');
      this.phase = 'stopped'; this.error = null;
      await this.log('stop');
    })().catch(error => {
      // Keep failed shutdown observable and retryable; never claim a live child stopped.
      this.phase = 'failed'; this.error = { code: 'SERVICE_STOP_FAILED', message: 'An owned service could not stop. Retry Stop app or inspect local logs.' };
      this.closing = null;
      throw error;
    });
    return this.closing;
  }
}
