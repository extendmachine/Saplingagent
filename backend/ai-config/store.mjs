import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { connectionsPath, credentialPath, readConnections, readCredential, codexCredentialStatus } from '../../contracts/ai-configuration.mjs';
export const failure = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const text = (value, field, max = 240) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw failure('INVALID_CONFIG', `Enter a valid ${field}.`);
  return value.trim();
};
export function validateProfile(input, previous) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure('INVALID_CONFIG', 'Enter a configuration scheme.');
  const engine = input.engine, kind = input.kind || 'api';
  if (!['codex','opencode','claude'].includes(engine) || !['api','chatgpt'].includes(kind)) throw failure('INVALID_CONFIG','Select a supported engine and authentication method.');
  const id = input.id || (kind === 'chatgpt' ? 'codex-account' : randomUUID());
  if (!/^[a-z0-9-]{1,80}$/.test(id) || (id === 'codex-account' && kind !== 'chatgpt')) throw failure('INVALID_CONFIG', 'Invalid scheme ID.');
  if (kind === 'chatgpt') {
    if (engine !== 'codex') throw failure('INVALID_CONFIG', 'ChatGPT account login uses Codex.');
    return { id, label: text(input.label || 'ChatGPT account', 'scheme name',80), engine, kind };
  }
  const protocol = input.protocol;
  if (!['chat','responses','anthropic'].includes(protocol) || (engine === 'codex' && protocol !== 'responses') || (engine === 'claude' && protocol !== 'anthropic')) throw failure('INVALID_CONFIG', 'Codex requires Responses API; Claude Agent requires Anthropic Messages; OpenCode supports all three protocols.');
  let url;
  try { url = new URL(text(input.baseUrl,'API Base URL',2000)); } catch { throw failure('INVALID_CONFIG','Enter a complete http:// or https:// API Base URL.'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.hash || [...url.searchParams.keys()].some(key => /^(api[_-]?key|key|token|access_token)$/i.test(key))) throw failure('INVALID_CONFIG','Use an HTTP(S) API Base URL without embedded credentials or fragments.');
  if (/\/(chat\/completions|responses|messages|models)\/?$/.test(url.pathname)) throw failure('INVALID_CONFIG','Enter the API Base URL, without /responses, /chat/completions, /messages or /models.');
  const noAuth = input.noAuth === true;
  if (input.apiKey !== undefined && typeof input.apiKey !== 'string') throw failure('INVALID_CONFIG', 'API key must be text.');
  if (typeof input.apiKey === 'string' && (input.apiKey.length > 8192 || /[\r\n\x00]/.test(input.apiKey))) throw failure('INVALID_CONFIG', 'API key contains invalid characters.');
  if (!noAuth && !input.apiKey?.trim() && (!previous || previous.noAuth || previous.kind !== 'api')) throw failure('KEY_REQUIRED','Enter an API key, or select an endpoint that requires no authentication.');
  const contextWindow = input.contextWindow === undefined ? 128000 : Number(input.contextWindow);
  const maxOutput = input.maxOutput === undefined ? 16384 : Number(input.maxOutput);
  if (!Number.isInteger(contextWindow) || contextWindow < 4096 || contextWindow > 4000000 || !Number.isInteger(maxOutput) || maxOutput < 1 || maxOutput > contextWindow) throw failure('INVALID_CONFIG','Enter valid context and output token limits (output must not exceed context).');
  return { id, label: text(input.label,'scheme name',80), engine, kind, protocol, baseUrl: url.href.replace(/\/$/,''), model: text(input.model,'model ID'), noAuth, contextWindow, maxOutput };
}
export async function privateDirectory(folder) {
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  if (!(await fs.lstat(folder)).isDirectory() || (await fs.lstat(folder)).isSymbolicLink()) throw failure('CONFIG_STORAGE_ERROR','Configuration folder must be a normal directory.',500);
  await fs.chmod(folder,0o700);
}
async function atomicJSON(file, value) {
  try { if (!(await fs.lstat(file)).isFile()) throw failure('CONFIG_STORAGE_ERROR','Configuration file must be a normal file.',500); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temp = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n',{ flag:'wx',mode:0o600 }); await fs.rename(temp,file); await fs.chmod(file,0o600); }
  finally { await fs.rm(temp,{force:true}); }
}
export class ConfigurationStore {
  constructor(root) { this.root = root; }
  async state() {
    const data = await readConnections(this.root);
    const profiles = await Promise.all(data.profiles.map(async profile => ({ ...Object.fromEntries(['id','label','engine','kind','protocol','baseUrl','model','noAuth','contextWindow','maxOutput'].filter(key=>profile[key]!==undefined).map(key=>[key,profile[key]])), hasKey: profile.kind === 'api' && !profile.noAuth && await readCredential(this.root,profile).then(()=>true,()=>false) })));
    return { revision:data.revision, activeId:data.activeId, profiles, codex: await codexCredentialStatus(this.root) };
  }
  async write(work, revision) {
    const directory = path.dirname(connectionsPath(this.root));
    for (const folder of ['local-secrets','local-secrets/ai-config','local-secrets/api-keys','local-secrets/notes']) await privateDirectory(path.join(this.root,folder));
    const lock = path.join(directory,'write.lock'); let handle;
    try { handle = await fs.open(lock,'wx',0o600); }
    catch (error) { if (error.code === 'EEXIST') throw failure('CONFIG_BUSY','Another configuration write is running. Retry after it finishes.',409); throw error; }
    try {
      const data = await readConnections(this.root);
      if (revision !== undefined && revision !== data.revision) throw failure('CONFIG_CHANGED','Configuration changed. Reload it before saving.',409);
      const ledgerFile = path.join(this.root,'local-secrets/notes/project-secrets.json');
      let ledger = { schema_version:1, project:{ name:'Saplingagent',root:this.root },credentials:[] };
      try { ledger = JSON.parse(await fs.readFile(ledgerFile,'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw failure('CONFIG_STORAGE_ERROR','Credential ledger cannot be read; preserve and repair it.',500); }
      if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger) || (ledger.credentials !== undefined && !Array.isArray(ledger.credentials))) throw failure('CONFIG_STORAGE_ERROR','Credential ledger has an invalid structure.',500);
      ledger.credentials ||= [];
      await work(data,ledger);
      data.revision++; await atomicJSON(ledgerFile,ledger); await atomicJSON(connectionsPath(this.root),data);
      return this.state();
    } catch (error) { if (error.code && error.status) throw error; throw failure('CONFIG_STORAGE_ERROR','Unable to save configuration. Check the project folder and reload the page to inspect its state.',500); }
    finally { await handle.close(); await fs.rm(lock,{force:true}); }
  }
  async save(input) {
    return this.write(async(data,ledger)=> {
      const previous = data.profiles.find(p=>p.id===input.id);
      if (input.id && !previous && input.id !== 'codex-account') throw failure('NOT_FOUND','Saved scheme no longer exists.',404);
      const profile = validateProfile(input,previous);
      if (profile.kind === 'chatgpt' && !(await codexCredentialStatus(this.root)).chatgpt) throw failure('LOGIN_REQUIRED','Sign in with your ChatGPT account first. API-key credentials are a separate method.');
      if (profile.kind === 'api') {
        const file = credentialPath(this.root,profile.id);
        if (!profile.noAuth && input.apiKey?.trim()) await atomicJSON(file,{apiKey:input.apiKey.trim()});
        if (!profile.noAuth) await readCredential(this.root,profile);
        const entry = { id:`ai-${profile.id}`, category:'api-key',service:profile.engine === 'codex' ? 'agent-runtime/Codex' : profile.engine === 'claude' ? 'agent-runtime/Claude Agent' : 'agent-runtime/OpenCode',environment:'local',purpose:profile.label,credential_file:`../api-keys/ai-${profile.id}.json`,official_reference:'backend/ai-config/REFERENCES.md',status:profile.noAuth ? 'disabled' : 'configured',updated_at:new Date().toISOString() };
        const index=ledger.credentials.findIndex(e=>e.id===entry.id);if(index<0)ledger.credentials.push(entry);else ledger.credentials[index]={...ledger.credentials[index],...entry};
        // Turning off authentication retains the old private key as a disabled
        // reference rather than deleting credentials during scheme editing.
      } else {
        const entry={id:'codex-account',category:'account-login',service:'agent-runtime/Codex',environment:'local',purpose:'Project-local ChatGPT account login',credential_file:'../codex/auth.json',official_reference:'backend/ai-config/REFERENCES.md',status:'configured',updated_at:new Date().toISOString()};
        const index=ledger.credentials.findIndex(e=>e.id===entry.id);if(index<0)ledger.credentials.push(entry);else ledger.credentials[index]={...ledger.credentials[index],...entry};
      }
      const index=data.profiles.findIndex(p=>p.id===profile.id);if(index<0)data.profiles.push(profile);else data.profiles[index]=profile;
      if(input.activate !== false)data.activeId=profile.id;
    },input.revision);
  }
  async activate(input) { return this.write(async data=> { if(!data.profiles.some(p=>p.id===input.id))throw failure('NOT_FOUND','Scheme not found.',404);data.activeId=input.id; },input.revision); }
  async models(input) {
    const data=await readConnections(this.root); const previous=data.profiles.find(p=>p.id===input.id);
    const profile=validateProfile({ ...input,model:input.model || 'model-discovery' },previous);
    const key=profile.noAuth ? null : input.apiKey?.trim() || await readCredential(this.root,profile);
    const headers=key ? profile.protocol==='anthropic' ? {'x-api-key':key,'anthropic-version':'2023-06-01'} : {Authorization:`Bearer ${key}`} : {};
    const url=new URL(profile.baseUrl);url.pathname=url.pathname.replace(/\/$/,'')+'/models';
    let response;
    try {response=await fetch(url,{headers,redirect:'manual',signal:AbortSignal.timeout(8000)});}catch{throw failure('PROVIDER_UNREACHABLE','Cannot reach the model catalog. Check the API Base URL, network and TLS configuration.',502);}
    if(!response.ok){await response.body?.cancel();throw failure('PROVIDER_HTTP_ERROR',`Model catalog returned HTTP ${response.status}. Check the API URL and credentials, or enter a model ID manually.`,502);}
    const chunks=[];let bytes=0;
    try {for await(const chunk of response.body){bytes+=chunk.length;if(bytes>1024*1024)throw Error();chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!Array.isArray(body.data))throw Error();
      return { models:body.data.filter(m=>typeof m?.id==='string'&&m.id.length<=240&&!/[\x00-\x1f]/.test(m.id)).slice(0,200).map(m=>({id:m.id,name:typeof m.display_name==='string'?m.display_name:m.id})) };
    }catch{throw failure('INVALID_MODEL_CATALOG','The endpoint did not return a supported model list. Enter a model ID manually.',502);}
  }
}
