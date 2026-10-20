export type AttachmentMetadata = { id: string; name: string; contentType: string; size: number; kind: 'image' | 'file'; sha256?: string; url?: string };
export type Message = { id: string; role: 'user' | 'assistant'; text: string; status?: string; requestId?: string; attachments?: AttachmentMetadata[] };
export type Approval = { id: string; kind: string; description: string; choices?: (string | { label?: string; value?: string; decision?: string })[] };
export type EngineSelection = { engine: 'codex' | 'opencode' | 'claude'; providerId?: string | null; modelId?: string | null };
export type ModelOption = { id: string; label: string };
export type ProviderOption = { id: string; label: string; defaultModelId?: string | null; models: ModelOption[] };
export type EngineOption = { id: 'codex' | 'opencode' | 'claude'; label: string; ready: boolean; authenticated: boolean; model?: string; providers?: ProviderOption[]; error?: string | null };
export type ContextUsage = { usedTokens: number; contextWindow: number; updatedAt: string };
export type Session = EngineSelection & { id: string; title?: string; updatedAt?: string; messages: Message[]; running?: boolean; activeRequestId?: string | null; pendingApprovals?: Approval[]; contextUsage?: ContextUsage | null };
export type SessionSummary = EngineSelection & { id: string; title?: string; updatedAt?: string };
export type RuntimeStatus = { ready: boolean; codexReady?: boolean; defaultEngine?: 'codex' | 'opencode' | 'claude'; authenticated: boolean; provider?: string; model?: string; skills?: { name: string; description: string }[]; mcp?: { ready: boolean; tools?: { name: string; description: string }[] }; error?: string };
export type Request = EngineSelection & { requestId: string; sessionId?: string; text: string; attachmentIds?: string[] };

export const SESSION_KEY = 'seedagent.active-session.v1';
const sessionTitle = (item: SessionSummary) => item.title?.trim() || 'Untitled conversation';
const sessionTitleCollator = new Intl.Collator(['zh-CN-u-co-pinyin', 'en'], { usage: 'sort', sensitivity: 'base', numeric: true });

export function sortSessionSummaries(items: SessionSummary[]): SessionSummary[] {
  return [...items].sort((left, right) => sessionTitleCollator.compare(sessionTitle(left), sessionTitle(right)) ||
    (right.updatedAt || '').localeCompare(left.updatedAt || '') || left.id.localeCompare(right.id));
}

export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly detail?: string;
  constructor(message: string, status: number, code?: string, detail?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export function isMissingSession(error: unknown): boolean {
  // Route/proxy 404s also use NOT_FOUND. Only the workspace's explicit session
  // error confirms that its saved ID is no longer available in this service.
  return error instanceof HttpError && error.status === 404 &&
    (error.code === 'SESSION_NOT_FOUND' || error.code === 'NOT_FOUND' && error.detail === 'Session does not exist');
}

export function readSessionId(): string | null {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value && /^[a-zA-Z0-9_-]{1,180}$/.test(value) ? value : null;
  } catch { return null; }
}
export function rememberSession(id: string | null) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* Session persistence on the server remains available. */ }
}

export async function checkedFetch(url: string, options?: RequestInit): Promise<Response> {
  let response: Response;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 10000);
  const signal = options?.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
  try { response = await fetch(url, { ...options, signal }); } catch (error) {
    if (timeout.signal.aborted && !options?.signal?.aborted) throw new Error('Local service response timed out. Retry or restart the service.');
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Unable to connect to the local service. Check that the Saplingagent backend is running.');
  } finally { clearTimeout(timer); }
  if (!response.ok) {
    let message: string | undefined;
    let code: string | undefined;
    try {
      const body = await response.json();
      message = typeof body.error === 'string' ? body.error : typeof body.error?.message === 'string' ? body.error.message : typeof body.message === 'string' ? body.message : undefined;
      code = typeof body.error?.code === 'string' ? body.error.code : undefined;
    } catch { /* A proxy failure may return HTML, not JSON. */ }
    throw new HttpError(message || (response.status === 404 ? 'Session or service endpoint does not exist.' : `Local service request failed (${response.status}).`), response.status, code, message);
  }
  return response;
}

export async function getSession(id: string, signal?: AbortSignal): Promise<Session> {
  const response = await checkedFetch(`/api/sessions/${encodeURIComponent(id)}`, { signal });
  const body = await response.json();
  if (!body.session || body.session.id !== id || !Array.isArray(body.session.messages)) throw new Error('Invalid saved session format.');
  return body.session;
}

export async function getSessions(signal?: AbortSignal): Promise<SessionSummary[]> {
  const response = await checkedFetch('/api/sessions', { signal });
  const body = await response.json();
  if (!Array.isArray(body.sessions)) throw new Error('Invalid conversation list format.');
  return sortSessionSummaries(body.sessions.filter((item: unknown): item is SessionSummary => {
    if (!item || typeof item !== 'object') return false;
    const value = item as Partial<SessionSummary>;
    return typeof value.id === 'string' && /^[a-zA-Z0-9_-]{1,180}$/.test(value.id);
  }));
}

export async function renameSession(id: string, title: string): Promise<Session> {
  const response = await checkedFetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
  });
  const body = await response.json();
  if (!body.session || body.session.id !== id || typeof body.session.title !== 'string') throw new Error('Invalid renamed conversation format.');
  return body.session;
}

export function cleanMessages(messages: Message[]): Message[] {
  return messages.filter(message => message && typeof message.id === 'string' && (message.role === 'user' || message.role === 'assistant') && typeof message.text === 'string');
}
