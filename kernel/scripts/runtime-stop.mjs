// Shutdown failures are observed even when invoked by a signal handler.
export async function stopRuntime({ release, closeConnections, closeServers, stopChildren, cleanup, report = () => {} }) {
  let failed = false, stopped = false;
  const attempt = async (phase, operation) => {
    try { await operation(); } catch (error) { failed = true; report(phase, error); }
  };
  await attempt('release', release);
  await attempt('connections', closeConnections);
  // Attach rejection handling immediately while owned children are stopping.
  const servers = attempt('servers', closeServers);
  for (let index = 0; index < 2; index++) {
    try { await stopChildren(); stopped = true; break; }
    catch (error) { report(index === 0 ? 'retry' : 'stop-failed', error); }
  }
  if (!stopped) failed = true;
  await servers;
  if (stopped) await attempt('cleanup', cleanup);
  return failed ? 1 : 0;
}
