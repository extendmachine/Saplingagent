import { runtimeLanguageScript } from '../../localization/runtime-messages.mjs';
export const runtimeStatusPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title data-i18n="Saplingagent runtime">Saplingagent runtime</title><style>
:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#253129;background:#f5f7f4;color-scheme:light}*{box-sizing:border-box}body{max-width:900px;margin:40px auto;padding:0 20px}header{display:flex;align-items:start;justify-content:space-between;gap:16px}h1{font-size:28px;margin:8px 0}h2{font-size:17px;margin:0 0 18px}.eyebrow,.muted{color:#5c6b61;font-size:13px}.badge{border:1px solid #bdcec1;border-radius:24px;padding:9px 14px;background:#eaf2ec;white-space:nowrap}section{background:white;border:1px solid #dce3dc;border-radius:14px;padding:22px;margin:20px 0}dl{display:grid;grid-template-columns:120px 1fr;gap:13px;margin:0}dt{color:#5c6b61}dd{margin:0;overflow-wrap:anywhere}a{color:#216344}.actions{display:flex;gap:10px;flex-wrap:wrap}.actions button,.actions a{font:inherit;border:1px solid #c6d1c8;border-radius:8px;padding:10px 14px;background:#fff;cursor:pointer;text-decoration:none;color:inherit}.actions .primary{background:#236747;color:white;border-color:#236747}.actions .danger{color:#9c3125}.actions :disabled,.actions [aria-disabled=true]{opacity:.45;cursor:default;pointer-events:none}.actions :focus-visible{outline:3px solid #82ac94;outline-offset:2px}#message{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;margin:16px 0 0}#message:empty{display:none}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;text-align:left}th{font-weight:500;color:#5c6b61;font-size:13px}th,td{padding:12px 8px;border-bottom:1px solid #edf0ec}th:first-child,td:first-child{padding-left:0}caption{text-align:left;font-size:13px;color:#5c6b61;padding:0 0 10px}.note{font-size:13px;line-height:1.6;color:#5c6b61;margin-bottom:0}code{font-size:13px}#reconnect[hidden]{display:none}@media(max-width:560px){body{margin:20px auto}header{display:block}.badge{display:inline-block;margin-top:8px}section{padding:16px}dl{grid-template-columns:1fr;gap:6px}dd{margin-bottom:10px}}
</style></head><body>
<nav style="display:flex;justify-content:flex-end;gap:10px;padding:8px"><label><span data-i18n="Language">Language</span> <select id="language" data-language aria-label="Language / 语言"><option value="en">English</option><option value="zh">中文</option></select></label><a data-help href="/__saplingagent/help" target="_blank" rel="noopener" data-i18n="Help">Help</a></nav><header><div><span class="eyebrow" data-i18n="SAPLINGAGENT · PROJECT STATUS">SAPLINGAGENT · PROJECT STATUS</span><h1 id="name" data-i18n="Your project">Your project</h1><span id="version" class="muted" data-i18n="Kernel version: checking…">Kernel version: checking…</span></div><div id="phase" class="badge" role="status" data-i18n="Connecting…">Connecting…</div></header>
<section><h2 data-i18n="Project">Project</h2><dl><dt data-i18n="Folder">Folder</dt><dd id="folder" data-i18n="Checking…">Checking…</dd><dt data-i18n="App address">App address</dt><dd><a id="address" target="_blank" rel="noopener" data-i18n="Checking…">Checking…</a></dd><dt data-i18n="Control port">Control port</dt><dd id="control-port" data-i18n="Checking…">Checking…</dd></dl></section>
<section><h2 data-i18n="Services">Services</h2><div class="table-wrap"><table><caption id="observed" data-i18n="Waiting for the runtime…">Waiting for the runtime…</caption><thead><tr><th data-i18n="Service">Service</th><th data-i18n="Process">Process</th><th data-i18n="PID">PID</th><th data-i18n="Assigned port">Assigned port</th></tr></thead><tbody id="services"><tr><td colspan="4" data-i18n="No status received yet.">No status received yet.</td></tr></tbody></table></div><p class="note" data-i18n="Running means the owned process has not exited. Ready means startup checks passed; this page does not continuously check service health. Assigned ports do not confirm a healthy listener.">Running means the owned process has not exited. Ready means startup checks passed; this page does not continuously check service health. Assigned ports do not confirm a healthy listener.</p></section>
<section><div class="actions"><a id="open" class="primary" target="_blank" rel="noopener" aria-disabled="true" data-i18n="Open app">Open app</a><button id="restart" disabled data-i18n="Restart app">Restart app</button><button id="backend" disabled data-i18n="Restart backend">Restart backend</button><button id="stop" class="danger" disabled data-i18n="Stop app">Stop app</button><button id="logs" disabled data-i18n="Open logs">Open logs</button><button id="reconnect" hidden data-i18n="Reconnect">Reconnect</button></div><p id="message" role="status" aria-live="polite"></p><p class="note" data-i18n="Closing this browser tab does not stop the project. Use Stop app, or Quit the macOS Dock app. After stopping, reopen your native app to start again.">Closing this browser tab does not stop the project. Use Stop app, or Quit the macOS Dock app. After stopping, reopen your native app to start again.</p></section>
<script>${runtimeLanguageScript()}

const byId=id=>document.getElementById(id);
const controls=['restart','backend','stop','logs'].map(byId);
const expectedRoot = null;
let last=null,pending=false,connected=false,stopped=false,polling=false,timer=null;
let languageSaving=false,languageEpoch=0;
function changeLanguage(value){if(value===uiLanguage)return;const text=byId('message').textContent;const key=Object.entries(runtimeMessages[uiLanguage]).find(([,v])=>v===text)?.[0];applyLanguage(value);if(last)render(last);if(key)message(t(key));else if(last?.error)message(errorText(last.error))}
async function syncLanguage(){if(languageSaving)return;const epoch=languageEpoch;try{const data=await request('/api/runtime/language',null,1500);if(epoch===languageEpoch&&!languageSaving&&['en','zh'].includes(data.language)&&data.language!==uiLanguage)changeLanguage(data.language)}catch{}}
byId('language').onchange=async()=>{if(languageSaving)return;const value=byId('language').value;languageEpoch++;if(!connected||!last||stopped){changeLanguage(value);return}languageSaving=true;byId('language').disabled=true;try{const data=await request('/api/runtime/language',{language:value});changeLanguage(data.language)}catch{byId('language').value=uiLanguage;message(t('Language could not be saved. Check this runtime and retry.'))}finally{languageSaving=false;byId('language').disabled=false}};
function message(text){byId('message').textContent=text}
function enable(){
  const active=connected&&!pending&&!stopped&&last;
  byId('restart').disabled=!active||!last.canRestart;byId('backend').disabled=!active||!last.canRestart;
  byId('stop').disabled=!active||!last.canStop;byId('logs').disabled=!active;
  byId('open').setAttribute('aria-disabled',String(!active||last.phase!=='ready'));byId('reconnect').disabled=pending;
}
function render(s){
  byId('name').textContent=s.projectName||t("Your project");document.title=(s.projectName||'Saplingagent')+t(" · Runtime");
  byId('version').textContent=t("Kernel ")+(s.kernelVersion||t("version unavailable"))+(s.aiConnection==='external-mcp'?t(" · External AI / MCP"):'');
  byId('folder').textContent=s.applicationRoot||t("Unavailable");byId('control-port').textContent=s.ports?.runtimeManagerPort||t("Unavailable");
  const url=s.url&&new URL(s.url);const valid=url&&url.protocol==='http:'&&url.hostname==='127.0.0.1';
  byId('address').textContent=valid?s.url:t("Unavailable");for(const id of ['address','open']){if(valid)byId(id).href=s.url;else byId(id).removeAttribute('href')}
  const phases={starting:t("Starting"),connecting:t("Connecting AI"),preparing:t("Preparing"),stopping:t("Stopping"),ready:t("Ready"),failed:t("Needs attention"),stopped:t("Stopped")};
  byId('phase').textContent=phases[s.phase]||t("Checking");byId('observed').textContent=t("Last observed: ")+new Date().toLocaleTimeString();
  const rows=s.services.map(service=>{const row=document.createElement('tr');const port=Number.isInteger(service.port)?String(service.port):service.healthCheck==='process'?t("None (worker)"):t("Not assigned");for(const value of [service.name,service.running?t("Running"):t("Exited"),service.pid||'—',port]){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell)}return row});
  if(!rows.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=4;cell.textContent=t("No managed services are running.");row.appendChild(cell);rows.push(row)}byId('services').replaceChildren(...rows);
}
async function request(route,body,timeout=5000){const response=await fetch(route,{method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error?.message||t("The operation could not be completed.")),{code:data.error?.code});return data}
function schedule(){clearTimeout(timer);if(!stopped)timer=setTimeout(update,2000)}
async function update(){
  if(pending||polling||stopped){schedule();return}polling=true;
  try{const s=await request('/api/runtime/status',null,3000);if(pending||stopped)return;if(!s.instanceId||!Array.isArray(s.services))throw Error(t("Invalid status"));if(expectedRoot&&s.applicationRoot!==expectedRoot)throw Object.assign(Error(t("This port now belongs to a different project. Reopen the original project’s native app; its address may have changed.")),{code:'ROOT_CHANGED'});const previous=last,wasConnected=connected,changed=last&&last.instanceId!==s.instanceId;last=s;connected=true;render(s);void syncLanguage();byId('reconnect').hidden=true;if(changed)message(t("A new runtime is connected. Review its status before using the controls."));else if(s.error)message(errorText(s.error));else if(s.phase==='ready'&&(!wasConnected||previous?.error||previous?.phase!=='ready'))message(t("Startup checks passed. Open app to continue."));}
  catch(error){if(pending||stopped)return;connected=false;byId('phase').textContent=error.code==='ROOT_CHANGED'?t("Different project"):t("Connection lost");byId('reconnect').hidden=false;message(error.code==='ROOT_CHANGED'?error.message:t("Cannot reach this runtime. Stopped is not confirmed. Reopen your native app if needed, then reconnect; the table shows the last observed state."));}
  finally{polling=false;enable();schedule()}
}
async function action(kind){
  if(pending||!connected||!last)return;pending=true;clearTimeout(timer);enable();
  const instanceId=last.instanceId;message(kind==='stop'?t("Stopping owned project services. Waiting for confirmed exit…"):kind==='logs'?t("Opening this project’s logs folder…"):t("Restart requested. Waiting for service status…"));
  try{
    if(kind==='stop'){
      const result=await request('/api/runtime/stop-and-wait',{instanceId},120000);
      if(result.stopped!==true||result.instanceId!==instanceId)throw Error(t("Stop was not confirmed by the expected runtime."));
      stopped=true;connected=false;last={...last,phase:'stopped',services:last.services.map(s=>({...s,running:false}))};render(last);byId('reconnect').hidden=false;message(t("Stopped: all managed project services exited. Reopen your native app to start again."));
    }else if(kind==='logs'){await request('/api/runtime/open-logs',{instanceId});message(t("Requested the project logs folder in Finder or Explorer. Logs remain in your project’s logs folder."));}
    else{await request('/api/runtime/restart',{scope:kind==='backend'?'backend':'all',instanceId});message(t("Restart accepted. This page will show the next startup result."));}
  }catch(error){message(kind==='stop'?t("Stop not confirmed. ")+errorText(error)+t(" Reconnect to check the runtime before retrying."):errorText(error));if(kind==='stop'){connected=false;byId('phase').textContent=t("Stop unconfirmed");byId('reconnect').hidden=false;}}
  finally{pending=false;enable();schedule()}
}
byId('restart').onclick=()=>action('restart');byId('backend').onclick=()=>action('backend');byId('stop').onclick=()=>action('stop');byId('logs').onclick=()=>action('logs');byId('reconnect').onclick=()=>{stopped=false;message(t("Reconnecting…"));void update()};
void update();
</script></body></html>`;

export function renderRuntimeStatusPage(manager) {
  const root = JSON.stringify(manager.state().applicationRoot).replaceAll('<', '\\u003c');
  return runtimeStatusPage.replace('const expectedRoot = null;', () => `const expectedRoot = ${root};`);
}
