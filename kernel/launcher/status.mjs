import {launcherMessages} from '../localization/launcher-messages.mjs';
import {formatMessage} from '../localization/public.mjs';
const text=(key,params)=>formatMessage(launcherMessages,process.env.SAPLING_LANG,key,params);
// The launcher opens the kernel-owned status page as soon as its verified
// gateway is available. It never constructs an address from preferred ports.
export function runtimeStatusURL(state) {
  if (!state?.url || state.phase === 'stopped') return null;
  const url = new URL(state.url);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password)
    throw new Error(text('The project status address is not a local runtime.'));
  return new URL('/__saplingagent/runtime', url).href;
}

export function statusPageOpener(open, { noOpen = false, report = console.log } = {}) {
  const shown = new Set();
  return async state => {
    const url = runtimeStatusURL(state);
    if (!url || shown.has(url)) return;
    shown.add(url);
    report(text('Project status: {url}',{url}));
    if (!noOpen) {
      try { await open(url); }
      catch { report(text('Could not open the browser. Open the project status address above.')); }
    }
    launchProgress('status');
  };
}

export function launchProgress(phase) {
  if (['checking', 'installing', 'starting', 'status', 'ready', 'failed'].includes(phase))
    console.log(`SAPLING_PROGRESS:${phase}`);
}
