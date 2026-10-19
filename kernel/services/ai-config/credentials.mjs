import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { failure } from './store.mjs';

export const credentialLimit = 32768;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function secret(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 16384 || /[\x00-\x20\x7f]/.test(value)) throw failure('INVALID_CREDENTIALS', 'Credential strings are missing or invalid.');
  return value;
}
export function parseCredentialJSON(text) {
  if (typeof text !== 'string') throw failure('INVALID_CREDENTIALS', 'Choose a credential JSON file.');
  if (Buffer.byteLength(text, 'utf8') > credentialLimit) throw failure('CREDENTIALS_TOO_LARGE', 'Credential files must be no larger than 32 KiB.');
  let value;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw failure('INVALID_CREDENTIALS', 'The selected file is not valid credential JSON.'); }
  if (!object(value)) throw failure('INVALID_CREDENTIALS', 'Credentials must be a JSON object.');
  return value;
}
export function codexCredentials(value) {
  if (!object(value.tokens) || value.auth_mode && value.auth_mode !== 'chatgpt') throw failure('UNSUPPORTED_AUTH', 'Choose a Codex ChatGPT auth.json with account tokens. API keys use the API tab.');
  const tokens = Object.fromEntries(['id_token', 'access_token', 'refresh_token'].map(key => [key, secret(value.tokens[key])]));
  if (value.tokens.account_id != null) tokens.account_id = secret(value.tokens.account_id);
  const result = { auth_mode: 'chatgpt', OPENAI_API_KEY: null, tokens };
  if (value.last_refresh != null) {
    if (typeof value.last_refresh !== 'string' || value.last_refresh.length > 80 || !Number.isFinite(Date.parse(value.last_refresh))) throw failure('INVALID_CREDENTIALS', 'The credential refresh date is invalid.');
    result.last_refresh = value.last_refresh;
  }
  return result;
}
export function claudeCredentials(value) {
  if (value.claudeAiOauth || value.tokens || value.CLAUDE_CODE_OAUTH_TOKEN || value.env?.CLAUDE_CODE_OAUTH_TOKEN) throw failure('UNSUPPORTED_AUTH', 'Claude subscription login files are not supported. Import a Claude API key JSON or configure an API provider.');
  const apiKey = secret(value.apiKey ?? value.ANTHROPIC_API_KEY ?? value.env?.ANTHROPIC_API_KEY);
  return { apiKey, baseUrl: value.baseUrl ?? value.ANTHROPIC_BASE_URL ?? value.env?.ANTHROPIC_BASE_URL, model: value.model ?? value.ANTHROPIC_MODEL ?? value.env?.ANTHROPIC_MODEL };
}
async function readDocument(file, missingCode, missingMessage) {
  let handle;
  try {
    // Bounded reads even when a file grows after stat; never run credential helpers.
    handle = await fs.open(file, 'r');
    if (!(await handle.stat()).isFile()) throw failure('LOCAL_AUTH_UNREADABLE', 'The local credential source is not a normal file.', 500);
    const buffer = Buffer.alloc(credentialLimit + 1); let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > credentialLimit) throw failure('CREDENTIALS_TOO_LARGE', 'Credential files must be no larger than 32 KiB.');
    return parseCredentialJSON(buffer.subarray(0, size).toString('utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw failure(missingCode, missingMessage, 404);
    if (error.status) throw error;
    throw failure('LOCAL_AUTH_UNREADABLE', 'Cannot read local credentials. Check file access or use a JSON upload.', 500);
  } finally { await handle?.close(); }
}

export class CredentialImport {
  constructor(store, { home = os.homedir(), env = process.env } = {}) { Object.assign(this, { store, home, env }); }
  async run(input) {
    if (this.busy) throw failure('IMPORT_BUSY', 'Another credential import is running. Wait for it to finish.', 409);
    if (!['codex', 'claude'].includes(input.engine) || !['local', 'upload'].includes(input.source) || !Number.isSafeInteger(input.revision) || input.revision < 0 || input.replace !== undefined && typeof input.replace !== 'boolean') throw failure('INVALID_CONFIG', 'Choose an import method and reload configuration before importing.');
    this.busy = true;
    try {
      let value;
      if (input.source === 'upload') value = parseCredentialJSON(input.json);
      else if (input.engine === 'codex') value = await readDocument(path.join(this.env.CODEX_HOME || path.join(this.home, '.codex'), 'auth.json'), 'LOCAL_AUTH_NOT_FOUND', 'No local Codex auth.json was found. Keychain or desktop-only login cannot be imported this way; use official sign-in or upload auth.json.');
      else if (this.env.ANTHROPIC_API_KEY) value = { ANTHROPIC_API_KEY: this.env.ANTHROPIC_API_KEY, baseUrl: this.env.ANTHROPIC_BASE_URL, model: this.env.ANTHROPIC_MODEL };
      else {
        value = await readDocument(path.join(this.env.CLAUDE_CONFIG_DIR || path.join(this.home, '.claude'), 'settings.json'), 'LOCAL_API_NOT_FOUND', 'No local Claude API settings were found. Set ANTHROPIC_API_KEY in the launcher terminal, upload an API key JSON or enter a key. Subscription/keychain login is not imported.');
        if (!value.env?.ANTHROPIC_API_KEY) throw failure('LOCAL_API_NOT_FOUND', 'Local Claude settings contain no API key. Upload an API key JSON or enter a key; subscription login and apiKeyHelper are not imported.', 404);
        value = { ANTHROPIC_API_KEY:value.env.ANTHROPIC_API_KEY, baseUrl:value.env.ANTHROPIC_BASE_URL, model:value.model || value.env.ANTHROPIC_MODEL };
      }
      if (input.engine === 'codex') return await this.store.importCodex(input, codexCredentials(value));
      return await this.store.importClaude(input, claudeCredentials(value));
    } finally { this.busy = false; }
  }
}
