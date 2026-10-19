export type FinalizationPhase = 'saved' | 'waiting-release' | 'restarting' | 'ready' | 'failed';
export type SetupReadiness = {
  configurationHost?: 'external' | 'project';
  settingsSaved?: boolean;
  exportReady?: boolean;
  launcher?: { artifact: string };
  job?: { id: string; kind: string; phase: string };
  finalization?: { id: string; phase: FinalizationPhase; message?: string; error?: { message?: string } };
};

// Saved identity permits account configuration before any directory move.
// External setup keeps serving while the project moves/builds. Its authoritative
// readiness and an actual artifact are required before handing back to A.
export function setupAvailability(state: SetupReadiness | null, dirty: boolean, aiDirty: boolean, aiReady: boolean) {
  const saved = state?.exportReady === true && !dirty && !aiDirty && aiReady;
  const jobReady = !state?.job || state.job.phase === 'completed';
  return {
    configureAI: state?.settingsSaved === true,
    exportApp: saved && (state?.configurationHost !== 'external' || jobReady),
    finishSetup: state?.configurationHost === 'external' && saved && jobReady && !!state.launcher?.artifact,
  };
}

export function acceptedConfigurationJob(value: unknown): { id: string; kind: 'configure'; phase: 'running' | 'completed' } | null {
  if (!value || typeof value !== 'object') return null;
  const job = (value as { job?: { id?: unknown; kind?: unknown; phase?: unknown } }).job;
  if (!job || typeof job.id !== 'string' || !job.id || job.kind !== 'configure' || !['running', 'completed'].includes(String(job.phase))) return null;
  return { id: job.id, kind: 'configure', phase: job.phase as 'running' | 'completed' };
}

export function configurationClosed(value: unknown, external: boolean): boolean {
  if (!value || typeof value !== 'object') return false;
  const result = value as { closed?: unknown; handoff?: unknown };
  return result.closed === true && (!external || result.handoff === true);
}

export function restartedFinalization(health: unknown, id: string): boolean {
  if (!health || typeof health !== 'object') return false;
  const receipt = (health as { finalization?: { id?: string; phase?: string } }).finalization;
  return receipt?.id === id && (receipt.phase === 'ready' || receipt.phase === 'failed');
}
