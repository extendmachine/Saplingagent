export const runtimeStatusPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Saplingagent runtime</title><style>
:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#253129;background:#f5f7f4;color-scheme:light}*{box-sizing:border-box}body{max-width:900px;margin:40px auto;padding:0 20px}header{display:flex;align-items:start;justify-content:space-between;gap:16px}h1{font-size:28px;margin:8px 0}h2{font-size:17px;margin:0 0 18px}.eyebrow,.muted{color:#5c6b61;font-size:13px}.badge{border:1px solid #bdcec1;border-radius:24px;padding:9px 14px;background:#eaf2ec;white-space:nowrap}section{background:white;border:1px solid #dce3dc;border-radius:14px;padding:22px;margin:20px 0}dl{display:grid;grid-template-columns:120px 1fr;gap:13px;margin:0}dt{color:#5c6b61}dd{margin:0;overflow-wrap:anywhere}a{color:#216344}.actions{display:flex;gap:10px;flex-wrap:wrap}.actions button,.actions a{font:inherit;border:1px solid #c6d1c8;border-radius:8px;padding:10px 14px;background:#fff;cursor:pointer;text-decoration:none;color:inherit}.actions .primary{background:#236747;color:white;border-color:#236747}.actions .danger{color:#9c3125}.actions :disabled,.actions [aria-disabled=true]{opacity:.45;cursor:default;pointer-events:none}.actions :focus-visible{outline:3px solid #82ac94;outline-offset:2px}#message{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;margin:16px 0 0}#message:empty{display:none}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;text-align:left}th{font-weight:500;color:#5c6b61;font-size:13px}th,td{padding:12px 8px;border-bottom:1px solid #edf0ec}th:first-child,td:first-child{padding-left:0}caption{text-align:left;font-size:13px;color:#5c6b61;padding:0 0 10px}.note{font-size:13px;line-height:1.6;color:#5c6b61;margin-bottom:0}code{font-size:13px}#reconnect[hidden]{display:none}@media(max-width:560px){body{margin:20px auto}header{display:block}.badge{display:inline-block;margin-top:8px}section{padding:16px}dl{grid-template-columns:1fr;gap:6px}dd{margin-bottom:10px}}
</style></head><body>
<header><div><span class="eyebrow">SAPLINGAGENT · PROJECT STATUS</span><h1 id="name">Your project</h1><span id="version" class="muted">Kernel version: checking…</span></div><div id="phase" class="badge" role="status">Connecting…</div></header>
<section><h2>Project</h2><dl><dt>Folder</dt><dd id="folder">Checking…</dd><dt>App address</dt><dd><a id="address" target="_blank" rel="noopener">Checking…</a></dd><dt>Control port</dt><dd id="control-port">Checking…</dd></dl></section>
<section><h2>Services</h2><div class="table-wrap"><table><caption id="observed">Waiting for the runtime…</caption><thead><tr><th>Service</th><th>Process</th><th>PID</th><th>Assigned port</th></tr></thead><tbody id="services"><tr><td colspan="4">No status received yet.</td></tr></tbody></table></div><p class="note">Running means the owned process has not exited. Ready means startup checks passed; this page does not continuously check service health. Assigned ports do not confirm a healthy listener.</p></section>
<section><div class="actions"><a id="open" class="primary" target="_blank" rel="noopener" aria-disabled="true">Open app</a><button id="restart" disabled>Restart app</button><button id="backend" disabled>Restart backend</button><button id="stop" class="danger" disabled>Stop app</button><button id="logs" disabled>Open logs</button><button id="reconnect" hidden>Reconnect</button></div><p id="message" role="status" aria-live="polite"></p><p class="note">Closing this browser tab does not stop the project. Use Stop app, or Quit the macOS Dock app. After stopping, reopen your native app to start again.</p></section>
<script>
const byId=id=>document.getElementById(id);
const controls=['restart','backend','stop','logs'].map(byId);
const expectedRoot = null;
let last=null,pending=false,connected=false,stopped=false,polling=false,timer=null;
function message(text){byId('message').textContent=text}
function enable(){
  const active=connected&&!pending&&!stopped&&last;
  byId('restart').disabled=!active||!last.canRestart;byId('backend').disabled=!active||!last.canRestart;
  byId('stop').disabled=!active||!last.canStop;byId('logs').disabled=!active;
  byId('open').setAttribute('aria-disabled',String(!active||last.phase!=='ready'));byId('reconnect').disabled=pending;
}
function render(s){
  byId('name').textContent=s.projectName||'Your project';document.title=(s.projectName||'Saplingagent')+' · Runtime';
  byId('version').textContent='Kernel '+(s.kernelVersion||'version unavailable');
  byId('folder').textContent=s.applicationRoot||'Unavailable';byId('control-port').textContent=s.ports?.runtimeManagerPort||'Unavailable';
  const url=s.url&&new URL(s.url);const valid=url&&url.protocol==='http:'&&url.hostname==='127.0.0.1';
  byId('address').textContent=valid?s.url:'Unavailable';for(const id of ['address','open']){if(valid)byId(id).href=s.url;else byId(id).removeAttribute('href')}
  const phases={starting:'Starting',connecting:'Connecting AI',preparing:'Preparing',stopping:'Stopping',ready:'Ready',failed:'Needs attention',stopped:'Stopped'};
  byId('phase').textContent=phases[s.phase]||'Checking';byId('observed').textContent='Last observed: '+new Date().toLocaleTimeString();
  const rows=s.services.map(service=>{const row=document.createElement('tr');const port=Number.isInteger(service.port)?String(service.port):service.healthCheck==='process'?'None (worker)':'Not assigned';for(const value of [service.name,service.running?'Running':'Exited',service.pid||'—',port]){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell)}return row});
  if(!rows.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=4;cell.textContent='No managed services are running.';row.appendChild(cell);rows.push(row)}byId('services').replaceChildren(...rows);
}
async function request(route,body,timeout=5000){const response=await fetch(route,{method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});const data=await response.json();if(!response.ok)throw Error(data.error?.message||'The operation could not be completed.');return data}
function schedule(){clearTimeout(timer);if(!stopped)timer=setTimeout(update,2000)}
async function update(){
  if(pending||polling||stopped){schedule();return}polling=true;
  try{const s=await request('/api/runtime/status',null,3000);if(pending||stopped)return;if(!s.instanceId||!Array.isArray(s.services))throw Error('Invalid status');if(expectedRoot&&s.applicationRoot!==expectedRoot)throw Object.assign(Error('This port now belongs to a different project. Reopen the original project’s native app; its address may have changed.'),{code:'ROOT_CHANGED'});const previous=last,wasConnected=connected,changed=last&&last.instanceId!==s.instanceId;last=s;connected=true;render(s);byId('reconnect').hidden=true;if(changed)message('A new runtime is connected. Review its status before using the controls.');else if(s.error)message(s.error.message);else if(s.phase==='ready'&&(!wasConnected||previous?.error||previous?.phase!=='ready'))message('Startup checks passed. Open app to continue.');}
  catch(error){connected=false;byId('phase').textContent=error.code==='ROOT_CHANGED'?'Different project':'Connection lost';byId('reconnect').hidden=false;message(error.code==='ROOT_CHANGED'?error.message:'Cannot reach this runtime. Stopped is not confirmed. Reopen your native app if needed, then reconnect; the table shows the last observed state.');}
  finally{polling=false;enable();schedule()}
}
async function action(kind){
  if(pending||!connected||!last)return;pending=true;clearTimeout(timer);enable();
  const instanceId=last.instanceId;message(kind==='stop'?'Stopping owned project services. Waiting for confirmed exit…':kind==='logs'?'Opening this project’s logs folder…':'Restart requested. Waiting for service status…');
  try{
    if(kind==='stop'){
      const result=await request('/api/runtime/stop-and-wait',{instanceId},120000);
      if(result.stopped!==true||result.instanceId!==instanceId)throw Error('Stop was not confirmed by the expected runtime.');
      stopped=true;connected=false;last={...last,phase:'stopped',services:last.services.map(s=>({...s,running:false}))};render(last);byId('reconnect').hidden=false;message('Stopped: all managed project services exited. Reopen your native app to start again.');
    }else if(kind==='logs'){await request('/api/runtime/open-logs',{instanceId});message('Requested the project logs folder in Finder or Explorer. Logs remain in your project’s logs folder.');}
    else{await request('/api/runtime/restart',{scope:kind==='backend'?'backend':'all',instanceId});message('Restart accepted. This page will show the next startup result.');}
  }catch(error){message(kind==='stop'?'Stop not confirmed. '+error.message+' Reconnect to check the runtime before retrying.':error.message);if(kind==='stop'){connected=false;byId('phase').textContent='Stop unconfirmed';byId('reconnect').hidden=false;}}
  finally{pending=false;enable();schedule()}
}
byId('restart').onclick=()=>action('restart');byId('backend').onclick=()=>action('backend');byId('stop').onclick=()=>action('stop');byId('logs').onclick=()=>action('logs');byId('reconnect').onclick=()=>{stopped=false;message('Reconnecting…');void update()};
void update();
</script></body></html>`;

export function renderRuntimeStatusPage(manager) {
  const root = JSON.stringify(manager.state().applicationRoot).replaceAll('<', '\\u003c');
  return runtimeStatusPage.replace('const expectedRoot = null;', () => `const expectedRoot = ${root};`);
}
