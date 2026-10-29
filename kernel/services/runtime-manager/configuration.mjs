import { randomUUID } from 'node:crypto';
import { launchConfiguration } from '../../configuration/runtime.mjs';

// Both gateway and control-port handlers share this state for a runtime instance.
const jobs = new WeakMap();
export const configurationStatus = manager => jobs.get(manager)?.status || { phase: 'idle' };
export function openRuntimeConfiguration(manager, { launch = launchConfiguration, slowMs = 30000 } = {}) {
  const previous = jobs.get(manager);
  if (previous?.pending) return previous.status;
  if (manager.operation || manager.maintenance || manager.closing || manager.closed) throw Object.assign(new Error('Wait for the current runtime operation before configuring AI.'), { code: 'RUNTIME_BUSY', status: 409 });
  const job = { status: { id: randomUUID(), phase: 'starting' }, pending: true };
  jobs.set(manager, job);
  manager.gatewayWrites = (manager.gatewayWrites || 0) + 1;
  const slow = setTimeout(() => { job.status = { ...job.status, slow: true }; }, slowMs);
  slow.unref?.();
  job.promise = Promise.resolve().then(() => launch(manager.root)).then(result => {
    job.status = { id: job.status.id, phase: 'ready', ...result };
  }, error => {
    job.status = { id: job.status.id, phase: 'failed', error: { code: /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code || '') ? error.code : 'CONFIGURATION_START_FAILED' } };
  }).finally(() => { clearTimeout(slow); job.pending = false; manager.gatewayWrites--; });
  return job.status;
}
