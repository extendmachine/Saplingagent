import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppendMessage } from '@assistant-ui/react';
import { checkedFetch, cleanMessages, getSession, getSessions, isMissingSession, readSessionId, rememberSession, renameSession as saveSessionTitle, sortSessionSummaries, type Approval, type ContextUsage, type EngineOption, type EngineSelection, type Message, type Request, type RuntimeStatus, type Session, type SessionSummary } from './runtime-api';
import { consumeEvents, type ServerEvent } from './sse';

type ToolActivity = { id: string; name: string; status: string };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Request failed. Please try again.';
const isAborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export function useSeedRuntime() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [activity, setActivity] = useState('Connecting to local Agent…');
  const [tools, setTools] = useState<ToolActivity[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [engines, setEngines] = useState<EngineOption[]>([]);
  const [selection, setSelectionState] = useState<EngineSelection>({ engine: 'codex', providerId: null, modelId: null });
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => readSessionId());
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState('');
  const selectionChosen = useRef(false);
  const setSelection = useCallback((value: EngineSelection) => { selectionChosen.current=true; setSelectionState(value); }, []);
  const session = useRef<string | null>(readSessionId());
  const running = useRef(false);
  const restarting = useRef(false);
  const lastRequest = useRef<Request | null>(null);
  const messageAttachments = useRef(new Map<string, import('./runtime-api').AttachmentMetadata[]>());
  const stream = useRef<AbortController | null>(null);
  const listEpoch = useRef(0);
  const titleWrites = useRef(new Map<string, Promise<Session>>());
  const titleVersions = useRef(new Map<string, number>());
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

  const currentTarget = useCallback((signal: AbortSignal, expectedEpoch: number, id: string | null) =>
    !signal.aborted && epoch.current === expectedEpoch && session.current === id, []);

  const detachMissingSession = useCallback((failure: unknown, id: string | null, signal: AbortSignal, expectedEpoch: number) => {
    if (!id || !isMissingSession(failure) || !currentTarget(signal, expectedEpoch, id)) return false;
    flush();
    session.current = null;
    setActiveSessionId(null);
    // Another same-origin tab may have already stored a different conversation.
    if (readSessionId() === id) rememberSession(null);
    if (lastRequest.current?.sessionId === id) {
      const { sessionId: _obsolete, ...request } = lastRequest.current;
      lastRequest.current = request;
    }
    setRunning(false);
    setApprovals([]);
    setActivity('');
    setError(lastRequest.current ? 'This session does not exist in the current service. Your input is retained; retry to continue in a new session.' : 'The previous session does not exist in the current service. Send a message to start a new session.');
    setRetryable(Boolean(lastRequest.current));
    return true;
  }, [currentTarget, flush, setRunning]);

  const snapshot = useCallback((saved: Session) => {
    flush();
    session.current = saved.id;
    setActiveSessionId(saved.id);
    rememberSession(saved.id);
    setSessions(current => sortSessionSummaries(current.some(item => item.id === saved.id)
      ? current.map(item => item.id === saved.id ? { ...item, title: saved.title ?? item.title, updatedAt: saved.updatedAt ?? item.updatedAt } : item)
      : [...current, { id: saved.id, title: saved.title, updatedAt: saved.updatedAt, engine: saved.engine || 'codex', providerId: saved.providerId, modelId: saved.modelId }]));
    setMessages(cleanMessages(saved.messages));
    setApprovals(Array.isArray(saved.pendingApprovals) ? saved.pendingApprovals : []);
    setContextUsage(saved.contextUsage && Number.isSafeInteger(saved.contextUsage.usedTokens) && saved.contextUsage.usedTokens >= 0 && Number.isSafeInteger(saved.contextUsage.contextWindow) && saved.contextUsage.contextWindow > 0 ? saved.contextUsage : null);
    setSelection({ engine: saved.engine || 'codex', providerId: saved.providerId || null, modelId: saved.modelId || null });
    if (!lastRequest.current) {
      const user = [...saved.messages].reverse().find(message => message.role === 'user');
      if (user) lastRequest.current = { sessionId: saved.id, text: user.text, requestId: user.requestId || user.id, engine: saved.engine || 'codex', providerId: saved.providerId || null, modelId: saved.modelId || null, ...(user.attachments?.length ? { attachmentIds: user.attachments.map(value => value.id) } : {}) };
    }
    if (!saved.running && saved.messages.at(-1)?.status === 'failed') {
      setError(current => current || 'The previous run failed. Retry or send a new request.');
      setRetryable(Boolean(lastRequest.current));
    }
  }, [flush]);

  const refreshSessions = useCallback(async (signal?: AbortSignal) => {
    const request = ++listEpoch.current;
    setSessionsLoading(true);
    try {
      const values = await getSessions(signal);
      if (!signal?.aborted && request === listEpoch.current) {
        setSessions(current => sortSessionSummaries([...values, ...current.filter(item => item.id === session.current && !values.some(value => value.id === item.id))]));
        setSessionsError('');
      }
    } catch (failure) {
      if (!signal?.aborted && request === listEpoch.current && !isAborted(failure)) setSessionsError(errorText(failure));
    } finally {
      if (!signal?.aborted && request === listEpoch.current) setSessionsLoading(false);
    }
  }, []);

  const refreshStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await checkedFetch('/api/status', { signal });
      const value = await response.json() as RuntimeStatus;
      if (signal?.aborted) return;
      setStatus(restarting.current ? { ...value, ready: false } : value);
    } catch (failure) {
      if (signal?.aborted || isAborted(failure)) return;
      setStatus({ ready: false, authenticated: false, error: errorText(failure) });
    }
  }, []);

  const refreshEngines = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await checkedFetch('/api/engines', { signal });
      const value = await response.json() as { engines?: EngineOption[]; defaultSelection?: EngineSelection };
      if (!signal?.aborted && Array.isArray(value.engines)) {
        setEngines(value.engines);
        if(!session.current && !running.current && !selectionChosen.current && value.defaultSelection)setSelectionState(value.defaultSelection);
      }
    } catch (failure) {
      if (!signal?.aborted && !isAborted(failure)) setEngines(current => current.length ? current : [{ id: 'codex', label: 'Codex', ready: false, authenticated: false, error: errorText(failure) }]);
    }
  }, []);

  const receive = useCallback((event: ServerEvent) => {
    switch (event.type) {
      case 'session': {
        if (typeof event.sessionId === 'string') {
          session.current = event.sessionId;
          setActiveSessionId(event.sessionId);
          const id = event.sessionId;
          setSessions(current => current.some(item => item.id === id) ? current : sortSessionSummaries([...current, { id, title: lastRequest.current?.text.slice(0, 60) || 'Untitled conversation', engine: lastRequest.current?.engine || 'codex' }]));
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
        if (typeof event.itemId !== 'string' || typeof event.delta !== 'string') throw new Error('Invalid response delta format.');
        pending.current.set(event.itemId, (pending.current.get(event.itemId) || '') + event.delta);
        if (!timer.current) timer.current = setTimeout(flush, 50);
        setActivity('Responding…');
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
        setActivity('Using tools…');
        break;
      }
      case 'approval': {
        if (typeof event.id !== 'string' || typeof event.description !== 'string') break;
        const next = event as unknown as Approval;
        setApprovals(current => [...current.filter(item => item.id !== next.id), next]);
        setActivity('Waiting for your choice');
        break;
      }
      case 'error': {
        flush();
        setError(typeof event.message === 'string' ? event.message : 'Agent execution failed.');
        break;
      }
      case 'done': {
        flush();
        setRunning(false);
        setApprovals([]);
        setMessages(current => current.map(message => message.status === 'streaming' ? { ...message, status: String(event.status) } : message));
        setActivity(event.status === 'interrupted' ? 'Stopped' : event.status === 'failed' ? 'Execution failed' : '');
        if (event.status === 'failed') {
          setError(current => current || 'Agent execution failed. Please try again.');
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
    const id = session.current;
    if (!id) throw new Error('Session connection interrupted. Retry your original request.');
    if (!currentTarget(signal, expectedEpoch, id)) return;
    setActivity('Reconnecting…');
    let saved: Session;
    try { saved = await getSession(id, signal); }
    catch (failure) {
      if (detachMissingSession(failure, id, signal, expectedEpoch)) return;
      throw failure;
    }
    if (!currentTarget(signal, expectedEpoch, id)) return;
    if (requiredRequestId && !saved.messages.some(message => message.role === 'user' && (message.id === requiredRequestId || message.requestId === requiredRequestId))) throw new Error('The original request was not saved. Please try again.');
    snapshot(saved);
    if (!saved.running) {
      setRunning(false);
      setActivity('');
      if (saved.messages.at(-1)?.status === 'failed') {
        setError(current => current || 'Agent execution failed. Please try again.');
        setRetryable(Boolean(lastRequest.current));
      }
      return;
    }
    setRunning(true);
    try {
      const response = await checkedFetch(`/api/events?sessionId=${encodeURIComponent(saved.id)}`, { signal });
      if (!currentTarget(signal, expectedEpoch, id)) return;
      await consumeEvents(response, event => { if (currentTarget(signal, expectedEpoch, id)) receive(event); });
      if (!running.current || signal.aborted) return;
    } catch (failure) {
      if (signal.aborted || isAborted(failure)) return;
    }
    // Snapshot polling is a fallback for an unavailable event subscription.
    while (currentTarget(signal, expectedEpoch, id) && running.current) {
      let latest: Session;
      try { latest = await getSession(id, signal); }
      catch (failure) {
        if (detachMissingSession(failure, id, signal, expectedEpoch)) return;
        throw failure;
      }
      if (!currentTarget(signal, expectedEpoch, id)) return;
      snapshot(latest);
      if (!latest.running) {
        setRunning(false);
        setActivity('');
        return;
      }
      setActivity('Reconnected. Waiting for a response…');
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }, [currentTarget, detachMissingSession, receive, setRunning, snapshot]);

  useEffect(() => {
    const bootstrap = new AbortController();
    const expectedEpoch = ++epoch.current;
    let id = session.current;
    let fetchingSavedSession = false;
    let statusTimer: ReturnType<typeof setInterval> | undefined;
    void (async () => {
      await refreshStatus(bootstrap.signal);
      void refreshEngines(bootstrap.signal);
      if (!currentTarget(bootstrap.signal, expectedEpoch, id)) return;
      statusTimer = setInterval(() => { void refreshStatus(bootstrap.signal); }, 10000);
      try {
        // History availability must not block restoring an already-known session.
        void refreshSessions(bootstrap.signal);
        if (!currentTarget(bootstrap.signal, expectedEpoch, id)) return;
        if (id) {
          fetchingSavedSession = true;
          const saved = await getSession(id, bootstrap.signal);
          fetchingSavedSession = false;
          if (!currentTarget(bootstrap.signal, expectedEpoch, id)) return;
          snapshot(saved);
          if (saved.running) {
            setRunning(true);
            stream.current = bootstrap;
            setIsLoading(false);
            await recover(bootstrap.signal, expectedEpoch);
            if (!bootstrap.signal.aborted && epoch.current === expectedEpoch) id = session.current;
          }
        }
      } catch (failure) {
        if (fetchingSavedSession && detachMissingSession(failure, id, bootstrap.signal, expectedEpoch)) id = null;
        else if (currentTarget(bootstrap.signal, expectedEpoch, id) && !isAborted(failure) && id) setError(`Unable to restore the previous session:${errorText(failure)}`);
      } finally {
        if (currentTarget(bootstrap.signal, expectedEpoch, id)) {
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
  }, [currentTarget, detachMissingSession, recover, refreshEngines, refreshSessions, refreshStatus, setRunning, snapshot]);

  useEffect(() => {
    let signature = '', controller: AbortController | null = null;
    const changed = (event: Event) => {
      const state = (event as CustomEvent<{busy: boolean; phase: string; instanceId: string; generation: number}>).detail;
      restarting.current = state.busy || state.phase !== 'ready';
      if (restarting.current) { setStatus(current => current ? { ...current, ready: false } : null); setActivity('Restarting services…'); return; }
      const next = `${state.instanceId}:${state.generation}`;
      if (signature === next) return;
      signature = next; controller?.abort(); controller = new AbortController();
      const signal = controller.signal, expected = epoch.current, id = session.current;
      void (async () => {
        await refreshStatus(signal);
        if (!currentTarget(signal, expected, id) || running.current) return;
        if (id) { try { const saved = await getSession(id, signal); if (currentTarget(signal, expected, id)) snapshot(saved); } catch (failure) { detachMissingSession(failure, id, signal, expected); } }
        if (currentTarget(signal, expected, id)) setActivity('');
      })();
    };
    window.addEventListener('saplingagent:runtime', changed);
    return () => { controller?.abort(); window.removeEventListener('saplingagent:runtime', changed); };
  }, [currentTarget, detachMissingSession, refreshStatus, snapshot]);

  const runRequest = useCallback(async (request: Request, isRetry = false) => {
    if (running.current || restarting.current) return;
    const expectedEpoch = ++epoch.current;
    let id = session.current;
    const controller = new AbortController();
    stream.current?.abort();
    stream.current = controller;
    lastRequest.current = request;
    setRunning(true);
    setError('');
    setRetryable(false);
    setTools([]);
    setApprovals([]);
    setActivity(isRetry ? 'Retrying…' : 'Thinking…');
    if (!isRetry) setMessages(current => [...current, { id: request.requestId, requestId: request.requestId, role: 'user', text: request.text, ...(request.attachmentIds?.length ? { attachments: messageAttachments.current.get(request.requestId) } : {}) }]);
    try {
      const response = await checkedFetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(request), signal: controller.signal,
      });
      if (!currentTarget(controller.signal, expectedEpoch, id)) return;
      const responseId = response.headers.get('X-Session-Id');
      if (responseId) { id = responseId; session.current = id; request.sessionId = id; rememberSession(id); }
      let ended = false;
      await consumeEvents(response, event => {
        if (!currentTarget(controller.signal, expectedEpoch, id)) return;
        if (event.type === 'done') ended = true;
        receive(event);
        id = session.current;
      });
      if (!currentTarget(controller.signal, expectedEpoch, id)) return;
      if (!ended) await recover(controller.signal, expectedEpoch);
      if (id && !running.current && currentTarget(controller.signal, expectedEpoch, id)) {
        const saved = await getSession(id, controller.signal);
        if (currentTarget(controller.signal, expectedEpoch, id)) snapshot(saved);
      }
      if (currentTarget(controller.signal, expectedEpoch, id)) void refreshSessions();
    } catch (failure) {
      if (!currentTarget(controller.signal, expectedEpoch, id) || isAborted(failure)) return;
      if (detachMissingSession(failure, request.sessionId || id, controller.signal, expectedEpoch)) return;
      flush();
      try {
        await recover(controller.signal, expectedEpoch, request.requestId);
        if (!running.current) return;
      } catch { /* Keep the original actionable error when recovery also fails. */ }
      if (!currentTarget(controller.signal, expectedEpoch, id)) return;
      setRunning(false);
      setActivity('Connection failed');
      setError(errorText(failure));
      setRetryable(true);
    }
  }, [currentTarget, detachMissingSession, flush, receive, recover, refreshSessions, setRunning, snapshot]);

  const onNew = useCallback(async (message: AppendMessage) => {
    const text = message.content.filter(part => part.type === 'text').map(part => part.type === 'text' ? part.text : '').join('\n').trim();
    const files = message.attachments || [];
    if ((!text && !files.length) || running.current || restarting.current) return;
    const requestId = crypto.randomUUID();
    if (files.length) messageAttachments.current.set(requestId, files.map(file => ({ id: file.id, name: file.name, contentType: file.contentType || 'application/octet-stream', kind: file.type === 'image' ? 'image' : 'file', size: file.file?.size || 0 })));
    try { await runRequest({ requestId, text, ...selection, ...(files.length ? { attachmentIds: files.map(file => file.id) } : {}), ...(session.current ? { sessionId: session.current } : {}) }); }
    finally { messageAttachments.current.delete(requestId); }
  }, [runRequest, selection]);

  const onCancel = useCallback(async () => {
    if (!session.current) {
      setError('Creating the session. You can stop shortly.');
      return;
    }
    const target = session.current, expected = epoch.current;
    setActivity('Stopping…');
    try {
      await checkedFetch(`/api/sessions/${encodeURIComponent(target)}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } catch (failure) { if (epoch.current === expected && session.current === target) setError(`Unable to stop:${errorText(failure)}`); }
  }, []);

  const startNew = useCallback(() => {
    if (running.current || restarting.current) return false;
    ++epoch.current;
    stream.current?.abort();
    pending.current.clear();
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    session.current = null;
    setActiveSessionId(null);
    selectionChosen.current = false;
    void refreshEngines();
    lastRequest.current = null;
    rememberSession(null);
    setMessages([]);
    setTools([]);
    setApprovals([]);
    setApprovalBusy(false);
    setContextUsage(null);
    setError('');
    setRetryable(false);
    setActivity('');
    return true;
  }, [refreshEngines]);

  const switchSession = useCallback((id: string) => {
    if (!id || id === session.current || restarting.current) return false;
    const expectedEpoch = ++epoch.current;
    const controller = new AbortController();
    stream.current?.abort();
    stream.current = controller;
    flush();
    pending.current.clear();
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRunning(false);
    session.current = id;
    setActiveSessionId(id);
    rememberSession(id);
    lastRequest.current = null;
    setMessages([]);
    setTools([]);
    setApprovals([]);
    setApprovalBusy(false);
    setContextUsage(null);
    setError('');
    setRetryable(false);
    setIsLoading(true);
    setActivity('Loading conversation…');
    void (async () => {
    try {
      const saved = await getSession(id, controller.signal);
      if (!currentTarget(controller.signal, expectedEpoch, id)) return;
      snapshot(saved);
      setIsLoading(false);
      if (saved.running) {
        setRunning(true);
        await recover(controller.signal, expectedEpoch);
      }
    } catch (failure) {
      if (!currentTarget(controller.signal, expectedEpoch, id) || isAborted(failure)) return;
      if (!detachMissingSession(failure, id, controller.signal, expectedEpoch)) setError(`Unable to open conversation: ${errorText(failure)}`);
      void refreshSessions();
    } finally {
      if (currentTarget(controller.signal, expectedEpoch, session.current)) {
        setIsLoading(false);
        if (!running.current) setActivity('');
      }
    }
    })();
    return true;
  }, [currentTarget, detachMissingSession, flush, recover, refreshSessions, setRunning, snapshot]);

  const renameSession = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed || trimmed.length > 200) throw new Error('Conversation title must contain 1 to 200 characters.');
    ++listEpoch.current; // Ignore history reads started before this mutation.
    setSessionsLoading(false);
    const version = (titleVersions.current.get(id) || 0) + 1;
    titleVersions.current.set(id, version);
    // Serialize writes for a conversation so cancellation of the editor cannot
    // reorder persisted titles. Only the latest requested title updates the UI.
    const previous = titleWrites.current.get(id);
    const write = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(() => saveSessionTitle(id, trimmed));
    titleWrites.current.set(id, write);
    let saved: Session;
    try { saved = await write; }
    finally { if (titleWrites.current.get(id) === write) titleWrites.current.delete(id); }
    if (titleVersions.current.get(id) !== version) return saved.title || trimmed;
    ++listEpoch.current; // Also invalidate reads that raced the write.
    setSessionsLoading(false);
    setSessions(current => sortSessionSummaries(current.some(item => item.id === id)
      ? current.map(item => item.id === id ? { ...item, title: saved.title, updatedAt: saved.updatedAt || item.updatedAt } : item)
      : [...current, { id, title: saved.title, updatedAt: saved.updatedAt, engine: saved.engine || 'codex', providerId: saved.providerId || null, modelId: saved.modelId || null }]));
    return saved.title || trimmed;
  }, []);

  const retry = useCallback(async () => {
    if (lastRequest.current) await runRequest({ ...lastRequest.current }, true);
  }, [runRequest]);

  const respondApproval = useCallback(async (id: string, decision: string) => {
    const target = session.current, expected = epoch.current;
    setApprovalBusy(true);
    try {
      await checkedFetch(`/api/approvals/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
      if (epoch.current !== expected || session.current !== target) return;
      setApprovals(current => current.filter(item => item.id !== id));
      setError('');
      setActivity('Continuing…');
    } catch (failure) { if (epoch.current === expected && session.current === target) setError(`Action not confirmed:${errorText(failure)}`); }
    finally { if (epoch.current === expected && session.current === target) setApprovalBusy(false); }
  }, []);

  const selectedEngine = engines.find(engine => engine.id === selection.engine);
  const engineReady = selection.engine === 'codex' ? Boolean(status?.codexReady ?? status?.ready) : Boolean(selectedEngine?.ready && selectedEngine.authenticated && selection.providerId && selection.modelId);
  const engineError = selection.engine !== 'codex' && !selectedEngine?.authenticated ? 'Configure this agent provider in AI setup before starting this conversation' : selectedEngine?.error || '';
  return { messages, status, engines, selection, setSelection, contextUsage, sessions, activeSessionId, sessionsLoading, sessionsError, refreshSessions, switchSession, renameSession, engineReady, engineError, canSelectEngine: !session.current && !isRunning, isLoading, isRunning, activity, tools, approvals, approvalBusy, error, retryable, onNew, onCancel, startNew, retry, respondApproval, refreshStatus, refreshEngines };
}
