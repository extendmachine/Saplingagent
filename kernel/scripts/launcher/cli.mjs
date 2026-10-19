import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { readConnections,defaultSelection,codexConnection,claudeConnections,openCodeConnections } from '../../contracts/ai-configuration.mjs';
import { initializeDownloadedRecords } from './recipient-records.mjs';
import { setup } from '../setup.mjs';
import {assertSetupAvailable} from '../../contracts/kernel.mjs';
import { codexBinary, claudeBinary, openCodeBinary, npmCommand, terminateOwned } from '../../contracts/local-process.mjs';

const t = (en, zh) => {
  const text = process.env.SAPLING_LANG === 'zh' ? zh : en;
  return process.platform === 'win32' ? text.replaceAll('.runtime/macos-install.lock', '.runtime/windows-install.lock') : text;
};

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
await assertSetupAvailable(root);
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
const env = { ...process.env, TMPDIR:path.join(root,'.runtime/tmp'),TMP:path.join(root,'.runtime/tmp'),TEMP:path.join(root,'.runtime/tmp'),PATH:path.dirname(process.execPath)+path.delimiter+(process.env.PATH||''),SEED_ROOT: root, SEED_CODEX_BIN: windows ? cli : path.join(root, 'kernel/scripts/macos/codex.sh'), SEED_IMPORT_EXISTING_AUTH: '0', CODEX_HOME: path.join(root, 'local-secrets/codex'), npm_config_cache: path.join(root, '.cache/npm') };
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
    child.once('error', () => { detach(); reject(new Error(t('Command could not start. For dependency repair, run: bash Saplingagent.sh install --repair', "命令无法启动。需要修复依赖时运行：bash Saplingagent.sh install --repair"))); });
    child.once('exit', (code, signal) => { detach(); resolve({ code: code ?? 1, signal, interrupted, output, errorOutput }); });
  });
}
async function required(command, args, options) {
  const result = await run(command, args, options);
  if (result.code !== 0) throw new Error(t(`Operation failed (exit code ${result.code}). Fix the error above and try again.`, `操作失败（退出码 ${result.code}）。请修复上方错误后重试。`));
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
  throw new Error(t('Unable to read project login status. Check the Codex installation, architecture and local-secrets/codex/config.toml; this error does not mean the project is not logged in.', "无法读取项目登录状态。请检查 Codex 安装、架构和 local-secrets/codex/config.toml；此错误不代表未登录。"));
}
async function install(repair = false, {coreOnly=false,appOnly=false} = {}) {
  console.log(t('Install / repair started. Checking project-local dependencies…','安装 / 修复已启动。正在检查项目内依赖…'));
  const lock = path.join(root, `.runtime/${platformName}-install.lock`);
  let ownsLock=true;
  try { await fs.mkdir(lock); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(t('Another installation is in progress. Wait; if its window has closed, remove .runtime/macos-install.lock as documented and retry.', "另一个安装正在进行。请等待；确认其窗口已关闭后，按文档清理 .runtime/macos-install.lock 再重试。"));
    throw error;
  }
  const stage = path.join(root, '.runtime', `codex-install-${randomUUID()}`);
  try {
    if(await exists(path.join(root,'.runtime/kernel/active-job.json')))throw new Error('Kernel maintenance is active. Use its recovery page before installing.');
    if(await exists(path.join(root,'.runtime/kernel-operation.lock')))throw new Error('A kernel/start operation is active. Finish it before installing dependencies.');
    await initializeDownloadedRecords(root);
    console.log(t('Release snapshot installed locally. Git and application source are not changed; upgrade only the kernel from the web control.', 'release 快照安装在本地。不修改 Git 或应用源码；请在网页内升级内核。'));
    if (!windows) for (const file of ['Saplingagent.sh', 'kernel/scripts/macos/bootstrap.sh', 'kernel/scripts/macos/codex.sh']) await fs.chmod(path.join(root, file), 0o755);
    if (!repair && !coreOnly && await installed()) {
      await localSetup();
      console.log(t('Dependency check complete: installed versions match this local source. See the source result above. Configure AI or start; use install --repair for damaged dependencies.', "依赖检查完成：已安装版本与当前本地源码配置一致。源码更新结果见上方。可以配置接口或启动；依赖损坏时使用 install --repair。"));
      return;
    }
    if(!appOnly){
    const packageFile = path.join(stage, 'package.json');
    await fs.mkdir(path.dirname(packageFile), { recursive: true });
    await fs.writeFile(packageFile, JSON.stringify({ name: 'saplingagent-local-codex', private: true, dependencies: { '@openai/codex': settings.codexVersion } }, null, 2) + '\n');
    console.log(t(`Installing project-local Codex ${settings.codexVersion}…`, `正在安装项目内 Codex ${settings.codexVersion}…`));
    await required(npm.command, [...npm.args, 'install', '--include=optional', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: path.dirname(packageFile) });
    const stagedCli = codexBinary(root, process.platform, process.arch, path.relative(root, stage));
    const version = await required(stagedCli, ['--version'], { capture: true });
    if (version.output.trim() !== `codex-cli ${settings.codexVersion}`) throw new Error(t('Codex version does not match configuration. Reinstall.', "Codex 版本与配置不符，请重新安装。"));
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
      console.log(t(`Installing locked dependencies for ${service}…`, `正在安装 ${service} 的锁定依赖…`));
      const installArgs = ['ci', '--include=optional', ...(['kernel', 'backend/agent-runtime'].includes(service) ? [] : ['--ignore-scripts']), '--no-audit', '--no-fund'];
      await required(npm.command, [...npm.args, ...installArgs], { cwd: path.join(root, service) });
    }
    await required(opencode, ['--version'], { capture: true });
    await required(claudeBinary(root), ['--version'], { capture: true });
    await localSetup();
    if(!coreOnly)await fs.writeFile(stampFile, JSON.stringify({ schemaVersion: 1, nodeVersion: process.versions.node, codexVersion: settings.codexVersion, arch: process.arch, signature: await signature(), installedAt: new Date().toISOString() }, null, 2) + '\n');
    console.log(coreOnly?t('Local kernel installed. Continuing to browser setup.','本地内核安装完成，即将打开配置网页。'):appOnly?t('Application dependencies are ready. Continuing the build.','应用依赖已就绪，继续构建。'):t('Installation complete. Choose Configure AI to connect your account or API provider, then Start app.','安装完成。请选择配置 AI 接口，连接自己的账号或 API 服务商，然后启动应用。'));
  } finally { await fs.rm(stage, { recursive: true, force: true }); if(ownsLock)await fs.rm(lock, { recursive: true, force: true }); }
}
async function login(deviceAuth) {
  if (!await installed()) throw new Error(t('Install project dependencies first: bash Saplingagent.sh install --repair', "请先安装项目依赖：bash Saplingagent.sh install --repair"));
  await localSetup();
  if (await loggedIn()) { console.log(t('Project login credentials are saved. Choose Start app in Saplingagent.sh; if requests fail authentication, log out of this project as documented and log in again.', "项目登录凭据已保存，可以选择启动应用。如果请求认证失败，请按文档退出项目账号后重新登录。")); return; }
  console.log(t('Official Codex will open your browser. Log in with your own ChatGPT/Codex account.', "官方 Codex 将打开浏览器，请使用自己的 ChatGPT / Codex 账号登录。"));
  await required(cli, [...authArgs, 'login', ...(deviceAuth ? ['--device-auth'] : [])]);
  if (!await loggedIn()) throw new Error(t('Login is incomplete. Choose Configure AI in Saplingagent.sh and open the ChatGPT account tab.', "登录未完成。请再次选择配置 AI 接口，并打开网页中的 ChatGPT 账号页签。"));
  const auth = path.join(env.CODEX_HOME, 'auth.json');
  if (await exists(auth)) await fs.chmod(auth, 0o600);
  console.log(t('Project login complete. Choose Start app in Saplingagent.sh.', "项目登录完成，请选择启动应用。"));
}
async function logout() {
  if (!await exists(cli)) throw new Error(t('Install project dependencies first: bash Saplingagent.sh install --repair', "请先安装项目依赖：bash Saplingagent.sh install --repair"));
  await required(cli, [...authArgs, 'logout'], { capture: true });
  console.log(t('Logged out of the Codex account for this project; application files and sessions are retained. Choose Configure AI in Saplingagent.sh to sign in again.', "已退出此项目的 Codex 账号，应用文件和会话保留。重新登录请选择配置 AI 接口。"));
}
async function configureOpenCode() {
  if (!await installed()) throw new Error(t('Install project dependencies first: bash Saplingagent.sh install --repair', "请先安装项目依赖：bash Saplingagent.sh install --repair"));
  const data = path.join(root, 'local-secrets/opencode/data');
  const config = path.join(root, 'local-secrets/opencode/config');
  await Promise.all([fs.mkdir(data, { recursive: true, mode: 0o700 }), fs.mkdir(config, { recursive: true, mode: 0o700 })]);
  console.log(t('OpenCode will configure a provider for this Saplingagent folder. Provider credentials stay under local-secrets/opencode/.', "OpenCode 将为当前 Saplingagent 文件夹配置服务商，凭据保存在 local-secrets/opencode/。"));
  const commandEnv = { ...env, XDG_DATA_HOME: data, XDG_CONFIG_HOME: config, OPENCODE_DISABLE_AUTOUPDATE: 'true', XDG_CACHE_HOME: path.join(root, '.cache/opencode'), XDG_STATE_HOME: path.join(root, 'data/opencode-state') };
  const command = opencode;
  const result = await run(command, ['auth', 'login'], { childEnv: commandEnv });
  if (result.interrupted) throw new Error(t('OpenCode provider setup was cancelled.', "OpenCode 服务商配置已取消。"));
  if (result.code !== 0) throw new Error(t(`OpenCode provider setup failed (exit code ${result.code}).`, `OpenCode 服务商配置失败（退出码 ${result.code}）。`));
  console.log(t('OpenCode provider saved. Restart Saplingagent, start a new conversation, then choose OpenCode.', "OpenCode 服务商已保存。请重启 Saplingagent，新建会话后选择 OpenCode。"));
}
async function configureAI(noOpen) {
  if (!await coreInstalled()) throw new Error(t('Install the local kernel first: bash Saplingagent.sh install','请先安装本地内核：bash Saplingagent.sh install'));
  await localSetup();
  console.log(t('Preparing independent AI configuration and project setup…','正在准备独立 AI 与项目配置网页…'));
  const {openConfiguration}=await import('../../configuration/bootstrap.mjs');
  const address=await openConfiguration(root,{noOpen:noOpen||process.env.SAPLING_NO_OPEN==='1'});
  console.log(t(`Project setup: http://127.0.0.1:${address.port}/. Continue in your browser. This script will close.`,`项目配置：http://127.0.0.1:${address.port}/。请在网页继续配置，此脚本将退出。`));
}
async function installKernelAndConfigure(repair=false){
 if(!await exists(path.join(root,'kernel/package.json')))return install(repair);
 const {ProjectLauncher}=await import('../../launcher/public.mjs');
 const runtime=await new ProjectLauncher(root).runtime();
 const signatureFile=path.join(root,'.runtime/core-install.json');
 const coreSignature=createHash('sha256').update(await fs.readFile(path.join(root,'kernel/package-lock.json'))).update(JSON.stringify(settings)).update(process.platform+process.arch).digest('hex');
 const previous=await fs.readFile(signatureFile,'utf8').then(JSON.parse,()=>null);
 if(repair||!await coreInstalled()||previous?.signature!==coreSignature){
  if(runtime.phase!=='stopped')throw new Error(t('Stop this project before repairing its kernel dependencies. Other project folders can keep running.','修复内核依赖前请停止当前项目，其他文件夹的项目可以继续运行。'));
  await install(true,{coreOnly:true});
  await fs.writeFile(signatureFile,JSON.stringify({signature:coreSignature,arch:process.arch})+'\n');
 }
 await configureAI(process.env.SAPLING_NO_OPEN==='1');
}
async function configuredAccess() {
  const connections = await readConnections(root);
  const selection = defaultSelection(connections);
  const profile = connections.profiles.find(p=>p.id===connections.activeId);
  if(profile?.kind === 'api'){
    if(selection.engine === 'codex')await codexConnection(root,connections);
    else if(selection.engine === 'claude')await claudeConnections(root,connections);
    else await openCodeConnections(root,connections);
    return true;
  }
  return loggedIn();
}
async function start(noOpen) {
  if (!await installed()) throw new Error(t('Installation is incomplete or dependency lockfiles have changed. Run: bash Saplingagent.sh install --repair', "安装未完成或依赖锁文件已变化。请运行：bash Saplingagent.sh install --repair"));
  await localSetup();
  if (!await configuredAccess()) throw new Error(t('Choose Configure AI in Saplingagent.sh and save an account or API scheme first.', '请先选择配置 AI 接口，在网页中保存账号或 API 方案。'));
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
        const response = await fetch(`http://127.0.0.1:${frontPort}/api/status`, { signal: AbortSignal.timeout(1500) });
        const status = await response.json();
        if (status.ready && status.authenticated && status.mcp?.ready) {
          const front = await fetch(`http://127.0.0.1:${frontPort}/`, { signal: AbortSignal.timeout(1500) });
          if (front.ok) {
            ready = true;
            console.log(status.provider === 'OpenCode' ? t(`Connected to OpenCode: ${status.model}; project MCP connected.`, `已连接 OpenCode：${status.model}；项目 MCP 已连接。`) : t(`Connected to ${status.provider || 'Agent'}: ${status.model}; ${status.mcp.tools.length} MCP tools; ${status.skills.length} Skills.`, `已连接 ${status.provider || 'Agent'}：${status.model}；${status.mcp.tools.length} 个 MCP 工具；${status.skills.length} 个 Skills。`));
            console.log(t(`Web page: http://127.0.0.1:${frontPort}/\nKeep this window open; press Control+C to stop these services.`, `网页：http://127.0.0.1:${frontPort}/\n请保持终端窗口打开；按 Control+C 停止这些服务。`));
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
      console.error(t(`Model/authentication/MCP is not ready. Keep this window open, inspect local diagnostics and retry at http://127.0.0.1:${frontPort}/__saplingagent/runtime. Choose Diagnostics in Saplingagent.sh to check installation/login.`, `模型、认证或 MCP 尚未就绪。请保持终端窗口打开，检查诊断，并在 http://127.0.0.1:${frontPort}/__saplingagent/runtime 重试。选择服务诊断可检查安装和登录状态。`));
    }
    const result = await exit;
    if (result.code !== 0 && !interrupted) throw new Error(t(`Services stopped (exit code ${result.code}). Check for port, installation or authentication errors.`, `服务已停止（退出码 ${result.code}）。请检查端口、安装或认证错误。`));
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop); process.off('SIGHUP', stop);
    if (!ended) { stopRequested = true; if (windows) void terminateOwned(child, { graceMs: 4000 }).catch(() => {}); else child.kill('SIGTERM'); }
    if (stopRequested && !ended) await Promise.race([exit.catch(() => {}), delay(6000)]);
  }
}
async function doctor() {
  console.log(t(`${windows ? 'Windows' : 'macOS'} ${process.arch}; Node ${process.versions.node}; folder: ${root}`, `${windows ? 'Windows' : 'macOS'} ${process.arch}；Node ${process.versions.node}；项目目录：${root}`));
  const local = await installed();
  console.log(t(`Project dependencies:${local ? 'installed' : 'not installed or changed; run bash Saplingagent.sh install --repair'}`, `项目依赖：${local ? '已安装' : '未安装或已变化；请运行 bash Saplingagent.sh install --repair'}`));
  let authenticated = false;
  if (await exists(cli)) {
    const version = await run(cli, ['--version'], { capture: true });
    const versionLabel = version.output.trim().match(/^codex-cli (\d+\.\d+\.\d+(?:[-.a-z0-9]+)?)$/i)?.[1];
    if (version.code !== 0 || !versionLabel) throw new Error(t('Codex executable check failed. Reinstall; login status was not checked.', "Codex 可执行文件检查失败。请重新安装；本次未检查登录状态。"));
    console.log(`Codex：${versionLabel}`);
    authenticated = await configuredAccess();
    console.log(t(`Project AI access:${authenticated ? 'configured (does not verify current network or quota)' : 'not configured; choose Configure AI in Saplingagent.sh'}`, `项目 AI 接入：${authenticated ? '已配置（未验证当前网络或额度）' : '尚未配置；请选择配置 AI 接口'}`));
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
      console.log(t(`Runtime address: http://127.0.0.1:${port}/`, `运行地址：http://127.0.0.1:${port}/`));
    }
    const status = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(2000) }).then(r => r.json());
    online = status.ready === true;
    console.log(t(`Runtime status on configured ports:${online ? 'ready' : 'process running but Agent not ready'}; model:${status.model || 'not selected'}; MCP:${status.mcp?.tools?.length || 0}; Skills:${status.skills?.length || 0}`, `运行状态：${online ? '就绪' : '进程运行中，但 Agent 尚未就绪'}；模型：${status.model || '未选择'}；MCP：${status.mcp?.tools?.length || 0}；Skills：${status.skills?.length || 0}`));
  } catch { console.log(t('Runtime status: not started. Install, log in, then choose Start app in Saplingagent.sh.', "运行状态：尚未启动。请安装、登录后选择启动应用。")); }
  console.log(t('Diagnostics report status only, without printing credentials or making model requests.', "诊断只报告状态，不显示凭据，也不发送模型请求。"));
  if (!local || !authenticated) process.exitCode = 1;
}

try {
  if (!['darwin', 'win32'].includes(process.platform)) throw new Error(t('This entry point supports macOS and Windows only.', "此入口支持 macOS 和 Windows。"));
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
  else throw new Error(t('Available actions: install [--repair] / login [--device-auth] / start [--no-open] / doctor / logout / configure [--no-open] / opencode / kernel.', "可用操作：install [--repair] / login [--device-auth] / start [--no-open] / doctor / logout / configure [--no-open] / opencode / kernel。"));
} catch (error) { console.error(error.message); process.exitCode = 1; }
