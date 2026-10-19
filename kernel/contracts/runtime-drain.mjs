// Public lifecycle primitive shared by HTTP services. Prepare is synchronous:
// no request can slip between the busy check and the quiescing flag.
export function createDrainGate(isBusy = () => false) {
  let pending = 0, prepared = false;
  const error = (code, message, status) => Object.assign(new Error(message), { code, status });
  return {
    get prepared() { return prepared; },
    get pending() { return pending; },
    prepare() {
      if (pending || isBusy()) throw error('RUNTIME_BUSY', 'A task or file operation is still running. Wait or stop it before restarting.', 409);
      prepared = true;
      return { prepared: true };
    },
    release() { prepared = false; return { prepared: false }; },
    enter() {
      if (prepared) throw error('RUNTIME_RESTARTING', 'Services are restarting. Please wait.', 503);
      pending++;
      let left = false;
      return () => { if (!left) { left = true; pending--; } };
    },
  };
}
