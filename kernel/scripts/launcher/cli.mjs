import { readLanguage, writeLanguage } from '../../localization/store.mjs';
import { normalizeLanguage, describeError, formatMessage } from '../../localization/public.mjs';
import { launcherMessages } from '../../localization/launcher-messages.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { readConnections,defaultSelection,codexConnection,claudeConnections,openCodeConnections } from '../../contracts/ai-configuration.mjs';
import { initializeDownloadedRecords } from './recipient-records.mjs';
import { setup } from '../setup.mjs';
import {prepareManagedEnvironment} from '../../contracts/local-storage.mjs';
import {assertSetupAvailable} from '../../contracts/kernel.mjs';
import {readMcpAccess,assertMcpClientsStopped} from '../../contracts/mcp-access.mjs';
import { codexBinary, claudeBinary, openCodeBinary, npmCommand, terminateOwned } from '../../contracts/local-process.mjs';

const t = (key, params) => {
  const text = formatMessage(launcherMessages,process.env.SAPLING_LANG,key,params);
  return process.platform === 'win32' ? text.replaceAll('.runtime/macos-install.lock', '.runtime/windows-install.lock') : text;
};

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const explicitLanguage=process.env.SAPLING_LANG_EXPLICIT==='1'&&['en','zh'].includes(process.env.SAPLING_LANG);
process.env.SAPLING_LANG=explicitLanguage?process.env.SAPLING_LANG:await readLanguage(root,normalizeLanguage(process.env.SAPLING_LANG||process.env.LC_ALL||process.env.LANG));
try{await assertSetupAvailable(root);if(explicitLanguage)await writeLanguage(root,process.env.SAPLING_LANG);}catch(error){const info=describeError(error,process.env.SAPLING_LANG);console.error([info.summary,info.action,info.code,info.details].filter(Boolean).join('\n'));process.exit(1);}
// The explicit command choice is consumed here; configuration children re-read the saved preference.
process.env.SAPLING_LANG_EXPLICIT='0';
const windows = process.platform === 'win32';
const platformName = windows ? 'windows' : 'macos';
const launcher = 'Saplingagent.sh';
const settings = JSON.parse(await fs.readFile(path.join(root, `kernel/config/${platformName}.json`), 'utf8'));
const cli = codexBinary(root);
const npm = npmCommand();
const opencode = openCodeBinary(root);
const stampFile = path.join(root, `.runtime/${platformName}-install.json`);
const services = [...(await fs.access(path.join(root,'kernel/package.json')).then(()=>['kernel'],()=>[])), 'front', 'backend/app-builder', 'backend/mcp-runtime', 'backend/agent-runtime'];
const authArgs = ['-c', 'cli_auth_credentials_store="file"'];
const env = { ...await prepareManagedEnvironment(root), TMPDIR:path.join(root,'.runtime/tmp'),TMP:path.join(root,'.runtime/tmp'),TEMP:path.join(root,'.runtime/tmp'),PATH:path.dirname(process.execPath)+path.delimiter+(process.env.PATH||''),SEED_ROOT: root, SEED_CODEX_BIN: windows ? cli : path.join(root, 'kernel/scripts/macos/codex.sh'), SEED_IMPORT_EXISTING_AUTH: '0', CODEX_HOME: path.join(root, 'local-secrets/codex'), npm_config_cache: path.join(root, '.cache/npm') };
for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN']) delete env[key];

async function run(command, args, { cwd = root, capture = false, childEnv = env } = {}) {
  await fs.mkdir(path.join(root,'.runtime/tmp'),{recursive:true});
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: childEnv, detached: false, windowsHide: capture, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let output = '', errorOutput = '', interrupted = false;
    if (capture) {
      child.stdout.on('data', chunk => { output = (output + chunk).slice(-16000); });
      child.stderr.on('data', chunk => { errorOutput = (errorOutput + chunk).slice(-16000); });
    }
    const forward = signal => { if (child.exitCode === null) { interrupted = true; if (windows) void terminateOwned(child).catch(() => {}); else child.kill(signal); } };
    const onInterrupt = () => forward('SIGINT'), onTerminate = () => forward('SIGTERM');
    process.on('SIGINT', onInterrupt); process.on('SIGTERM', onTerminate); process.on('SIGHUP', onTerminate);
    const detach = () => { process.off('SIGINT', onInterrupt); process.off('SIGTERM', onTerminate); process.off('SIGHUP', onTerminate); };
    child.once('error', () => { detach(); reject(new Error(t("Command could not start. For dependency repair, run: bash Saplingagent.sh install --repair"))); });
    child.once('exit', (code, signal) => { detach(); resolve({ code: code ?? 1, signal, interrupted, output, errorOutput }); });
  });
}
async function required(command, args, options) {
  const result = await run(command, args, options);
  if (result.code !== 0) throw new Error(t("Operation failed (exit code {p0}). Fix the error above and try again.",{p0:(result.code)}));
  return result;
}
async function exists(file) { return fs.access(file).then(() => true, () => false); }
async function signature() {
  const hash = createHash('sha256').update(JSON.stringify(settings));
  for (const service of services.filter(s=>s!=='kernel')) hash.update(await fs.readFile(path.join(root, service, 'package-lock.json')));
  return hash.digest('hex');
}
async function installed() {
  try {
    const stamp = JSON.parse(await fs.readFile(stampFile, 'utf8'));
    return stamp.signature === await signature() && stamp.arch === process.arch && await exists(cli)
      && await exists(path.join(root, 'front/node_modules/vite/bin/vite.js'))
      && await exists(path.join(root, 'backend/mcp-runtime/node_modules/@modelcontextprotocol/sdk/package.json'))
      && await exists(opencode) && await exists(claudeBinary(root));
  } catch { return false; }
}
async function coreInstalled() {
  if (!await exists(path.join(root,'kernel/package.json'))) return installed();
  return await exists(cli) && await exists(opencode) && await exists(claudeBinary(root)) && await exists(path.join(root,'kernel/node_modules/vite/bin/vite.js'));
}
async function localSetup() {
  await setup({ importExistingAuth: false, projectRoot: root });
  const configFile = path.join(env.CODEX_HOME, 'config.toml');
  try { await fs.writeFile(configFile, 'cli_auth_credentials_store = "file"\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
async function loggedIn() {
  const result = await run(cli, [...authArgs, 'login', 'status'], { capture: true });
  if (result.code === 0) return true;
  if (/not logged in/i.test(result.output + result.errorOutput)) return false;
  throw new Error(t("Unable to read project login status. Check the Codex installation, architecture and local-secrets/codex/config.toml; this error does not mean the project is not logged in."));
}
async function install(repair = false, {coreOnly=false,appOnly=false} = {}) {
  console.log(t("Install / repair started. Checking project-local dependencies…"));
  const lock = path.join(root, `.runtime/${platformName}-install.lock`);
  let ownsLock=true;
  try { await fs.mkdir(lock); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(t("Another installation is in progress. Wait; if its window has closed, remove .runtime/macos-install.lock as documented and retry."));
    throw error;
  }
  const stage = path.join(root, '.runtime', `codex-install-${randomUUID()}`);
  try {
    if(await exists(path.join(root,'.runtime/kernel/active-job.json')))throw new Error(formatMessage(launcherMessages,process.env.SAPLING_LANG,'Kernel maintenance is active. Use its recovery page before installing.'));
    if(await exists(path.join(root,'.runtime/kernel-operation.lock')))throw new Error(formatMessage(launcherMessages,process.env.SAPLING_LANG,'A kernel/start operation is active. Finish it before installing dependencies.'));
    await assertMcpClientsStopped(root);
    await initializeDownloadedRecords(root);
    console.log(t("Release snapshot installed locally. Git and application source are not changed; upgrade only the kernel from the web control."));
    if (!windows) for (const file of ['Saplingagent.sh', 'kernel/scripts/macos/bootstrap.sh', 'kernel/scripts/macos/codex.sh']) await fs.chmod(path.join(root, file), 0o755);
    if (!repair && !coreOnly && await installed()) {
      await localSetup();
      console.log(t("Dependency check complete: installed versions match this local source. See the source result above. Configure AI or start; use install --repair for damaged dependencies."));
      return;
    }
    if(!appOnly){
    const packageFile = path.join(stage, 'package.json');
    await fs.mkdir(path.dirname(packageFile), { recursive: true });
    await fs.writeFile(packageFile, JSON.stringify({ name: 'saplingagent-local-codex', private: true, dependencies: { '@openai/codex': settings.codexVersion } }, null, 2) + '\n');
    console.log(t("Installing project-local Codex {p0}…",{p0:(settings.codexVersion)}));
    await required(npm.command, [...npm.args, 'install', '--include=optional', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: path.dirname(packageFile) });
    const stagedCli = codexBinary(root, process.platform, process.arch, path.relative(root, stage));
    const version = await required(stagedCli, ['--version'], { capture: true });
    if (version.output.trim() !== `codex-cli ${settings.codexVersion}`) throw new Error(t("Codex version does not match configuration. Reinstall."));
    const destination = path.join(root, '.runtime/codex');
    const previous = path.join(root, '.runtime', `codex-previous-${randomUUID()}`);
    const hasPrevious = await exists(destination);
    if (hasPrevious) await fs.rename(destination, previous);
    try { await fs.rename(stage, destination); }
    catch (error) { if (hasPrevious) await fs.rename(previous, destination); throw error; }
    if (hasPrevious) await fs.rm(previous, { recursive: true, force: true });
    }
    // A failed staging download leaves a previously complete installation usable.
    // Once npm ci can replace business dependencies, the old marker is no longer valid.
    await fs.rm(stampFile, { force: true });
    for (const service of coreOnly?['kernel']:appOnly?services.filter(s=>s!=='kernel'):services) {
      console.log(t("Installing locked dependencies for {p0}…",{p0:(service)}));
      const installArgs = ['ci', '--include=optional', ...(['kernel', 'backend/agent-runtime'].includes(service) ? [] : ['--ignore-scripts']), '--no-audit', '--no-fund'];
      await required(npm.command, [...npm.args, ...installArgs], { cwd: path.join(root, service) });
    }
    await required(opencode, ['--version'], { capture: true });
    await required(claudeBinary(root), ['--version'], { capture: true });
    await localSetup();
    if(!coreOnly)await fs.writeFile(stampFile, JSON.stringify({ schemaVersion: 1, nodeVersion: process.versions.node, codexVersion: settings.codexVersion, arch: process.arch, signature: await signature(), installedAt: new Date().toISOString() }, null, 2) + '\n');
    console.log(coreOnly?t("Local kernel installed. Continuing to browser setup."):appOnly?t("Application dependencies are ready. Continuing the build."):t("Installation complete. Choose Configure AI to connect your account or API provider, then Start app."));
  } finally { await fs.rm(stage, { recursive: true, force: true }); if(ownsLock)await fs.rm(lock, { recursive: true, force: true }); }
}
async function login(deviceAuth) {
  if (!await installed()) throw new Error(t("Install project dependencies first: bash Saplingagent.sh install --repair"));
  await localSetup();
  if (await loggedIn()) { console.log(t("Project login credentials are saved. Choose Start app in Saplingagent.sh; if requests fail authentication, log out of this project as documented and log in again.")); return; }
  console.log(t("Official Codex will open your browser. Log in with your own ChatGPT/Codex account."));
  await required(cli, [...authArgs, 'login', ...(deviceAuth ? ['--device-auth'] : [])]);
  if (!await loggedIn()) throw new Error(t("Login is incomplete. Choose Configure AI in Saplingagent.sh and open the ChatGPT account tab."));
  const auth = path.join(env.CODEX_HOME, 'auth.json');
  if (await exists(auth)) await fs.chmod(auth, 0o600);
  console.log(t("Project login complete. Choose Start app in Saplingagent.sh."));
}
async function logout() {
  if (!await exists(cli)) throw new Error(t("Install project dependencies first: bash Saplingagent.sh install --repair"));
  await required(cli, [...authArgs, 'logout'], { capture: true });
  console.log(t("Logged out of the Codex account for this project; application files and sessions are retained. Choose Configure AI in Saplingagent.sh to sign in again."));
}
async function configureOpenCode() {
  if (!await installed()) throw new Error(t("Install project dependencies first: bash Saplingagent.sh install --repair"));
  const data = path.join(root, 'local-secrets/opencode/data');
  const config = path.join(root, 'local-secrets/opencode/config');
  await Promise.all([fs.mkdir(data, { recursive: true, mode: 0o700 }), fs.mkdir(config, { recursive: true, mode: 0o700 })]);
  console.log(t("OpenCode will configure a provider for this Saplingagent folder. Provider credentials stay under local-secrets/opencode/."));
  const commandEnv = { ...env, XDG_DATA_HOME: data, XDG_CONFIG_HOME: config, OPENCODE_DISABLE_AUTOUPDATE: 'true', XDG_CACHE_HOME: path.join(root, '.cache/opencode'), XDG_STATE_HOME: path.join(root, 'data/opencode-state') };
  const command = opencode;
  const result = await run(command, ['auth', 'login'], { childEnv: commandEnv });
  if (result.interrupted) throw new Error(t("OpenCode provider setup was cancelled."));
  if (result.code !== 0) throw new Error(t("OpenCode provider setup failed (exit code {p0}).",{p0:(result.code)}));
  console.log(t("OpenCode provider saved. Restart Saplingagent, start a new conversation, then choose OpenCode."));
}
async function configureAI(noOpen) {
  if (!await coreInstalled()) throw new Error(t("Install the local kernel first: bash Saplingagent.sh install"));
  await localSetup();
  console.log(t("Preparing independent AI configuration and project setup…"));
  const {openConfiguration}=await import('../../configuration/bootstrap.mjs');
  const address=await openConfiguration(root,{noOpen:noOpen||process.env.SAPLING_NO_OPEN==='1'});
  if(address.relativeDirectory)console.log(t("Temporary configuration folder (beside this project): {p0} — removed after Finish setup.",{p0:(address.relativeDirectory)}));
  console.log(t("Project setup: http://127.0.0.1:{p0}/. Continue in your browser. This script will close.",{p0:(address.port)}));
}
async function installKernelAndConfigure(repair=false){
 if(!await exists(path.join(root,'kernel/package.json')))return install(repair);
 const {ProjectLauncher}=await import('../../launcher/public.mjs');
 const runtime=await new ProjectLauncher(root).runtime();
 const signatureFile=path.join(root,'.runtime/core-install.json');
 const coreSignature=createHash('sha256').update(await fs.readFile(path.join(root,'kernel/package-lock.json'))).update(JSON.stringify(settings)).update(process.platform+process.arch).digest('hex');
 const previous=await fs.readFile(signatureFile,'utf8').then(JSON.parse,()=>null);
 if(repair||!await coreInstalled()||previous?.signature!==coreSignature){
  if(runtime.phase!=='stopped')throw new Error(t("Stop this project before repairing its kernel dependencies. Other project folders can keep running."));
  await install(true,{coreOnly:true});
  await fs.writeFile(signatureFile,JSON.stringify({signature:coreSignature,arch:process.arch})+'\n');
 }
 await configureAI(process.env.SAPLING_NO_OPEN==='1');
}
async function configuredAccess() {
  const mcp = await readMcpAccess(root);
  if (mcp.enabled && mcp.externalOnly) return true;
  const connections = await readConnections(root);
  const selection = defaultSelection(connections);
  const profile = connections.profiles.find(p=>p.id===connections.activeId);
  if(profile?.kind === 'api' || profile?.kind === 'subscription'){
    if(selection.engine === 'codex')await codexConnection(root,connections);
    else if(selection.engine === 'claude')await claudeConnections(root,connections);
    else await openCodeConnections(root,connections);
    return true;
  }
  return loggedIn();
}
async function start(noOpen) {
  if (!await installed()) throw new Error(t("Installation is incomplete or dependency lockfiles have changed. Run: bash Saplingagent.sh install --repair"));
  await localSetup();
  if (!await configuredAccess()) throw new Error(t("Choose Configure AI in Saplingagent.sh and save an account/API/subscription scheme or enable external-only MCP access."));
  const config = JSON.parse(await fs.readFile(path.join(root, 'config/runtime.json'), 'utf8'));
  const child = spawn(process.execPath, [path.join(root, 'scripts/dev.mjs')], { cwd: root, env, detached: false, stdio: ['inherit', 'pipe', 'pipe'] });
  let ended = false, interrupted = false, stopRequested = false, launched = false, startupOutput = '', frontPort = config.frontPort;
  child.stdout.on('data', chunk => {
    process.stdout.write(chunk);
    startupOutput = (startupOutput + chunk).slice(-2048);
    const announced = startupOutput.match(/(?:^|\n)Saplingagent: http:\/\/127\.0\.0\.1:(\d+)\//);
    if (announced && Number(announced[1]) >= 1024 && Number(announced[1]) <= 65535) { frontPort = Number(announced[1]); launched = true; }
  });
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  const exit = new Promise(resolve => {
    child.once('error', () => { ended = true; resolve({ code: 1 }); });
    child.once('exit', (code, signal) => { ended = true; resolve({ code: code ?? 1, signal }); });
  });
  const stop = () => { interrupted = true; stopRequested = true; if (!ended) if (windows) void terminateOwned(child, { graceMs: 4000 }).catch(() => {}); else child.kill('SIGTERM'); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop); process.on('SIGHUP', stop);
  try {
    const deadline = Date.now() + 120000;
    let ready = false;
    while (!ended && !interrupted && Date.now() < deadline) {
      if (!launched) { await delay(100); continue; }
      try {
        const lifecycleResponse = await fetch(`http://127.0.0.1:${frontPort}/api/runtime/status`, { signal: AbortSignal.timeout(1500) });
        if (!lifecycleResponse.ok) { await delay(300); continue; }
        const lifecycle = await lifecycleResponse.json();
        if (lifecycle.phase === 'failed' && !lifecycle.busy) break;
        if (lifecycle.phase !== 'ready' || lifecycle.busy) { await delay(300); continue; }
        const externalMcp = lifecycle.aiConnection === 'external-mcp';
        const status = externalMcp ? null : await fetch(`http://127.0.0.1:${frontPort}/api/status`, { signal: AbortSignal.timeout(1500) }).then(response => response.ok ? response.json() : null);
        if (externalMcp || (status?.ready && status.authenticated && status.mcp?.ready)) {
          const front = await fetch(`http://127.0.0.1:${frontPort}/`, { signal: AbortSignal.timeout(1500) });
          if (front.ok) {
            ready = true;
            console.log(externalMcp ? t("External AI / MCP mode: app services are ready. Connect from your own AI client; no built-in model login is required.") : status.provider === 'OpenCode' ? t("Connected to OpenCode: {p0}; project MCP connected.",{p0:(status.model)}) : t("Connected to {p0}: {p1}; {p2} MCP tools; {p3} Skills.",{p0:(status.provider || 'Agent'),p1:(status.model),p2:(status.mcp.tools.length),p3:(status.skills.length)}));
            console.log(t("Web page: http://127.0.0.1:{p0}/\nKeep this window open; press Control+C to stop these services.",{p0:(frontPort)}));
            if (!noOpen) {
              if (windows) await run('powershell.exe', ['-NoProfile', '-Command', `Start-Process 'http://127.0.0.1:${frontPort}/'`], { capture: true });
              else await run('/usr/bin/open', [`http://127.0.0.1:${frontPort}/`], { capture: true });
            }
            break;
          }
        }
      } catch {}
      await delay(300);
    }
    if (!ready && !ended && !interrupted) {
      console.error(t("Application services or the selected AI connection are not ready. Keep this window open, inspect local diagnostics and retry at http://127.0.0.1:{p0}/__saplingagent/runtime.",{p0:(frontPort)}));
    }
    const result = await exit;
    if (result.code !== 0 && !interrupted) throw new Error(t("Services stopped (exit code {p0}). Check for port, installation or authentication errors.",{p0:(result.code)}));
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop); process.off('SIGHUP', stop);
    if (!ended) { stopRequested = true; if (windows) void terminateOwned(child, { graceMs: 4000 }).catch(() => {}); else child.kill('SIGTERM'); }
    if (stopRequested && !ended) await Promise.race([exit.catch(() => {}), delay(6000)]);
  }
}
async function doctor() {
  console.log(t("{p0} {p1}; Node {p2}; folder: {p3}",{p0:(windows ? 'Windows' : 'macOS'),p1:(process.arch),p2:(process.versions.node),p3:(root)}));
  const local = await installed();
  console.log(t("Project dependencies:{p0}",{p0:(local ?t("installed"):t("not installed or changed; run bash Saplingagent.sh install --repair"))}));
  let authenticated = false;
  if (await exists(cli)) {
    const version = await run(cli, ['--version'], { capture: true });
    const versionLabel = version.output.trim().match(/^codex-cli (\d+\.\d+\.\d+(?:[-.a-z0-9]+)?)$/i)?.[1];
    if (version.code !== 0 || !versionLabel) throw new Error(t("Codex executable check failed. Reinstall; login status was not checked."));
    console.log(`Codex：${versionLabel}`);
    authenticated = await configuredAccess();
    console.log(t("Project AI access:{p0}",{p0:(authenticated ?t("configured (does not verify current network or quota)"):t("not configured; choose Configure AI in Saplingagent.sh"))}));
  }
  const config = JSON.parse(await fs.readFile(path.join(root, 'config/runtime.json'), 'utf8'));
  let online = false;
  try {
    let address;
    try { address = JSON.parse(await fs.readFile(path.join(root, '.runtime/runtime-address.json'), 'utf8')); } catch {}
    let port = config.agentPort;
    if (address) {
      if (!Number.isInteger(address.ports?.frontPort) || address.ports.frontPort < 1024 || address.ports.frontPort > 65535 || typeof address.instanceId !== 'string') throw new Error('Invalid runtime discovery');
      port = address.ports.frontPort;
      const state = await fetch(`http://127.0.0.1:${port}/api/runtime/status`, { signal: AbortSignal.timeout(2000) }).then(r => r.json());
      if (state.instanceId !== address.instanceId) throw new Error('Stale runtime discovery');
      console.log(t("Runtime address: http://127.0.0.1:{p0}/",{p0:(port)}));
    }
    const status = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(2000) }).then(r => r.json());
    online = status.ready === true;
    console.log(t("Runtime status on configured ports:{p0}; model:{p1}; MCP:{p2}; Skills:{p3}",{p0:(online ?t("ready"):t("process running but Agent not ready")),p1:(status.model ||t("not selected")),p2:(status.mcp?.tools?.length || 0),p3:(status.skills?.length || 0)}));
  } catch { console.log(t("Runtime status: not started. Install, log in, then choose Start app in Saplingagent.sh.")); }
  console.log(t("Diagnostics report status only, without printing credentials or making model requests."));
  if (!local || !authenticated) process.exitCode = 1;
}

try {
  if (!['darwin', 'win32'].includes(process.platform)) throw new Error(t("This entry point supports macOS and Windows only."));
  const [action, ...args] = process.argv.slice(2);
  if (action === 'install' && args.every(x => ['--repair','--app-only'].includes(x))) {if(args.includes('--app-only'))await install(args.includes('--repair'),{appOnly:true});else await installKernelAndConfigure(args.includes('--repair'));}
  else if (action === 'login' && args.every(x => x === '--device-auth')) await login(args.includes('--device-auth'));
  else if (action === 'start' && args.every(x => x === '--no-open')) await start(args.includes('--no-open'));
  else if (action === 'kernel') await required(process.execPath,[path.join(root,'kernel/cli.mjs'),...args]);
  else if (action === 'ensure-dependencies' && !args.length) { const {ensureApplicationDependencies}=await import('../../launcher/dependencies.mjs'); await ensureApplicationDependencies(root,{onProgress:message=>console.log(message)}); }
  else if (action === 'doctor' && !args.length) await doctor();
  else if (action === 'logout' && !args.length) await logout();
  else if (action === 'configure' && args.every(x=>x==='--no-open')) await configureAI(args.includes('--no-open'));
  else if (action === 'opencode' && !args.length) await configureOpenCode();
  else throw new Error(t("Available actions: install [--repair] / login [--device-auth] / start [--no-open] / doctor / logout / configure [--no-open] / opencode / kernel."));
} catch (error) { const info=describeError(error,process.env.SAPLING_LANG);console.error([info.summary,info.action,info.code,info.details].filter(Boolean).join('\n')); process.exitCode = 1; }
