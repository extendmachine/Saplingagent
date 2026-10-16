import { randomUUID } from 'node:crypto';
export class PageError extends Error {
  constructor(code, message, status = 400) { super(message); Object.assign(this, { code, status }); }
}
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
export function createPageBroker({ timeoutMs = 20000, pollMs = 12000, ttlMs = 30000, now = Date.now } = {}) {
  const pages = new Map(), pending = new Map(), polls = new Map();
  let closed = false;
  const unavailable = () => new PageError('PAGE_UNAVAILABLE', 'Open the project page in its browser, wait for it to connect, and retry page_read.', 404);
  function heartbeat(input) {
    if (closed) throw unavailable();
    if (!input || !identifier(input.pageId) || typeof input.url !== 'string' || input.url.length > 4096 || typeof input.title !== 'string' || input.title.length > 500 || typeof input.visible !== 'boolean') throw new PageError('INVALID_PAGE', 'Invalid page registration.');
    for (const [id, page] of pages) if (now() - page.seenAt > ttlMs) pages.delete(id);
    if (!pages.has(input.pageId) && pages.size >= 16) pages.delete([...pages.values()].sort((a,b)=>a.seenAt-b.seenAt)[0].pageId);
    pages.set(input.pageId, { pageId: input.pageId, url: input.url, title: input.title, visible: input.visible, seenAt: now() });
    return { connected: true, pageId: input.pageId };
  }
  function claim(pageId) {
    const job = [...pending.values()].find(item => item.pageId === pageId && !item.claimed);
    if (!job) return null;
    job.claimed = true;
    return { requestId: job.id, selector: job.selector, includeImage: job.includeImage };
  }
  function next(pageId, { signal } = {}) {
    if (!identifier(pageId)) throw new PageError('INVALID_PAGE', 'Invalid page identifier.');
    if (closed) return Promise.resolve({ request: null });
    const request = claim(pageId); if (request) return Promise.resolve({ request });
    return new Promise(resolve => {
      const finish = request => { clearTimeout(timer); signal?.removeEventListener('abort', abort); if (polls.get(pageId) === finish) polls.delete(pageId); resolve({ request }); };
      const abort = () => finish(null), timer = setTimeout(abort, pollMs);
      polls.get(pageId)?.(null); polls.set(pageId, finish);
      signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    });
  }
  function read(input = {}, { signal } = {}) {
    if (closed) throw unavailable();
    if (input.pageId !== undefined && !identifier(input.pageId) || input.selector !== undefined && (typeof input.selector !== 'string' || !input.selector.trim() || input.selector.length > 500) || input.includeImage !== undefined && typeof input.includeImage !== 'boolean') throw new PageError('INVALID_PAGE', 'Invalid page capture request.');
    const candidates = [...pages.values()].filter(page => now() - page.seenAt < ttlMs && (!input.pageId || page.pageId === input.pageId));
    candidates.sort((a,b)=>Number(b.visible)-Number(a.visible)||b.seenAt-a.seenAt);
    const page = candidates[0]; if (!page) throw unavailable();
    if (pending.size >= 32) throw new PageError('PAGE_BUSY', 'Page capture queue is busy. Retry shortly.', 409);
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const finish = (error, snapshot) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); pending.delete(id); error ? reject(error) : resolve({ snapshot }); };
      const abort = () => finish(new PageError('PAGE_CAPTURE_CANCELLED', 'Page capture was cancelled.', 499));
      const timer = setTimeout(()=>finish(new PageError('PAGE_CAPTURE_TIMEOUT', 'The open page did not answer. Reload the project page and retry page_read.', 504)), timeoutMs);
      const job = { id, pageId: page.pageId, selector: input.selector, includeImage: input.includeImage !== false, createdAt: now(), finish, claimed: false };
      pending.set(id, job); signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) return abort();
      if (polls.has(page.pageId)) polls.get(page.pageId)(claim(page.pageId));
    });
  }
  function complete(input) {
    const job = pending.get(input?.requestId);
    if (!job || input.pageId !== job.pageId) throw new PageError('PAGE_REQUEST_NOT_FOUND', 'The page request has expired or belongs to another page.', 404);
    if (input.error) { job.finish(new PageError('PAGE_CAPTURE_FAILED', String(input.error).slice(0, 500), 502)); return { accepted: true }; }
    const snapshot = input.snapshot;
    if (!snapshot || typeof snapshot.text !== 'string' || snapshot.text.length > 120000 || !Array.isArray(snapshot.elements) || snapshot.elements.length > 500 || !Number.isFinite(Date.parse(snapshot.capturedAt)) || Date.parse(snapshot.capturedAt) < job.createdAt - 1000 || Date.parse(snapshot.capturedAt) > now() + 5000) throw new PageError('INVALID_PAGE', 'Invalid or stale page snapshot.');
    if (snapshot.image && job.includeImage) {
      const image = snapshot.image;
      if (image.mimeType !== 'image/png' || typeof image.data !== 'string' || image.data.length > 12 * 1024 * 1024 || !image.data.startsWith('iVBORw0KGgo')) throw new PageError('INVALID_PAGE', 'Invalid page image.');
    }
    const result = { ...snapshot, pageId: job.pageId, ...(job.includeImage ? {} : { image: undefined }) };
    job.finish(null, result); return { accepted: true };
  }
  function close() {
    closed = true; for (const job of [...pending.values()]) job.finish(unavailable());
    for (const finish of [...polls.values()]) finish(null); pages.clear();
  }
  return { heartbeat, next, read, complete, close };
}
