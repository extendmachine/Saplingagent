// Shutdown failures are observed even when invoked by a signal handler.
export async function stopRuntime({ release, closeConnections, closeServers, stopChildren, cleanup, report = () => {} }) {
  let failed = false, stopped = false;
  const attempt = async (phase, operation) => {
    try { await operation(); } catch (error) { failed = true; report(phase, error); }
  };
  await attempt('release', release);
  for (let index = 0; index < 2; index++) {
    try { await stopChildren(); stopped = true; break; }
    catch (error) { report(index === 0 ? 'retry' : 'stop-failed', error); }
  }
  // A live controller can retry retained children over the existing control port.
  if (!stopped) return 1;
  await attempt('connections', closeConnections);
  await attempt('servers', closeServers);
  await attempt('cleanup', cleanup);
  return failed ? 1 : 0;
}
