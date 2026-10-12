import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createOpencodeClient } from '@opencode-ai/sdk';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sdkData = async (request, message) => {
  const result = await request;
  if (result?.error) throw new Error(result.error?.data?.message || result.error?.message || message);
  return result?.data;
};
const errorText = error => error?.data?.message || error?.message || error?.name || 'OpenCode model execution failed';

export class OpenCodeProvider {
  constructor({ root, port, mcpEnv, instructions, onEvent, onDisconnect }) {
    this.root = root;
    this.port = port;
    this.mcpEnv = mcpEnv;
    this.instructions = instructions;
    this.onEvent = onEvent;
    this.onDisconnect = onDisconnect;
    this.password = randomUUID();
    this.runs = new Map();
    this.parts = new Map();
    this.ready = false;
  }

  async start() {
    if (this.starting) return this.starting;
    this.starting = this.#start().finally(() => { this.starting = null; });
    return this.starting;
  }

  async #start() {
    this.closing = false;
    const secretRoot = path.join(this.root, 'local-secrets/opencode');
    const dataRoot = path.join(secretRoot, 'data');
    const configRoot = path.join(secretRoot, 'config');
    await Promise.all([fs.mkdir(dataRoot, { recursive: true, mode: 0o700 }), fs.mkdir(configRoot, { recursive: true, mode: 0o700 })]);
    const binary = path.join(this.root, 'backend/agent-runtime/node_modules/.bin/opencode');
    await fs.access(binary);
    const config = {
      autoupdate: false,
      share: 'disabled',
      permission: { '*': 'allow', external_directory: 'allow', doom_loop: 'allow' },
      mcp: { seedagent: { type: 'local', command: [process.execPath, path.join(this.root, 'backend/mcp-runtime/server.mjs')], environment: this.mcpEnv, enabled: true, timeout: 30000 } },
    };
    const env = {
      ...process.env,
      XDG_DATA_HOME: dataRoot,
      XDG_CONFIG_HOME: configRoot,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
      OPENCODE_SERVER_USERNAME: 'saplingagent',
      OPENCODE_SERVER_PASSWORD: this.password,
      OPENCODE_DISABLE_AUTOUPDATE: 'true',
    };
    this.process = spawn(binary, ['serve', '--hostname=127.0.0.1', `--port=${this.port}`], { cwd: this.root, env, stdio: ['ignore', 'ignore', 'ignore'], detached: true });
    this.process.once('exit', (code, signal) => {
      const expected = this.closing;
      this.ready = false;
      this.process = null;
      if (!expected) this.onDisconnect?.(new Error(`OpenCode service stopped (${signal || code || 'unknown'})`));
    });
    const authorization = `Basic ${Buffer.from(`saplingagent:${this.password}`).toString('base64')}`;
    this.client = createOpencodeClient({ baseUrl: `http://127.0.0.1:${this.port}`, directory: this.root, headers: { Authorization: authorization } });
    let lastError;
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.port}/global/health`, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(500) });
        if (response.ok) { this.ready = true; break; }
      } catch (error) { lastError = error; }
      if (this.process?.exitCode !== null) break;
      await delay(100);
    }
    if (!this.ready) { await this.close(); throw new Error(`OpenCode service did not become ready${lastError ? `: ${errorText(lastError)}` : ''}`); }
    this.events = new AbortController();
    this.eventLoop = this.#eventLoop(this.events.signal);
    return this.catalog();
  }

  async catalog() {
    if (!this.ready) await this.start();
    const result = await sdkData(this.client.provider.list(), 'Unable to list OpenCode providers');
    const connected = new Set(result.connected || []);
    return {
      id: 'opencode', label: 'OpenCode', ready: this.ready, authenticated: connected.size > 0,
      providers: (result.all || []).filter(provider => connected.has(provider.id)).map(provider => ({
        id: provider.id,
        label: provider.name,
        defaultModelId: result.default?.[provider.id] || null,
        models: Object.values(provider.models || {}).filter(model => model.tool_call !== false).map(model => ({ id: model.id, label: model.name || model.id })).sort((a, b) => a.label.localeCompare(b.label)),
      })).filter(provider => provider.models.length).sort((a, b) => a.label.localeCompare(b.label)),
    };
  }

  async execute(run, text) {
    if (!this.ready) await this.start();
    let id = run.session.threadId;
    if (!id) {
      const created = await sdkData(this.client.session.create({ body: { title: run.session.title } }), 'Unable to create an OpenCode session');
      id = created.id;
      run.session.threadId = id;
      await run.save();
    } else {
      await sdkData(this.client.session.get({ path: { id } }), 'The saved OpenCode session is unavailable');
    }
    this.runs.set(id, run);
    await sdkData(this.client.session.promptAsync({
      path: { id },
      body: {
        model: { providerID: run.session.providerId, modelID: run.session.modelId },
        system: this.instructions,
        parts: [{ type: 'text', text }],
      },
    }), 'OpenCode did not accept the prompt');
    if (run.cancelRequested) await this.interrupt(run);
  }

  async interrupt(run) {
    run.cancelRequested = true;
    if (!run.session?.threadId || !this.client || run.finished) return;
    await sdkData(this.client.session.abort({ path: { id: run.session.threadId } }), 'Unable to stop OpenCode');
  }

  async #eventLoop(signal) {
    let failures = 0;
    while (!signal.aborted && this.ready) {
      try {
        await this.#events(signal);
        if (signal.aborted) return;
        failures += 1;
      } catch (error) {
        if (signal.aborted) return;
        failures += 1;
        if (failures >= 3) {
          this.ready = false;
          this.onDisconnect?.(error);
          return;
        }
      }
      await delay(Math.min(250 * failures, 1000));
    }
  }

  async #events(signal) {
    const stream = await this.client.event.subscribe({ signal });
    for await (const event of stream.stream) {
      if (signal.aborted) return;
      const payload = event?.payload || event;
      const properties = payload?.properties || {};
      const sessionId = properties.sessionID || properties.part?.sessionID || properties.info?.sessionID;
      const run = sessionId && this.runs.get(sessionId);
      if (!run || run.finished) continue;
      if (payload.type === 'message.part.updated') {
        const part = properties.part;
        if (part?.type === 'text' && !part.synthetic && !part.ignored) {
          const key = `${part.sessionID}:${part.id}`;
          const previous = this.parts.get(key) || '';
          const delta = typeof properties.delta === 'string' ? properties.delta : part.text.startsWith(previous) ? part.text.slice(previous.length) : '';
          this.parts.set(key, part.text);
          if (delta) this.onEvent(run, { type: 'text', id: part.messageID || part.id, delta, text: part.text });
        } else if (part?.type === 'tool') {
          this.onEvent(run, { type: 'tool', id: part.callID || part.id, name: part.tool, status: part.state?.status || 'inProgress', input: part.state?.input || {} });
        } else if (part?.type === 'reasoning') this.onEvent(run, { type: 'status', label: 'Thinking…' });
      } else if (payload.type === 'session.error') {
        this.onEvent(run, { type: 'error', error: new Error(errorText(properties.error)) });
      } else if (payload.type === 'session.idle') {
        this.runs.delete(sessionId);
        this.onEvent(run, { type: 'done', status: run.cancelRequested ? 'interrupted' : 'completed' });
      } else if (payload.type === 'session.status' && properties.status?.type === 'retry') {
        this.onEvent(run, { type: 'status', label: 'Retrying model connection…' });
      }
    }
  }

  async close() {
    this.closing = true;
    this.ready = false;
    this.events?.abort();
    if (this.process?.pid) {
      try { process.kill(-this.process.pid, 'SIGTERM'); } catch {}
      await Promise.race([new Promise(resolve => this.process?.once('exit', resolve)), delay(1000)]);
      if (this.process?.pid) { try { process.kill(-this.process.pid, 'SIGKILL'); } catch {} }
    }
    await this.eventLoop?.catch(() => {});
  }
}
