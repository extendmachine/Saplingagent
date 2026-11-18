import {readConnections,defaultSelection} from '../contracts/ai-configuration.mjs';
import {readMcpAccess} from '../contracts/mcp-access.mjs';
import {hasTooling,ensureTools,toolSetStatus} from './tools.mjs';

export async function runtimeEngines(root) {
  if((await readMcpAccess(root)).externalOnly)return [];
  return [defaultSelection(await readConnections(root)).engine];
}

export async function prepareProviderTools(root,engines,options={}) {
  options.signal?.throwIfAborted();
  if(hasTooling(root)&&!(await toolSetStatus(root,engines)).ready){
    const state=await ensureTools(root,{...options,engines});
    if(!state.ready)throw new Error('Provider tools are incomplete. Check the installation log and retry.');
  }
}
