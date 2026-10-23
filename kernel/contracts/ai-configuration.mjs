import fs from 'node:fs/promises';
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
  let value;
  try { value = JSON.parse(await fs.readFile(connectionsPath(root), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, revision: 0, activeId: null, profiles: [] }; throw new Error('AI configuration cannot be read. Preserve and repair local-secrets/ai-config/connections.json.'); }
  if (value?.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.profiles) || value.profiles.some(p => !validProfile(p)) || new Set(value.profiles.map(p => p.id)).size !== value.profiles.length || (value.activeId !== null && !value.profiles.some(p => p.id === value.activeId))) throw new Error('Saved AI configuration has an invalid structure; preserve and repair it.');
  return { schemaVersion:1, revision:value.revision, activeId:value.activeId, profiles:value.profiles };
}
export function defaultSelection(connections) {
  const profile = connections.profiles.find(p => p.id === connections.activeId);
  return profile && profile.engine !== 'codex' ? { engine: profile.engine, providerId: `sapling-${profile.id}`, modelId: profile.model } : { engine: 'codex', providerId: null, modelId: null };
}
export async function readCredential(root, profile) {
  if (!['api','subscription'].includes(profile.kind) || (profile.kind === 'api' && profile.noAuth)) return null;
  try {
    const data = JSON.parse(await fs.readFile(credentialPath(root, profile.id), 'utf8'));
    const value = profile.kind === 'subscription' ? data.oauthToken : data.apiKey;
    if (typeof value !== 'string' || !value) throw new Error();
    if (profile.kind === 'subscription' && (profile.engine !== 'claude' || !value.trim() || value.length > 8192 || /[\s\x00-\x1f\x7f]/.test(value))) throw new Error();
    return value;
  } catch { throw new Error('A saved AI credential is unavailable. Reconfigure that scheme in the setup page.'); }
}
export async function codexConnection(root, connections) {
  const profile = connections.profiles.find(p => p.id === connections.activeId && p.engine === 'codex');
  if (!profile || profile.kind === 'chatgpt') return { args: profile ? ['-c','model_provider="openai"'] : [], env: {}, profile: profile || null };
  const key = await readCredential(root, profile);
  const fields = { model_provider: 'sapling_custom', model: profile.model, 'model_providers.sapling_custom.name': profile.label, 'model_providers.sapling_custom.base_url': profile.baseUrl, 'model_providers.sapling_custom.wire_api': 'responses', 'model_providers.sapling_custom.requires_openai_auth': false, ...(key ? { 'model_providers.sapling_custom.env_key': 'SAPLING_CODEX_API_KEY' } : {}) };
  return { args: Object.entries(fields).flatMap(([name,value]) => ['-c', `${name}=${JSON.stringify(value)}`]), env: key ? { SAPLING_CODEX_API_KEY: key } : {}, profile };
}
export async function openCodeConnections(root, connections) {
  const provider = {};
  for (const profile of connections.profiles.filter(p => p.engine === 'opencode')) {
    const key = await readCredential(root, profile);
    const npm = { chat: '@ai-sdk/openai-compatible', responses: '@ai-sdk/openai', anthropic: '@ai-sdk/anthropic' }[profile.protocol];
    if (!npm) throw new Error('Saved OpenCode protocol is invalid. Reconfigure that scheme.');
    provider[`sapling-${profile.id}`] = { npm, name: profile.label, options: { baseURL: profile.baseUrl, apiKey: key || 'anonymous-local-endpoint' }, models: { [profile.model]: { name: profile.model, tool_call: true, limit: { context: profile.contextWindow || 128000, output: profile.maxOutput || 16384 } } } };
  }
  return provider;
}

export async function codexCredentialStatus(root) {
  try {
    const auth = JSON.parse(await fs.readFile(path.join(root,'local-secrets/codex/auth.json'),'utf8'));
    const chatgpt = Boolean(auth.tokens?.access_token && auth.tokens?.refresh_token);
    return { saved:chatgpt || Boolean(auth.OPENAI_API_KEY),chatgpt,type:chatgpt?'chatgpt':auth.OPENAI_API_KEY?'apiKey':null };
  } catch(error) { if(error.code==='ENOENT')return {saved:false,chatgpt:false,type:null};throw new Error('Local Codex credentials cannot be read; preserve and repair the file.'); }
}

export async function claudeConnections(root, connections) {
  return Promise.all(connections.profiles.filter(p => p.engine === 'claude').map(async profile => ({
    ...profile, providerId: `sapling-${profile.id}`,
    ...(profile.kind === 'subscription'
      ? { oauthToken: await readCredential(root, profile), sdkBaseUrl: null }
      : { apiKey: await readCredential(root, profile), sdkBaseUrl: profile.baseUrl.replace(/\/v1\/?$/, '') }),
  })));
}
