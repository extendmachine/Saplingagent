import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppendMessage } from '@assistant-ui/react';
import { checkedFetch, cleanMessages, getSession, readSessionId, rememberSession, type Approval, type Message, type Request, type RuntimeStatus, type Session } from './runtime-api';
import { consumeEvents, type ServerEvent } from './sse';

type ToolActivity = { id: string; name: string; status: string };
const errorText = (error: unknown) => error instanceof Error ? error.message : '请求失败，请重试。';
const isAborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export function useSeedRuntime() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [activity, setActivity] = useState('连接本地 Agent…');
  const [tools, setTools] = useState<ToolActivity[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const session = useRef<string | null>(readSessionId());
  const running = useRef(false);
  const lastRequest = useRef<Request | null>(null);
  const stream = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const pending = useRef(new Map<string, string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setRunning = useCallback((value: boolean) => {
    running.current = value;
    setIsRunning(value);
  }, []);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!pending.current.size) return;
    const changes = [...pending.current.entries()];
    pending.current.clear();
    setMessages(current => {
      const next = [...current];
      for (const [id, delta] of changes) {
        const index = next.findIndex(message => message.id === id);
        if (index >= 0) next[index] = { ...next[index], text: next[index].text + delta, status: 'streaming' };
        else next.push({ id, role: 'assistant', text: delta, status: 'streaming' });
      }
      return next;
    });
  }, []);

  const snapshot = useCallback((saved: Session) => {
    flush();
    session.current = saved.id;
    rememberSession(saved.id);
    setMessages(cleanMessages(saved.messages));
    setApprovals(Array.isArray(saved.pendingApprovals) ? saved.pendingApprovals : []);
    if (!lastRequest.current) {
      const user = [...saved.messages].reverse().find(message => message.role === 'user');
      if (user) lastRequest.current = { sessionId: saved.id, text: user.text, requestId: user.requestId || user.id };
    }
    if (!saved.running && saved.messages.at(-1)?.status === 'failed') {
      setError(current => current || '上次执行失败，可以重试或提出新的要求。');
      setRetryable(Boolean(lastRequest.current));
    }
  }, [flush]);

  const refreshStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await checkedFetch('/api/status', { signal });
      const value = await response.json() as RuntimeStatus;
      if (signal?.aborted) return;
      setStatus(value);
    } catch (failure) {
      if (signal?.aborted || isAborted(failure)) return;
      setStatus({ ready: false, authenticated: false, error: errorText(failure) });
    }
  }, []);

  const receive = useCallback((event: ServerEvent) => {
    switch (event.type) {
      case 'session': {
        if (typeof event.sessionId === 'string') {
          session.current = event.sessionId;
          rememberSession(event.sessionId);
          if (lastRequest.current) lastRequest.current.sessionId = event.sessionId;
        }
        break;
      }
      case 'snapshot': {
        if (event.session && typeof event.session === 'object') snapshot(event.session as Session);
        break;
      }
      case 'text_delta': {
        if (typeof event.itemId !== 'string' || typeof event.delta !== 'string') throw new Error('回复增量格式不正确。');
        pending.current.set(event.itemId, (pending.current.get(event.itemId) || '') + event.delta);
        if (!timer.current) timer.current = setTimeout(flush, 50);
        setActivity('正在回复…');
        break;
      }
      case 'status': {
        if (typeof event.label === 'string') setActivity(event.label);
        break;
      }
      case 'tool': {
        if (typeof event.id !== 'string' || typeof event.name !== 'string' || typeof event.status !== 'string') break;
        const next = { id: event.id, name: event.name, status: event.status };
        setTools(current => [...current.filter(item => item.id !== next.id), next].slice(-4));
        setActivity('正在使用工具…');
        break;
      }
      case 'approval': {
        if (typeof event.id !== 'string' || typeof event.description !== 'string') break;
        const next = event as unknown as Approval;
        setApprovals(current => [...current.filter(item => item.id !== next.id), next]);
        setActivity('等待你的选择');
        break;
      }
      case 'error': {
        flush();
        setError(typeof event.message === 'string' ? event.message : 'Agent 执行失败。');
        break;
      }
      case 'done': {
        flush();
        setRunning(false);
        setApprovals([]);
        setMessages(current => current.map(message => message.status === 'streaming' ? { ...message, status: String(event.status) } : message));
        setActivity(event.status === 'interrupted' ? '已停止' : event.status === 'failed' ? '执行失败' : '');
        if (event.status === 'failed') {
          setError(current => current || 'Agent 执行失败，请重试。');
          setRetryable(Boolean(lastRequest.current));
        } else {
          setRetryable(false);
        }
        break;
      }
    }
  }, [flush, setRunning, snapshot]);

  // The backend continues a turn if the browser loses its transport. Recover its
  // persisted snapshot before subscribing, so text is never replayed twice.
  const recover = useCallback(async (signal: AbortSignal, expectedEpoch: number, requiredRequestId?: string) => {
    if (!session.current) throw new Error('会话连接中断。请重试原请求。');
    setActivity('正在恢复连接…');
    const saved = await getSession(session.current, signal);
    if (signal.aborted || epoch.current !== expectedEpoch) return;
    if (requiredRequestId && !saved.messages.some(message => message.role === 'user' && (message.id === requiredRequestId || message.requestId === requiredRequestId))) throw new Error('原请求尚未保存，请重试。');
    snapshot(saved);
    if (!saved.running) {
      setRunning(false);
      setActivity('');
      if (saved.messages.at(-1)?.status === 'failed') {
        setError(current => current || 'Agent 执行失败，请重试。');
        setRetryable(Boolean(lastRequest.current));
      }
      return;
    }
    setRunning(true);
    try {
      const response = await checkedFetch(`/api/events?sessionId=${encodeURIComponent(saved.id)}`, { signal });
      await consumeEvents(response, event => { if (!signal.aborted && epoch.current === expectedEpoch) receive(event); });
      if (!running.current || signal.aborted) return;
    } catch (failure) {
      if (signal.aborted || isAborted(failure)) return;
    }
    // Snapshot polling is a fallback for an unavailable event subscription.
    while (!signal.aborted && epoch.current === expectedEpoch && running.current) {
      const latest = await getSession(saved.id, signal);
      if (signal.aborted || epoch.current !== expectedEpoch) return;
      snapshot(latest);
      if (!latest.running) {
        setRunning(false);
        setActivity('');
        return;
      }
      setActivity('已恢复连接，等待回复…');
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }, [receive, setRunning, snapshot]);

  useEffect(() => {
    const bootstrap = new AbortController();
    const expectedEpoch = ++epoch.current;
    let statusTimer: ReturnType<typeof setInterval> | undefined;
    void (async () => {
      await refreshStatus(bootstrap.signal);
      if (bootstrap.signal.aborted) return;
      statusTimer = setInterval(() => { void refreshStatus(bootstrap.signal); }, 10000);
      try {
        // Confirm saved conversations through the public service; do not put
        // conversation content into browser storage or create a second sidebar.
        const response = await checkedFetch('/api/sessions', { signal: bootstrap.signal });
        await response.json();
        if (session.current) {
          const saved = await getSession(session.current, bootstrap.signal);
          if (bootstrap.signal.aborted) return;
          snapshot(saved);
          if (saved.running) {
            setRunning(true);
            stream.current = bootstrap;
            setIsLoading(false);
            await recover(bootstrap.signal, expectedEpoch);
          }
        }
      } catch (failure) {
        if (!bootstrap.signal.aborted && !isAborted(failure) && session.current) setError(`无法恢复上次会话：${errorText(failure)}`);
      } finally {
        if (!bootstrap.signal.aborted) {
          setIsLoading(false);
          if (!running.current) setActivity('');
        }
      }
    })();
    return () => {
      bootstrap.abort();
      stream.current?.abort();
      if (statusTimer) clearInterval(statusTimer);
      if (timer.current) clearTimeout(timer.current);
      pending.current.clear();
    };
  }, [recover, refreshStatus, setRunning, snapshot]);

  const runRequest = useCallback(async (request: Request, isRetry = false) => {
    if (running.current) return;
    const expectedEpoch = ++epoch.current;
    const controller = new AbortController();
    stream.current?.abort();
    stream.current = controller;
    lastRequest.current = request;
    setRunning(true);
    setError('');
    setRetryable(false);
    setTools([]);
    setApprovals([]);
    setActivity(isRetry ? '正在重试…' : '正在思考…');
    if (!isRetry) setMessages(current => [...current, { id: request.requestId, requestId: request.requestId, role: 'user', text: request.text }]);
    try {
      const response = await checkedFetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(request), signal: controller.signal,
      });
      const id = response.headers.get('X-Session-Id');
      if (id) { session.current = id; request.sessionId = id; rememberSession(id); }
      let ended = false;
      await consumeEvents(response, event => {
        if (controller.signal.aborted || epoch.current !== expectedEpoch) return;
        if (event.type === 'done') ended = true;
        receive(event);
      });
      if (!ended && !controller.signal.aborted) await recover(controller.signal, expectedEpoch);
      if (session.current && !running.current && !controller.signal.aborted && epoch.current === expectedEpoch) {
        snapshot(await getSession(session.current, controller.signal));
      }
    } catch (failure) {
      if (controller.signal.aborted || isAborted(failure) || epoch.current !== expectedEpoch) return;
      flush();
      try {
        await recover(controller.signal, expectedEpoch, request.requestId);
        if (!running.current) return;
      } catch { /* Keep the original actionable error when recovery also fails. */ }
      if (controller.signal.aborted || epoch.current !== expectedEpoch) return;
      setRunning(false);
      setActivity('连接失败');
      setError(errorText(failure));
      setRetryable(true);
    }
  }, [flush, receive, recover, setRunning, snapshot]);

  const onNew = useCallback(async (message: AppendMessage) => {
    const text = message.content.filter(part => part.type === 'text').map(part => part.type === 'text' ? part.text : '').join('\n').trim();
    if (!text || running.current) return;
    await runRequest({ requestId: crypto.randomUUID(), text, ...(session.current ? { sessionId: session.current } : {}) });
  }, [runRequest]);

  const onCancel = useCallback(async () => {
    if (!session.current) {
      setError('正在建立会话，稍后可停止。');
      return;
    }
    setActivity('正在停止…');
    try {
      await checkedFetch(`/api/sessions/${encodeURIComponent(session.current)}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } catch (failure) { setError(`停止失败：${errorText(failure)}`); }
  }, []);

  const startNew = useCallback(() => {
    if (running.current) return;
    ++epoch.current;
    stream.current?.abort();
    pending.current.clear();
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    session.current = null;
    lastRequest.current = null;
    rememberSession(null);
    setMessages([]);
    setTools([]);
    setApprovals([]);
    setError('');
    setRetryable(false);
    setActivity('');
  }, []);

  const retry = useCallback(async () => {
    if (lastRequest.current) await runRequest({ ...lastRequest.current }, true);
  }, [runRequest]);

  const respondApproval = useCallback(async (id: string, decision: string) => {
    setApprovalBusy(true);
    try {
      await checkedFetch(`/api/approvals/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
      setApprovals(current => current.filter(item => item.id !== id));
      setError('');
      setActivity('继续执行…');
    } catch (failure) { setError(`操作未确认：${errorText(failure)}`); }
    finally { setApprovalBusy(false); }
  }, []);

  return { messages, status, isLoading, isRunning, activity, tools, approvals, approvalBusy, error, retryable, onNew, onCancel, startNew, retry, respondApproval, refreshStatus };
}
