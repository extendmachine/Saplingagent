import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { setup } from '../setup.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const settings = JSON.parse(await fs.readFile(path.join(root, 'config/macos.json'), 'utf8'));
const cli = path.join(root, '.runtime/codex/node_modules/.bin/codex');
const stampFile = path.join(root, '.runtime/macos-install.json');
const services = ['front', 'backend/app-builder', 'backend/mcp-runtime'];
const authArgs = ['-c', 'cli_auth_credentials_store="file"'];
const env = { ...process.env, SEED_ROOT: root, SEED_CODEX_BIN: path.join(root, 'scripts/macos/codex.sh'), SEED_IMPORT_EXISTING_AUTH: '0', CODEX_HOME: path.join(root, 'local-secrets/codex'), npm_config_cache: path.join(root, '.cache/npm') };
for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN']) delete env[key];

function run(command, args, { cwd = root, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let output = '', errorOutput = '';
    if (capture) {
      child.stdout.on('data', chunk => { output = (output + chunk).slice(-16000); });
      child.stderr.on('data', chunk => { errorOutput = (errorOutput + chunk).slice(-16000); });
    }
    const forward = signal => { if (child.exitCode === null) child.kill(signal); };
    const onInterrupt = () => forward('SIGINT'), onTerminate = () => forward('SIGTERM');
    process.on('SIGINT', onInterrupt); process.on('SIGTERM', onTerminate); process.on('SIGHUP', onTerminate);
    const detach = () => { process.off('SIGINT', onInterrupt); process.off('SIGTERM', onTerminate); process.off('SIGHUP', onTerminate); };
    child.once('error', () => { detach(); reject(new Error('命令无法启动，请重新运行 1-安装.command。')); });
    child.once('exit', (code, signal) => { detach(); resolve({ code: code ?? 1, signal, output, errorOutput }); });
  });
}
async function required(command, args, options) {
  const result = await run(command, args, options);
  if (result.code !== 0) throw new Error(`操作失败（退出码 ${result.code}）。请查看上面的原因，修复后重试。`);
  return result;
}
async function exists(file) { return fs.access(file).then(() => true, () => false); }
async function signature() {
  const hash = createHash('sha256').update(JSON.stringify(settings));
  for (const service of services) hash.update(await fs.readFile(path.join(root, service, 'package-lock.json')));
  return hash.digest('hex');
}
async function installed() {
  try {
    const stamp = JSON.parse(await fs.readFile(stampFile, 'utf8'));
    return stamp.signature === await signature() && stamp.arch === process.arch && await exists(cli)
      && await exists(path.join(root, 'front/node_modules/vite/bin/vite.js'))
      && await exists(path.join(root, 'backend/mcp-runtime/node_modules/@modelcontextprotocol/sdk/package.json'));
  } catch { return false; }
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
  throw new Error('无法读取项目登录状态。请检查 Codex 安装、架构和 local-secrets/codex/config.toml；该错误不能视为尚未登录。');
}
async function install(repair = false) {
  const lock = path.join(root, '.runtime/macos-install.lock');
  try { await fs.mkdir(lock); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('另一轮安装尚未结束。请等待；若安装窗口已关闭，可按说明移除 .runtime/macos-install.lock 后重试。');
    throw error;
  }
  const stage = path.join(root, '.runtime', `codex-install-${randomUUID()}`);
  try {
    for (const file of ['1-安装.command', '2-登录Codex.command', '3-启动Saplingagent.command', '4-诊断.command', 'scripts/macos/bootstrap.sh', 'scripts/macos/entry.sh', 'scripts/macos/codex.sh']) await fs.chmod(path.join(root, file), 0o755);
    if (!repair && await installed()) {
      await localSetup();
      console.log('项目环境已安装且版本一致，无需重复下载。可登录或启动；若依赖损坏，用 bash "1-安装.command" --repair 修复。');
      return;
    }
    const packageFile = path.join(stage, 'package.json');
    await fs.mkdir(path.dirname(packageFile), { recursive: true });
    await fs.writeFile(packageFile, JSON.stringify({ name: 'saplingagent-local-codex', private: true, dependencies: { '@openai/codex': settings.codexVersion } }, null, 2) + '\n');
    console.log(`安装项目内 Codex ${settings.codexVersion}…`);
    await required('npm', ['install', '--include=optional', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: path.dirname(packageFile) });
    const stagedCli = path.join(stage, 'node_modules/.bin/codex');
    const version = await required(stagedCli, ['--version'], { capture: true });
    if (version.output.trim() !== `codex-cli ${settings.codexVersion}`) throw new Error('Codex 版本与配置不一致，请重新安装。');
    const destination = path.join(root, '.runtime/codex');
    const previous = path.join(root, '.runtime', `codex-previous-${randomUUID()}`);
    const hasPrevious = await exists(destination);
    if (hasPrevious) await fs.rename(destination, previous);
    try { await fs.rename(stage, destination); }
    catch (error) { if (hasPrevious) await fs.rename(previous, destination); throw error; }
    if (hasPrevious) await fs.rm(previous, { recursive: true, force: true });
    // A failed staging download leaves a previously complete installation usable.
    // Once npm ci can replace business dependencies, the old marker is no longer valid.
    await fs.rm(stampFile, { force: true });
    for (const service of services) {
      console.log(`安装 ${service} 的锁定依赖…`);
      await required('npm', ['ci', '--include=optional', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: path.join(root, service) });
    }
    await localSetup();
    await fs.writeFile(stampFile, JSON.stringify({ schemaVersion: 1, nodeVersion: process.versions.node, codexVersion: settings.codexVersion, arch: process.arch, signature: await signature(), installedAt: new Date().toISOString() }, null, 2) + '\n');
    console.log('安装完成。双击 2-登录Codex.command，用你自己的账号登录，然后双击 3-启动Saplingagent.command。');
  } finally { await fs.rm(stage, { recursive: true, force: true }); await fs.rm(lock, { recursive: true, force: true }); }
}
async function login(deviceAuth) {
  if (!await installed()) throw new Error('请先双击 1-安装.command。');
  await localSetup();
  if (await loggedIn()) { console.log('本项目已保存登录方式。可以运行 3-启动Saplingagent.command；若请求报认证错误，请先按说明退出项目账号，再重新登录。'); return; }
  console.log('接下来由官方 Codex 打开浏览器。请使用自己的 ChatGPT/Codex 账号完成登录。');
  await required(cli, [...authArgs, 'login', ...(deviceAuth ? ['--device-auth'] : [])]);
  if (!await loggedIn()) throw new Error('登录尚未完成，请再次运行 2-登录Codex.command。');
  const auth = path.join(env.CODEX_HOME, 'auth.json');
  if (await exists(auth)) await fs.chmod(auth, 0o600);
  console.log('项目登录完成。双击 3-启动Saplingagent.command。');
}
async function logout() {
  if (!await exists(cli)) throw new Error('请先运行 1-安装.command。');
  await required(cli, [...authArgs, 'logout'], { capture: true });
  console.log('已退出本项目 Codex 账号；应用文件和会话保留。可重新运行 2-登录Codex.command。');
}
async function start(noOpen) {
  if (!await installed()) throw new Error('安装尚未完成，或依赖锁文件已经变化。请先运行 1-安装.command。');
  await localSetup();
  if (!await loggedIn()) throw new Error('本项目尚未登录。请先运行 2-登录Codex.command。');
  const config = JSON.parse(await fs.readFile(path.join(root, 'config/runtime.json'), 'utf8'));
  const child = spawn(process.execPath, [path.join(root, 'scripts/dev.mjs')], { cwd: root, env, stdio: ['inherit', 'pipe', 'pipe'] });
  let ended = false, interrupted = false, stopRequested = false, launched = false, startupOutput = '';
  child.stdout.on('data', chunk => {
    process.stdout.write(chunk);
    startupOutput = (startupOutput + chunk).slice(-2048);
    if (startupOutput.includes(`Saplingagent: http://127.0.0.1:${config.frontPort}/`)) launched = true;
  });
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  const exit = new Promise(resolve => {
    child.once('error', () => { ended = true; resolve({ code: 1 }); });
    child.once('exit', (code, signal) => { ended = true; resolve({ code: code ?? 1, signal }); });
  });
  const stop = () => { interrupted = true; stopRequested = true; if (!ended) child.kill('SIGTERM'); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop); process.on('SIGHUP', stop);
  try {
    const deadline = Date.now() + 120000;
    let ready = false;
    while (!ended && !interrupted && Date.now() < deadline) {
      if (!launched) { await delay(100); continue; }
      try {
        const response = await fetch(`http://127.0.0.1:${config.agentPort}/api/status`, { signal: AbortSignal.timeout(1500) });
        const status = await response.json();
        if (status.ready && status.authenticated && status.mcp?.ready) {
          const front = await fetch(`http://127.0.0.1:${config.frontPort}/`, { signal: AbortSignal.timeout(1500) });
          if (front.ok) {
            ready = true;
            console.log(`已接入 Codex App Server：${status.model}；MCP ${status.mcp.tools.length} 个；Skills ${status.skills.length} 个。`);
            console.log(`网页：http://127.0.0.1:${config.frontPort}/\n保持本窗口开启；按 Control+C 停止本次服务。`);
            if (!noOpen) await run('/usr/bin/open', [`http://127.0.0.1:${config.frontPort}/`], { capture: true });
            break;
          }
        }
      } catch {}
      await delay(300);
    }
    if (!ready && !ended && !interrupted) {
      stopRequested = true; child.kill('SIGTERM');
      throw new Error('120秒内未完成模型/认证/MCP就绪。请运行 4-诊断.command；此轮服务已停止。');
    }
    const result = await exit;
    if (result.code !== 0 && !interrupted) throw new Error(`服务已停止（退出码 ${result.code}）。请查看端口、安装或认证错误。`);
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop); process.off('SIGHUP', stop);
    if (!ended) { stopRequested = true; child.kill('SIGTERM'); }
    if (stopRequested && !ended) await Promise.race([exit.catch(() => {}), delay(6000)]);
  }
}
async function doctor() {
  console.log(`macOS ${process.arch}；Node ${process.versions.node}；目录：${root}`);
  const local = await installed();
  console.log(`项目依赖：${local ? '完整' : '未安装或已变化，请运行 1-安装.command'}`);
  let authenticated = false;
  if (await exists(cli)) {
    const version = await run(cli, ['--version'], { capture: true });
    const versionLabel = version.output.trim().match(/^codex-cli (\d+\.\d+\.\d+(?:[-.a-z0-9]+)?)$/i)?.[1];
    if (version.code !== 0 || !versionLabel) throw new Error('Codex 可执行文件检查失败，请重新安装；未检查登录状态。');
    console.log(`Codex：${versionLabel}`);
    authenticated = await loggedIn();
    console.log(`项目登录：${authenticated ? '已保存（不代表当前网络/额度可用）' : '尚未登录，请运行 2-登录Codex.command'}`);
  }
  const config = JSON.parse(await fs.readFile(path.join(root, 'config/runtime.json'), 'utf8'));
  let online = false;
  try {
    const status = await fetch(`http://127.0.0.1:${config.agentPort}/api/status`, { signal: AbortSignal.timeout(2000) }).then(r => r.json());
    online = status.ready === true;
    console.log(`配置端口的运行状态：${online ? '已就绪' : '进程运行但Agent未就绪'}；模型：${status.model || '未选择'}；MCP：${status.mcp?.tools?.length || 0}；Skills：${status.skills?.length || 0}`);
  } catch { console.log('运行状态：未启动。安装并登录后，运行 3-启动Saplingagent.command。'); }
  console.log('诊断只报告状态，不输出凭据，也不会发起模型请求。');
  if (!local || !authenticated) process.exitCode = 1;
}

try {
  if (process.platform !== 'darwin') throw new Error('此入口目前只支持 macOS。');
  const [action, ...args] = process.argv.slice(2);
  if (action === 'install' && args.every(x => x === '--repair')) await install(args.includes('--repair'));
  else if (action === 'login' && args.every(x => x === '--device-auth')) await login(args.includes('--device-auth'));
  else if (action === 'start' && args.every(x => x === '--no-open')) await start(args.includes('--no-open'));
  else if (action === 'doctor' && !args.length) await doctor();
  else if (action === 'logout' && !args.length) await logout();
  else throw new Error('可用操作：install [--repair] / login [--device-auth] / start [--no-open] / doctor / logout。');
} catch (error) { console.error(error.message); process.exitCode = 1; }
