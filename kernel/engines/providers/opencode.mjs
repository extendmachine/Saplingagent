import { readConnections,openCodeConnections } from '../../contracts/ai-configuration.mjs';
import { openCodeBinary, terminateOwned } from '../../contracts/local-process.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { engineDependency } from '../../contracts/engine-dependencies.mjs';
import { fileURLToPath as engineURL } from 'node:url';
const { createOpencodeClient } = await engineDependency(engineURL(new URL('../../../', import.meta.url)), '@opencode-ai/sdk');

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
    this.ready = false;
  }

  async start() {
    if (this.ready) return this.catalog();
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
    const binary = openCodeBinary(this.root);
    await fs.access(binary);
    const config = {
      provider: await openCodeConnections(this.root,await readConnections(this.root)),
      autoupdate: false,
      share: 'disabled',
      permission: { '*': 'allow', external_directory: 'allow', doom_loop: 'allow' },
      mcp: { seedagent: { type: 'local', command: [process.execPath, path.join(this.root, 'backend/mcp-runtime/server.mjs')], environment: this.mcpEnv, enabled: true, timeout: 30000 } },
    };
    const env = {
      ...process.env,
      XDG_DATA_HOME: dataRoot,
      XDG_CONFIG_HOME: configRoot,
      XDG_CACHE_HOME: path.join(this.root, '.cache/opencode'),
      XDG_STATE_HOME: path.join(this.root, 'data/opencode-state'),
      OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
      OPENCODE_SERVER_USERNAME: 'saplingagent',
      OPENCODE_SERVER_PASSWORD: this.password,
      OPENCODE_DISABLE_AUTOUPDATE: 'true',
    };
    this.process = spawn(binary, ['serve', '--hostname=127.0.0.1', `--port=${this.port}`], { cwd: this.root, env, stdio: ['ignore', 'ignore', 'ignore'], detached: process.platform !== 'win32', windowsHide: true });
    this.process.once('error', () => { this.ready = false; });
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
    const subscription = await this.client.event.subscribe({ signal: this.events.signal });
    this.eventLoop = this.#eventLoop(this.events.signal, subscription);
    return this.catalog();
  }

  async catalog() {
    if (!this.ready) await this.start();
    const result = await sdkData(this.client.provider.list(), 'Unable to list OpenCode providers');
    const connected = new Set(result.connected || []);
    const mcpStatus = await sdkData(this.client.mcp.status(), 'Unable to read OpenCode MCP status');
    return {
      id: 'opencode', label: 'OpenCode', ready: this.ready, authenticated: connected.size > 0,
      mcp: { ready: mcpStatus?.seedagent?.status === 'connected', tools: [] },
      providers: (result.all || []).filter(provider => connected.has(provider.id)).map(provider => ({
        id: provider.id,
        label: provider.name,
        defaultModelId: result.default?.[provider.id] || null,
        models: Object.values(provider.models || {}).filter(model => model.tool_call !== false).map(model => ({ id: model.id, label: model.name || model.id })).sort((a, b) => a.label.localeCompare(b.label)),
      })).filter(provider => provider.models.length).sort((a, b) => a.label.localeCompare(b.label)),
    };
  }

  async execute(run, text, { context = '', images = [] } = {}) {
    if (run.cancelRequested || run.finished) {
      if (!run.finished) this.onEvent(run, { type: 'done', status: 'interrupted' });
      return;
    }
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
    if (run.finished || run.cancelRequested) {
      if (!run.finished) this.onEvent(run, { type: 'done', status: 'interrupted' });
      return;
    }
    const messageID = `msg_${Date.now().toString(16)}${randomUUID().replaceAll('-', '')}`;
    const state = { run, messageID, started: false, responded: false, messages: new Map(), pending: new Map(), parts: new Map() };
    this.runs.set(id, state);
    try {
      await sdkData(this.client.session.promptAsync({
        path: { id },
        body: {
          messageID,
          model: { providerID: run.session.providerId, modelID: run.session.modelId },
          system: [this.instructions, context].filter(Boolean).join('\n\n'),
          parts: [{ type: 'text', text }, ...images.map(image => ({ type: 'file', mime: image.contentType, filename: image.name, url: `data:${image.contentType};base64,${image.data}` }))],
        },
      }), 'OpenCode did not accept the prompt');
      if (run.cancelRequested) await this.interrupt(run);
    } catch (error) {
      if (this.runs.get(id) === state) this.runs.delete(id);
      throw error;
    }
  }

  async interrupt(run) {
    run.cancelRequested = true;
    if (!run.session?.threadId || !this.client || run.finished) return;
    await sdkData(this.client.session.abort({ path: { id: run.session.threadId } }), 'Unable to stop OpenCode');
  }

  async #eventLoop(signal, subscription) {
    let failures = 0;
    while (!signal.aborted && this.ready) {
      try {
        await this.#events(signal, subscription);
        subscription = undefined;
        if (signal.aborted) return;
        failures += 1;
      } catch (error) {
        if (signal.aborted) return;
        subscription = undefined;
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

  async #events(signal, subscription) {
    const stream = subscription || await this.client.event.subscribe({ signal });
    for await (const event of stream.stream) {
      if (signal.aborted) return;
      await this.handleEvent(event);
    }
  }

  // Native adapter boundary: SSE includes user echoes and earlier turns, not just replies.
  async handleEvent(event) {
    const payload = event?.payload || event;
    const properties = payload?.properties || {};
    const sessionId = properties.sessionID || properties.part?.sessionID || properties.info?.sessionID;
    const state = sessionId && this.runs.get(sessionId);
    if (!state || state.run.finished) { if (state) this.runs.delete(sessionId); return; }
    const { run } = state;
    const terminal = result => { this.runs.delete(sessionId); this.onEvent(run, result); };
    if (payload.type === 'message.updated') {
      const info = properties.info;
      if (!info?.id) return;
      const belongs = info.role === 'assistant' && info.parentID === state.messageID && !info.summary;
      state.messages.set(info.id, belongs);
      if (info.id === state.messageID || belongs) state.started = true;
      if (belongs && info.error) {
        terminal(run.cancelRequested ? { type: 'done', status: 'interrupted' } : { type: 'error', error: new Error(errorText(info.error)) });
        return;
      }
      const pending = state.pending.get(info.id);
      state.pending.delete(info.id);
      if (belongs && pending) for (const part of pending.values()) this.#part(state, part);
    } else if (payload.type === 'message.part.updated') {
      const part = properties.part;
      if (!part?.messageID || part.messageID === state.messageID || run.cancelRequested) return;
      if (!state.messages.has(part.messageID)) {
        // A cumulative snapshot suffices when metadata arrives after text updates.
        let pending = state.pending.get(part.messageID);
        if (!pending) { pending = new Map(); state.pending.set(part.messageID, pending); }
        const previous = pending.get(part.id);
        if (part.type !== 'text' || !previous || !previous.text?.startsWith(part.text)) pending.set(part.id, part);
      } else if (state.messages.get(part.messageID)) this.#part(state, part);
    } else if (payload.type === 'session.error') {
      if (properties.messageID && properties.messageID !== state.messageID && !state.messages.get(properties.messageID)) return;
      terminal(run.cancelRequested ? { type: 'done', status: 'interrupted' } : { type: 'error', error: new Error(errorText(properties.error)) });
    } else if (payload.type === 'session.idle') {
      // A reconnect may miss message.updated. Resolve uncertain parts from native storage.
      for (const messageID of state.pending.keys()) {
        if (!this.client?.session.message) break;
        try {
          const message = await sdkData(this.client.session.message({ path: { id: sessionId, messageID }, signal: AbortSignal.timeout(3000) }), 'Unable to read OpenCode message metadata');
          if (this.runs.get(sessionId) !== state || run.finished) return;
          if (message?.info?.sessionID === sessionId && message.info.id === messageID) {
            await this.handleEvent({ type: 'message.updated', properties: { info: message.info } });
          }
        } catch { /* Unknown roles are never rendered; an empty response fails below. */ }
      }
      if (this.runs.get(sessionId) !== state || run.finished) return;
      if (!state.started && !state.pending.size) return; // Earlier idle, before prompt acceptance.
      if (!run.cancelRequested && !state.responded) {
        terminal({ type: 'error', error: new Error('OpenCode finished without an assistant response. Check the selected model and API settings, then retry.') });
      } else terminal({ type: 'done', status: run.cancelRequested ? 'interrupted' : 'completed' });
    } else if (payload.type === 'session.status' && properties.status?.type === 'retry') {
      if (!run.cancelRequested) this.onEvent(run, { type: 'status', label: 'Retrying model connection…' });
    }
  }

  #part(state, part) {
    const { run } = state;
    if (run.finished || run.cancelRequested || part.synthetic || part.ignored) return;
    if (part.type === 'text' && typeof part.text === 'string') {
      const previous = state.parts.get(part.id) || '';
      if (!part.text.startsWith(previous)) return; // Never rewind on duplicate/older snapshots.
      const delta = part.text.slice(previous.length);
      state.parts.set(part.id, part.text);
      if (delta) {
        state.responded = true;
        this.onEvent(run, { type: 'text', id: part.messageID, delta, text: part.text });
      }
    } else if (part.type === 'tool') {
      state.responded = true;
      this.onEvent(run, { type: 'tool', id: part.callID || part.id, name: part.tool, status: part.state?.status || 'inProgress', input: part.state?.input || {} });
    } else if (part.type === 'reasoning') this.onEvent(run, { type: 'status', label: 'Thinking…' });
  }

  async close() {
    this.closing = true;
    this.ready = false;
    this.events?.abort();
    this.runs.clear();
    const child = this.process;
    if (child?.pid) await terminateOwned(child, { graceMs: 1000 });
    await this.eventLoop?.catch(() => {});
  }
}
