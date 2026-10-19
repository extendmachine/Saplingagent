export type FinalizationPhase = 'saved' | 'waiting-release' | 'restarting' | 'ready' | 'failed';
export type SetupReadiness = {
  settingsSaved?: boolean;
  exportReady?: boolean;
  finalization?: { id: string; phase: FinalizationPhase; message?: string; error?: { message?: string } };
};

// Saved identity permits account configuration before any directory move. Only a
// verified post-handoff receipt permits exporting the native application.
export function setupAvailability(state: SetupReadiness | null, dirty: boolean, aiDirty: boolean, aiReady: boolean) {
  return {
    configureAI: state?.settingsSaved === true,
    exportApp: state?.exportReady === true && !dirty && !aiDirty && aiReady,
  };
}

export function restartedFinalization(health: unknown, id: string): boolean {
  if (!health || typeof health !== 'object') return false;
  const receipt = (health as { finalization?: { id?: string; phase?: string } }).finalization;
  return receipt?.id === id && (receipt.phase === 'ready' || receipt.phase === 'failed');
}
