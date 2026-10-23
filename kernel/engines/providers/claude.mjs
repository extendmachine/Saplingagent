import { engineDependency } from '../../contracts/engine-dependencies.mjs';
import { fileURLToPath as engineURL } from 'node:url';
const { query } = await engineDependency(engineURL(new URL('../../../', import.meta.url)), '@anthropic-ai/claude-agent-sdk');
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { claudeConnections, readConnections } from '../../contracts/ai-configuration.mjs';
import { terminateOwned } from '../../contracts/local-process.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const authVariable = name => /^(ANTHROPIC_|CLAUDE_CODE_(OAUTH|SESSION_ACCESS_TOKEN|HOST_CREDS_FILE|HOST_AUTH|SDK_HAS_(HOST_AUTH|OAUTH)_REFRESH|PROVIDER_MANAGED_BY_HOST|(?:GATEWAY_TOKEN|API_KEY|WEBSOCKET_AUTH)_FILE_DESCRIPTOR|USE_)|CLAUDE_BRIDGE_OAUTH_TOKEN|AWS_|GOOGLE_(APPLICATION_CREDENTIALS|CLOUD_|API_KEY)|GCLOUD_)/i.test(name);
const credential = value => typeof value === 'string' && !!value.trim() && value.length <= 8192 && !/[\s\x00-\x1f\x7f]/.test(value);
const authFailure = () => Object.assign(new Error('The selected Claude authentication is unavailable. Reconfigure that scheme and restart the app.'),{code:'CLAUDE_AUTH_REQUIRED'});
function safeError(error,profiles=[]) {
  let message=typeof error?.message==='string'?error.message:'Claude Agent operation failed.';
  for(const profile of profiles)for(const name of ['oauthToken','apiKey'])if(typeof profile?.[name]==='string'&&profile[name])message=message.split(profile[name]).join('[redacted]');
  const value=new Error(message.slice(0,4000));
  value.code=error?.code==='CLAUDE_AUTH_REQUIRED'?'CLAUDE_AUTH_REQUIRED':'CLAUDE_AGENT_ERROR';
  return value;
}
function toolEnvironment(env={}) {
  const clean={...env};
  // An SDK child may merge its own environment. Explicit empty overrides prevent
  // the registered MCP subprocess from inheriting the selected authentication.
  for(const name of new Set([...Object.keys(process.env),...Object.keys(env),'ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_BASE_URL','CLAUDE_CODE_OAUTH_TOKEN']))if(authVariable(name))clean[name]='';
  return clean;
}
// Deliberately do not inherit a developer's global Claude account or routing.
export function claudeEnvironment(root, profile, inherited = process.env) {
  const env = { ...inherited };
  for (const name of Object.keys(env)) if (authVariable(name)||/^CLAUDE_CONFIG_DIR$/i.test(name)) delete env[name];
  let auth;
  if(profile.kind==='subscription'){
    if(!credential(profile.oauthToken))throw authFailure();
    auth={CLAUDE_CODE_OAUTH_TOKEN:profile.oauthToken};
  }else if(profile.kind==='api'){
    if(!profile.noAuth&&(typeof profile.apiKey!=='string'||!profile.apiKey))throw authFailure();
    if(typeof profile.sdkBaseUrl!=='string'||!profile.sdkBaseUrl)throw authFailure();
    auth={ANTHROPIC_API_KEY:profile.noAuth?'anonymous-local-endpoint':profile.apiKey,ANTHROPIC_BASE_URL:profile.sdkBaseUrl};
  }else throw authFailure();
  return { ...env, ...auth,
    XDG_CONFIG_HOME: path.join(root, 'local-secrets/claude/config'), XDG_DATA_HOME: path.join(root, 'local-secrets/claude/data'),
    XDG_CACHE_HOME: path.join(root, '.cache/claude'), XDG_STATE_HOME: path.join(root, 'local-secrets/claude/state'),
    TMPDIR: path.join(root, '.cache/claude/tmp'), TMP: path.join(root, '.cache/claude/tmp'), TEMP: path.join(root, '.cache/claude/tmp'),
    CLAUDE_CONFIG_DIR: path.join(root, 'local-secrets/claude'),
    DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
}

export class ClaudeProvider {
  constructor({ root, mcpEnv, instructions, onEvent, queryFactory = query, spawnProcess = spawn }) {
    Object.assign(this, { root, mcpEnv, instructions, onEvent, queryFactory, spawnProcess });
    this.runs = new Map(); this.ready = false;
  }
  options(profile, state, run) {
    const tool = status => async input => {
      if (run && !run.finished && !run.cancelRequested && !this.closing) this.onEvent(run, { type: 'tool', id: input.tool_use_id, name: input.tool_name, status, input: input.tool_input || {} });
      return {};
    };
    return {
      cwd: this.root, model: profile.model, env: claudeEnvironment(this.root, profile),
      permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true, sandbox: { enabled: false },
      settingSources: ['project'], plugins: [{ type: 'local', path: path.join(this.root, '.agents') }],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: this.instructions + ' Ask user questions in ordinary chat text; this host does not render native question or MCP elicitation forms.' }, includePartialMessages: true,
      mcpServers: { seedagent: { type: 'stdio', command: process.execPath, args: [path.join(this.root, 'backend/mcp-runtime/server.mjs')], env: toolEnvironment(this.mcpEnv) } },
      hooks: { PreToolUse: [{ hooks: [tool('running')] }], PostToolUse: [{ hooks: [tool('completed')] }], PostToolUseFailure: [{ hooks: [tool('failed')] }] },
      // Do not advertise dialog types that this minimal chat UI cannot render.
      supportedDialogKinds: [], onUserDialog: async () => ({ behavior: 'cancelled' }),
      onElicitation: async () => ({ action: 'decline' }),
      spawnClaudeCodeProcess: options => {
        state.child = this.spawnProcess(options.command, options.args, { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true });
        // SDK owns the transport; keep stderr out of logs (it can contain secrets).
        state.child.stderr?.resume();
        return state.child;
      },
    };
  }
  async dispose(state) {
    if (!state || state.disposing) return state?.disposing;
    state.disposing = (async () => {
      // Terminate the owned tree before SDK close can kill the Windows leader.
      if (state.child?.pid) await terminateOwned(state.child, { graceMs: 500 });
      state.query?.close(); state.release?.();
    })();
    return state.disposing;
  }
  async start() {
    if (this.ready) return this.catalog;
    if (this.starting) return this.starting;
    this.starting = this.initialize().catch(error=>{throw safeError(error,this.profiles);}).finally(() => { this.starting = null; });
    return this.starting;
  }
  async initialize() {
    this.closing = false;
    const profiles = await claudeConnections(this.root, await readConnections(this.root));
    if (!profiles.length) return { id: 'claude', label: 'Claude Agent', ready: false, authenticated: false, providers: [], mcp: { ready: false, tools: [] }, error: 'Configure a Claude Agent scheme in AI setup first.' };
    await Promise.all(['local-secrets/claude','local-secrets/claude/config','local-secrets/claude/data','local-secrets/claude/state','.cache/claude/tmp'].map(directory => fs.mkdir(path.join(this.root, directory), { recursive: true, mode: 0o700 })));
    this.profiles = profiles;
    const state = {}; this.probe = state;
    const idle = new Promise(resolve => { state.release = resolve; });
    const prompt = (async function* () { await idle; })();
    try {
      state.query = this.queryFactory({ prompt, options: this.options(profiles[0], state) });
      // Control handshake only. No user prompt is submitted to the model.
      const timeout = new Promise((_, reject) => { state.timer = setTimeout(() => reject(new Error('Claude Agent initialization did not complete')), 30000); });
      await Promise.race([state.query.initializationResult(), timeout]);
      let mcp;
      for (let attempt = 0; attempt < 100; attempt++) {
        mcp = (await Promise.race([state.query.mcpServerStatus(), timeout])).find(item => item.name === 'seedagent');
        if (mcp && mcp.status !== 'pending') break;
        await delay(100);
      }
      if (mcp?.status !== 'connected') throw new Error('Claude Agent could not connect to project MCP');
      const skills = await Promise.race([state.query.supportedCommands(), timeout]);
      if (this.closing) throw new Error('Claude Agent startup was stopped');
      this.catalog = { id: 'claude', label: 'Claude Agent', ready: true, authenticated: true,
        mcp: { ready: true, tools: (mcp.tools || []).map(tool => ({ name: tool.name, description: tool.description || '' })) },
        skills: skills.filter(skill => skill.name.startsWith('saplingagent:')).map(({ name, description }) => ({ name, description })),
        providers: profiles.map(profile => ({ id: profile.providerId, label: profile.label, defaultModelId: profile.model, models: [{ id: profile.model, label: profile.model }] })) };
      this.ready = true;
      return this.catalog;
    } finally {
      clearTimeout(state.timer);
      try { await this.dispose(state); } catch (error) { this.ready = false; throw error; }
      finally { this.probe = null; }
    }
  }
  async execute(run, text, { images = [] } = {}) {
    if (!this.ready) await this.start();
    if (run.cancelRequested || this.closing) { this.onEvent(run, { type: 'done', status: 'interrupted' }); return; }
    const profile = this.profiles?.find(item => item.providerId === run.session.providerId && item.model === run.session.modelId);
    if (!profile) throw new Error('The selected Claude Agent scheme or model is unavailable. Start a new conversation.');
    const state = {}; this.runs.set(run, state);
    let terminal, result = false, messageId, streamed = new Set();
    try {
      const prompt = images.length ? (async function* () {
        yield { type: 'user', session_id: run.session.threadId || '', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'text', text }, ...images.map(image => ({ type: 'image', source: { type: 'base64', media_type: image.contentType, data: image.data } }))] } };
      })() : text;
      state.query = this.queryFactory({ prompt, options: { ...this.options(profile, state, run), ...(run.session.threadId ? { resume: run.session.threadId } : {}) } });
      for await (const message of state.query) {
        if (run.cancelRequested || run.finished || this.closing) break;
        if (message.type === 'system' && message.subtype === 'init') {
          if (typeof message.session_id !== 'string' || !message.session_id || message.session_id.length > 100) throw new Error('Claude Agent returned an invalid native session identifier.');
          if (run.session.threadId && run.session.threadId !== message.session_id) throw new Error('Claude Agent did not resume the saved session; no replacement was accepted.');
          if (!run.session.threadId) { run.session.threadId = message.session_id; await run.save(); }
        } else if (message.type === 'stream_event' && !message.parent_tool_use_id) {
          const event = message.event;
          if (event.type === 'message_start') messageId = event.message.id;
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text && messageId) {
            streamed.add(messageId); this.onEvent(run, { type: 'text', id: messageId, delta: event.delta.text });
          } else if (event.type === 'content_block_delta' && ['thinking_delta','input_json_delta'].includes(event.delta?.type)) this.onEvent(run, { type: 'progress', id: messageId, delta: event.delta.thinking || event.delta.partial_json });
        } else if (message.type === 'assistant' && !message.parent_tool_use_id && !streamed.has(message.message.id)) {
          const text = message.message.content.filter(block => block.type === 'text').map(block => block.text).join('');
          if (text) this.onEvent(run, { type: 'text', id: message.message.id, delta: text });
        } else if (message.type === 'result') {
          result = true;
          if (message.subtype !== 'success' || message.is_error !== false || !run.session.threadId) throw new Error(message.errors?.join('; ') || 'Claude Agent execution failed.');
          terminal = { type: 'done', status: 'completed' }; break;
        }
      }
      if (run.cancelRequested || this.closing) terminal = { type: 'done', status: 'interrupted' };
      else if (!result && !run.finished) throw new Error('Claude Agent ended without a completion result.');
    } catch (error) {
      terminal = run.cancelRequested || this.closing ? { type: 'done', status: 'interrupted' } : { type: 'error', error:safeError(error,this.profiles) };
    } finally {
      try { await this.dispose(state); } catch (error) { terminal = { type: 'error', error:safeError(error,this.profiles) }; }
      this.runs.delete(run);
      if (terminal && !run.finished) this.onEvent(run, run.cancelRequested ? { type: 'done', status: 'interrupted' } : terminal);
    }
  }
  async interrupt(run) { run.cancelRequested = true; try{await this.dispose(this.runs.get(run));}catch(error){throw safeError(error,this.profiles);} }
  async close() {
    this.closing = true; this.ready = false;
    try{await Promise.all([...this.runs.values(), this.probe].filter(Boolean).map(state => this.dispose(state)));}catch(error){throw safeError(error,this.profiles);}
    await this.starting?.catch(() => {});
  }
}
