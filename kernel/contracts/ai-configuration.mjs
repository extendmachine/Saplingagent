import {ensureNativeConfigurationCommitted} from './configuration-write.mjs';
import {connectionsFile,codexAuthFile,withConfigurationSnapshot,readConfigurationFiles} from './configuration-transaction.mjs';
import path from 'node:path';
export const connectionsPath = root => path.join(root, 'local-secrets/ai-config/connections.json');
export const credentialPath = (root, id) => {
  if (!/^[a-z0-9-]{1,80}$/.test(id)) throw new Error('Invalid AI profile ID');
  return path.join(root, 'local-secrets/api-keys', `ai-${id}.json`);
};
function validProfile(profile) {
  if (!profile || !/^[a-z0-9-]{1,80}$/.test(profile.id) || !['codex','opencode','claude'].includes(profile.engine) || !['api','chatgpt','subscription'].includes(profile.kind) || typeof profile.label !== 'string' || !profile.label.trim() || profile.label.length > 80 || /[\x00-\x1f\x7f]/.test(profile.label)) return false;
  if (profile.kind === 'chatgpt') return profile.engine === 'codex';
  if (profile.kind === 'subscription') return profile.engine === 'claude' && ['protocol','baseUrl','noAuth','contextWindow','maxOutput','apiKey','oauthToken'].every(key => !Object.hasOwn(profile,key)) && typeof profile.model === 'string' && Boolean(profile.model.trim()) && profile.model.length <= 240 && !/[\x00-\x1f\x7f]/.test(profile.model);
  if (!['chat','responses','anthropic'].includes(profile.protocol) || (profile.engine === 'codex' && profile.protocol !== 'responses') || (profile.engine === 'claude' && profile.protocol !== 'anthropic') || typeof profile.noAuth !== 'boolean' || typeof profile.model !== 'string' || !profile.model.trim() || profile.model.length > 240 || /[\x00-\x1f\x7f]/.test(profile.model)) return false;
  try {
    const url = new URL(profile.baseUrl);
    if (typeof profile.baseUrl !== 'string' || profile.baseUrl.length > 2000 || !['http:','https:'].includes(url.protocol) || url.username || url.password || url.hash || [...url.searchParams.keys()].some(key=>/^(api[_-]?key|key|token|access_token)$/i.test(key)) || /\/(chat\/completions|responses|messages|models)\/?$/.test(url.pathname)) return false;
  } catch { return false; }
  return Number.isInteger(profile.contextWindow) && profile.contextWindow >= 4096 && profile.contextWindow <= 4000000 && Number.isInteger(profile.maxOutput) && profile.maxOutput >= 1 && profile.maxOutput <= profile.contextWindow;
}
export async function readConnections(root) {
  const [bytes]=await readConfigurationFiles(root,[connectionsFile]);
  return parseConnections(bytes);
}
function parseConnections(bytes) {
  if(bytes===null)return {schemaVersion:1,revision:0,activeId:null,profiles:[]};
  let value;
  try{value=JSON.parse(bytes);}catch{throw new Error('AI configuration cannot be read. Preserve and repair local-secrets/ai-config/connections.json.');}
  if (value?.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.profiles) || value.profiles.some(p => !validProfile(p)) || new Set(value.profiles.map(p => p.id)).size !== value.profiles.length || (value.activeId !== null && !value.profiles.some(p => p.id === value.activeId))) throw new Error('Saved AI configuration has an invalid structure; preserve and repair it.');
  return { schemaVersion:1, revision:value.revision, activeId:value.activeId, profiles:value.profiles };
}
export function defaultSelection(connections) {
  const profile = connections.profiles.find(p => p.id === connections.activeId);
  return profile && profile.engine !== 'codex' ? { engine: profile.engine, providerId: `sapling-${profile.id}`, modelId: profile.model } : { engine: 'codex', providerId: null, modelId: null };
}
const unavailable = () => Object.assign(Error('A saved AI credential is unavailable. Reconfigure that scheme in the setup page.'), {code:'CREDENTIAL_UNAVAILABLE'});
const changed = () => Object.assign(Error('AI configuration changed. Reload configuration.'), {code:'CONFIG_CHANGED',status:409});

async function secretFor(readFile, profile) {
  if (!['api','subscription'].includes(profile.kind) || profile.noAuth) return null;
  try {
    const data = JSON.parse(await readFile(`api-keys/ai-${profile.id}.json`));
    const value = profile.kind === 'subscription' ? data.oauthToken : data.apiKey;
    if (typeof value !== 'string' || !value.trim()) throw unavailable();
    if (profile.kind === 'subscription' && (profile.engine !== 'claude' || value.length > 8192 || /[\s\x00-\x1f\x7f]/.test(value))) throw unavailable();
    return value;
  } catch { throw unavailable(); }
}

async function accountStatus(readFile) {
  const absent = {saved:false,chatgpt:false,type:null};
  try {
    const bytes = await readFile(codexAuthFile);
    if (bytes === null) return absent;
    const auth = JSON.parse(bytes);
    const present = value => typeof value === 'string' && Boolean(value.trim());
    const chatgpt = present(auth?.tokens?.access_token) && present(auth?.tokens?.refresh_token);
    if (chatgpt || present(auth?.OPENAI_API_KEY)) return {saved:true,chatgpt,type:chatgpt?'chatgpt':'apiKey'};
  } catch { /* The setup page still offers explicit replacement. */ }
  return {...absent,repairRequired:true};
}

// A query reads the profile index once. Each credential and the account status
// use the same committed snapshot, even when another window edits settings.
export function withAIConnections(root, query, revision) {
  return withConfigurationSnapshot(root, async readFile => {
    const data = parseConnections(await readFile(connectionsFile));
    if (revision !== undefined && data.revision !== revision) throw changed();
    return query(data, profile => secretFor(readFile,profile), () => accountStatus(readFile));
  });
}

export function readCredential(root, profile) {
  if (!['api','subscription'].includes(profile.kind) || profile.noAuth) return Promise.resolve(null);
  return withAIConnections(root, (data, secret) => {
    const saved = data.profiles.find(p=>p.id===profile.id);
    if (!saved || saved.kind!==profile.kind || saved.noAuth || profile.kind==='api' && new URL(saved.baseUrl).origin!==new URL(profile.baseUrl).origin) throw unavailable();
    if (saved.engine!==profile.engine || saved.protocol!==profile.protocol || saved.model!==profile.model || saved.baseUrl!==profile.baseUrl) throw changed();
    return secret(saved);
  });
}
export function codexCredentialStatus(root) {
  return withConfigurationSnapshot(root, accountStatus);
}
export async function codexConnection(root, connections) {
  await ensureNativeConfigurationCommitted(root);
  return withAIConnections(root, async (current, secret) => {
    const profile = current.profiles.find(p => p.id === current.activeId && p.engine === 'codex');
    if (!profile || profile.kind === 'chatgpt') return { args: profile ? ['-c','model_provider="openai"'] : [], env: {}, profile: profile || null };
    const key = await secret(profile);
    const fields = { model_provider: 'sapling_custom', model: profile.model, 'model_providers.sapling_custom.name': profile.label, 'model_providers.sapling_custom.base_url': profile.baseUrl, 'model_providers.sapling_custom.wire_api': 'responses', 'model_providers.sapling_custom.requires_openai_auth': false, ...(key ? { 'model_providers.sapling_custom.env_key': 'SAPLING_CODEX_API_KEY' } : {}) };
    return { args: Object.entries(fields).flatMap(([name,value]) => ['-c', `${name}=${JSON.stringify(value)}`]), env: key ? { SAPLING_CODEX_API_KEY: key } : {}, profile };
  },connections.revision);
}
async function availableCredentials(current, engine, secret) {
  const candidates = current.profiles.filter(p=>p.engine===engine);
  const entries = await Promise.all(candidates.map(async profile => {
    try { return {profile,key:await secret(profile)}; }
    catch(error) { if(error.code==='CREDENTIAL_UNAVAILABLE')return null;throw error; }
  }));
  const available = entries.filter(Boolean);
  if (candidates.length && !available.length) throw unavailable();
  return available;
}
export function openCodeConnections(root, connections) {
  return withAIConnections(root, async (current,secret) => {
    const provider = {};
    for (const {profile,key} of await availableCredentials(current,'opencode',secret)) {
      const npm = { chat: '@ai-sdk/openai-compatible', responses: '@ai-sdk/openai', anthropic: '@ai-sdk/anthropic' }[profile.protocol];
      provider[`sapling-${profile.id}`] = { npm, name: profile.label, options: { baseURL: profile.baseUrl, apiKey: key || 'anonymous-local-endpoint' }, models: { [profile.model]: { name: profile.model, tool_call: true, limit: { context: profile.contextWindow || 128000, output: profile.maxOutput || 16384 } } } };
    }
    return provider;
  },connections.revision);
}
export function claudeConnections(root, connections) {
  return withAIConnections(root, async (current,secret) => {
    const available = await availableCredentials(current,'claude',secret);
    return available.map(({profile,key})=>({
      ...profile,providerId:`sapling-${profile.id}`,
      ...(profile.kind==='subscription'?{oauthToken:key,sdkBaseUrl:null}:{apiKey:key,sdkBaseUrl:profile.baseUrl.replace(/\/v1\/?$/,'')}),
    }));
  },connections.revision);
}
