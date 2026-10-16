export type RestartMarker = { instanceId: string; generation: number };
export type RestartStatus = RestartMarker & { busy: boolean; phase: string };
export function readRestartMarker(storage: Pick<Storage, 'getItem'>, key: string): RestartMarker | null {
  try {
    const marker = JSON.parse(storage.getItem(key) || 'null');
    return marker && typeof marker.instanceId === 'string' && Number.isInteger(marker.generation) ? marker : null;
  } catch { return null; }
}
export function completedRestart(marker: RestartMarker | null, state: RestartStatus): boolean {
  return Boolean(marker && !state.busy && state.phase === 'ready' && (state.instanceId !== marker.instanceId || state.generation > marker.generation));
}
