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
    child.once('error', () => { detach(); reject(new Error('Command could not start. Run 1-Install.command again.')); });
    child.once('exit', (code, signal) => { detach(); resolve({ code: code ?? 1, signal, output, errorOutput }); });
  });
}
async function required(command, args, options) {
  const result = await run(command, args, options);
  if (result.code !== 0) throw new Error(`Operation failed (exit code ${result.code}). Fix the error above and try again.`);
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
  throw new Error('Unable to read project login status. Check the Codex installation, architecture and local-secrets/codex/config.toml; this error does not mean the project is not logged in.');
}
async function install(repair = false) {
  const lock = path.join(root, '.runtime/macos-install.lock');
  try { await fs.mkdir(lock); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another installation is in progress. Wait; if its window has closed, remove .runtime/macos-install.lock as documented and retry.');
    throw error;
  }
  const stage = path.join(root, '.runtime', `codex-install-${randomUUID()}`);
  try {
    for (const file of ['1-Install.command', '2-Login-Codex.command', '3-Start-Saplingagent.command', '4-Doctor.command', 'scripts/macos/bootstrap.sh', 'scripts/macos/entry.sh', 'scripts/macos/codex.sh']) await fs.chmod(path.join(root, file), 0o755);
    if (!repair && await installed()) {
      await localSetup();
      console.log('The project environment is installed and up to date. Log in or start; repair damaged dependencies with bash "1-Install.command" --repair.');
      return;
    }
    const packageFile = path.join(stage, 'package.json');
    await fs.mkdir(path.dirname(packageFile), { recursive: true });
    await fs.writeFile(packageFile, JSON.stringify({ name: 'saplingagent-local-codex', private: true, dependencies: { '@openai/codex': settings.codexVersion } }, null, 2) + '\n');
    console.log(`Installing project-local Codex ${settings.codexVersion}…`);
    await required('npm', ['install', '--include=optional', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: path.dirname(packageFile) });
    const stagedCli = path.join(stage, 'node_modules/.bin/codex');
    const version = await required(stagedCli, ['--version'], { capture: true });
    if (version.output.trim() !== `codex-cli ${settings.codexVersion}`) throw new Error('Codex version does not match configuration. Reinstall.');
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
      console.log(`Installing locked dependencies for ${service}…`);
      await required('npm', ['ci', '--include=optional', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: path.join(root, service) });
    }
    await localSetup();
    await fs.writeFile(stampFile, JSON.stringify({ schemaVersion: 1, nodeVersion: process.versions.node, codexVersion: settings.codexVersion, arch: process.arch, signature: await signature(), installedAt: new Date().toISOString() }, null, 2) + '\n');
    console.log('Installation complete. Double-click 2-Login-Codex.command to log in with your own account, then 3-Start-Saplingagent.command.');
  } finally { await fs.rm(stage, { recursive: true, force: true }); await fs.rm(lock, { recursive: true, force: true }); }
}
async function login(deviceAuth) {
  if (!await installed()) throw new Error('Double-click 1-Install.command first.');
  await localSetup();
  if (await loggedIn()) { console.log('Project login credentials are saved. Run 3-Start-Saplingagent.command; if requests fail authentication, log out of this project as documented and log in again.'); return; }
  console.log('Official Codex will open your browser. Log in with your own ChatGPT/Codex account.');
  await required(cli, [...authArgs, 'login', ...(deviceAuth ? ['--device-auth'] : [])]);
  if (!await loggedIn()) throw new Error('Login is incomplete. Run 2-Login-Codex.command again.');
  const auth = path.join(env.CODEX_HOME, 'auth.json');
  if (await exists(auth)) await fs.chmod(auth, 0o600);
  console.log('Project login complete. Double-click 3-Start-Saplingagent.command.');
}
async function logout() {
  if (!await exists(cli)) throw new Error('Run 1-Install.command first.');
  await required(cli, [...authArgs, 'logout'], { capture: true });
  console.log('Logged out of the Codex account for this project; application files and sessions are retained. Run 2-Login-Codex.command to log in again.');
}
async function start(noOpen) {
  if (!await installed()) throw new Error('Installation is incomplete or dependency lockfiles have changed. Run 1-Install.command first.');
  await localSetup();
  if (!await loggedIn()) throw new Error('This project is not logged in. Run 2-Login-Codex.command first.');
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
        const lifecycleResponse = await fetch(`http://127.0.0.1:${config.frontPort}/api/runtime/status`, { signal: AbortSignal.timeout(1500) });
        if (!lifecycleResponse.ok) { await delay(300); continue; }
        const lifecycle = await lifecycleResponse.json();
        if (lifecycle.phase === 'failed' && !lifecycle.busy) break;
        if (lifecycle.phase !== 'ready' || lifecycle.busy) { await delay(300); continue; }
        const response = await fetch(`http://127.0.0.1:${config.agentPort}/api/status`, { signal: AbortSignal.timeout(1500) });
        const status = await response.json();
        if (status.ready && status.authenticated && status.mcp?.ready) {
          const front = await fetch(`http://127.0.0.1:${config.frontPort}/`, { signal: AbortSignal.timeout(1500) });
          if (front.ok) {
            ready = true;
            console.log(`Connected to Codex App Server: ${status.model}; ${status.mcp.tools.length} MCP tools; ${status.skills.length} Skills.`);
            console.log(`Web page: http://127.0.0.1:${config.frontPort}/\nKeep this window open; press Control+C to stop these services.`);
            if (!noOpen) await run('/usr/bin/open', [`http://127.0.0.1:${config.frontPort}/`], { capture: true });
            break;
          }
        }
      } catch {}
      await delay(300);
    }
    if (!ready && !ended && !interrupted) {
      console.error(`Model/authentication/MCP is not ready. Keep this window open, inspect local diagnostics and retry at http://127.0.0.1:${config.frontPort}/__saplingagent/runtime. Run 4-Doctor.command to check installation/login.`);
    }
    const result = await exit;
    if (result.code !== 0 && !interrupted) throw new Error(`Services stopped (exit code ${result.code}). Check for port, installation or authentication errors.`);
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop); process.off('SIGHUP', stop);
    if (!ended) { stopRequested = true; child.kill('SIGTERM'); }
    if (stopRequested && !ended) await Promise.race([exit.catch(() => {}), delay(6000)]);
  }
}
async function doctor() {
  console.log(`macOS ${process.arch}; Node ${process.versions.node}; folder: ${root}`);
  const local = await installed();
  console.log(`Project dependencies:${local ? 'installed' : 'not installed or changed; run 1-Install.command'}`);
  let authenticated = false;
  if (await exists(cli)) {
    const version = await run(cli, ['--version'], { capture: true });
    const versionLabel = version.output.trim().match(/^codex-cli (\d+\.\d+\.\d+(?:[-.a-z0-9]+)?)$/i)?.[1];
    if (version.code !== 0 || !versionLabel) throw new Error('Codex executable check failed. Reinstall; login status was not checked.');
    console.log(`Codex：${versionLabel}`);
    authenticated = await loggedIn();
    console.log(`Project login:${authenticated ? 'saved (does not verify current network or quota)' : 'not logged in; run 2-Login-Codex.command'}`);
  }
  const config = JSON.parse(await fs.readFile(path.join(root, 'config/runtime.json'), 'utf8'));
  let online = false;
  try {
    const status = await fetch(`http://127.0.0.1:${config.agentPort}/api/status`, { signal: AbortSignal.timeout(2000) }).then(r => r.json());
    online = status.ready === true;
    console.log(`Runtime status on configured ports:${online ? 'ready' : 'process running but Agent not ready'}; model:${status.model || 'not selected'}; MCP:${status.mcp?.tools?.length || 0}; Skills:${status.skills?.length || 0}`);
  } catch { console.log('Runtime status: not started. Install, log in, then run 3-Start-Saplingagent.command.'); }
  console.log('Diagnostics report status only, without printing credentials or making model requests.');
  if (!local || !authenticated) process.exitCode = 1;
}

try {
  if (process.platform !== 'darwin') throw new Error('This entry point currently supports macOS only.');
  const [action, ...args] = process.argv.slice(2);
  if (action === 'install' && args.every(x => x === '--repair')) await install(args.includes('--repair'));
  else if (action === 'login' && args.every(x => x === '--device-auth')) await login(args.includes('--device-auth'));
  else if (action === 'start' && args.every(x => x === '--no-open')) await start(args.includes('--no-open'));
  else if (action === 'doctor' && !args.length) await doctor();
  else if (action === 'logout' && !args.length) await logout();
  else throw new Error('Available actions: install [--repair] / login [--device-auth] / start [--no-open] / doctor / logout.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
