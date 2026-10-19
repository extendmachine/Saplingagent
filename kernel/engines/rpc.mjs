import path from 'node:path';
import { AppServer as Transport } from '../contracts/codex-rpc.mjs';
import { findRelocatedRollout, isMissingRolloutError, relocationError } from './session-relocation.mjs';

// Account setup can keep using the shared transport directly. Only the Agent's
// failed on-disk resume needs this pinned-Codex compatibility adapter.
export class AppServer extends Transport {
  constructor(options = {}) {
    super(options);
    const childEnv = options.env ?? process.env;
    this.projectRoot = path.resolve(options.cwd || childEnv.SEED_ROOT || process.cwd());
    this.projectCodexHome = path.join(this.projectRoot, 'local-secrets/codex');
    this.localCodexHome = typeof childEnv.CODEX_HOME === 'string' && path.resolve(this.projectRoot, childEnv.CODEX_HOME) === this.projectCodexHome;
    this.resumeOperations = new Map();
    this.experimentalApi = false;
  }

  call(method, params = {}, timeoutMs = 60000, { signal } = {}) {
    if (method === 'initialize') return super.call(method, params, timeoutMs).then(result => {
      this.experimentalApi = params.capabilities?.experimentalApi === true;
      return result;
    });
    if (method === 'turn/interrupt') this.cancelResume(params.threadId);
    if (method !== 'thread/resume' || !this.localCodexHome || params.path || params.history) return super.call(method, params, timeoutMs);
    const signature = JSON.stringify([params, timeoutMs]);
    const existing = this.resumeOperations.get(params.threadId);
    if (existing) return existing.signature === signature && existing.externalSignal === signal
      ? existing.promise
      : Promise.reject(relocationError('CODEX_RESUME_BUSY', 'A resume with different options is already pending for this conversation.'));
    const operation = { signature, externalSignal: signal, controller: new AbortController(), deadline: Date.now() + timeoutMs };
    const abort = () => operation.controller.abort();
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    operation.timer = setTimeout(() => { operation.expired = true; operation.controller.abort(); }, Math.max(1, timeoutMs));
    operation.promise = this.resume(params, operation).catch(error => {
      if (operation.expired) throw new Error('Agent request timed out: thread/resume');
      throw error;
    }).finally(() => {
      clearTimeout(operation.timer);
      signal?.removeEventListener('abort', abort);
      if (this.resumeOperations.get(params.threadId) === operation) this.resumeOperations.delete(params.threadId);
    });
    this.resumeOperations.set(params.threadId, operation);
    return operation.promise;
  }

  assertResumeActive(operation) {
    if (operation.failure) throw operation.failure;
    if (this.closed) throw new Error('Agent connection is closed');
    if (operation.expired || Date.now() >= operation.deadline) throw new Error('Agent request timed out: thread/resume');
    if (operation.controller.signal.aborted) throw relocationError('CODEX_RESUME_CANCELLED', 'Conversation resume was cancelled.');
  }

  awaitResumeWork(work, operation) {
    return new Promise((resolve, reject) => {
      const signal = operation.controller.signal;
      const abort = () => { try { this.assertResumeActive(operation); } catch (error) { reject(error); } };
      signal.addEventListener('abort', abort, { once: true });
      work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
      if (signal.aborted) abort();
    });
  }

  invokeResume(params, operation) {
    this.assertResumeActive(operation);
    const id = this.nextId;
    const promise = super.call('thread/resume', params, Math.max(1, operation.deadline - Date.now()));
    const abort = () => {
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timer); this.pending.delete(id);
        pending.reject(relocationError('CODEX_RESUME_CANCELLED', 'Conversation resume was cancelled.'));
      }
    };
    operation.controller.signal.addEventListener('abort', abort, { once: true });
    if (operation.controller.signal.aborted) abort();
    return promise.finally(() => operation.controller.signal.removeEventListener('abort', abort));
  }

  async resume(params, operation) {
    try { return await this.invokeResume(params, operation); }
    catch (error) {
      this.assertResumeActive(operation);
      if (!this.experimentalApi || !isMissingRolloutError(error, params.threadId)) throw error;
      const rollout = await this.awaitResumeWork(findRelocatedRollout(this.projectRoot, params.threadId, { signal: operation.controller.signal }), operation);
      this.assertResumeActive(operation);
      if (!rollout) throw error;
      // Explicit path takes precedence over threadId in Codex0.146.1. The helper
      // verifies the persisted identity before it is sent, and we verify it again
      // on the response. There is exactly one retry and never a replacement thread.
      const result = await this.invokeResume({ ...params, path: rollout, cwd: this.projectRoot }, operation);
      this.assertResumeActive(operation);
      if (result?.thread?.id !== params.threadId) throw relocationError('CODEX_ROLLOUT_MISMATCH', 'Codex resumed a different conversation; no user turn was started.');
      return result;
    }
  }

  cancelResume(threadId) { this.resumeOperations?.get(threadId)?.controller.abort(); }
  fail(error) {
    for (const operation of this.resumeOperations?.values() || []) {
      operation.failure = error;
      operation.controller.abort();
    }
    return super.fail(error);
  }
}
