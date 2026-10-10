export type Message = { id: string; role: 'user' | 'assistant'; text: string; status?: string; requestId?: string };
export type Approval = { id: string; kind: string; description: string; choices?: (string | { label?: string; value?: string; decision?: string })[] };
export type Session = { id: string; title?: string; messages: Message[]; running?: boolean; activeRequestId?: string | null; pendingApprovals?: Approval[] };
export type RuntimeStatus = { ready: boolean; authenticated: boolean; provider?: string; model?: string; skills?: { name: string; description: string }[]; mcp?: { ready: boolean; tools?: { name: string; description: string }[] }; error?: string };
export type Request = { requestId: string; sessionId?: string; text: string };

export const SESSION_KEY = 'seedagent.active-session.v1';

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
    if (timeout.signal.aborted && !options?.signal?.aborted) throw new Error('本地服务响应超时，请重试或重新启动服务。');
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('本地服务连接失败。请确认 Saplingagent 后端正在运行。');
  } finally { clearTimeout(timer); }
  if (!response.ok) {
    let message: string | undefined;
    let code: string | undefined;
    try {
      const body = await response.json();
      message = typeof body.error === 'string' ? body.error : typeof body.error?.message === 'string' ? body.error.message : typeof body.message === 'string' ? body.message : undefined;
      code = typeof body.error?.code === 'string' ? body.error.code : undefined;
    } catch { /* A proxy failure may return HTML, not JSON. */ }
    throw new HttpError(message || (response.status === 404 ? '会话或服务接口不存在。' : `本地服务请求失败（${response.status}）。`), response.status, code, message);
  }
  return response;
}

export async function getSession(id: string, signal?: AbortSignal): Promise<Session> {
  const response = await checkedFetch(`/api/sessions/${encodeURIComponent(id)}`, { signal });
  const body = await response.json();
  if (!body.session || body.session.id !== id || !Array.isArray(body.session.messages)) throw new Error('保存的会话格式不正确。');
  return body.session;
}

export function cleanMessages(messages: Message[]): Message[] {
  return messages.filter(message => message && typeof message.id === 'string' && (message.role === 'user' || message.role === 'assistant') && typeof message.text === 'string');
}
