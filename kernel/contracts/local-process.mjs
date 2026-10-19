// Shared OS process contract; callers supply only their own ChildProcess.
import path from 'node:path';
import { engineModules } from './engine-dependencies.mjs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export function openCodeBinary(root, platform = process.platform) {
  return path.join(engineModules(root), platform === 'win32' ? 'opencode-ai/bin/opencode.exe' : '.bin/opencode');
}
export function codexBinary(root, platform = process.platform, arch = process.arch, runtime = '.runtime/codex') {
  if (platform !== 'win32') return path.join(root, runtime, 'node_modules/.bin/codex');
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Unsupported Codex Windows architecture');
  const triple = arch === 'x64' ? 'x86_64-pc-windows-msvc' : 'aarch64-pc-windows-msvc';
  return path.join(root, runtime, `node_modules/@openai/codex-win32-${arch}/vendor/${triple}/bin/codex.exe`);
}
export function npmCommand(node = process.execPath, platform = process.platform) {
  return platform === 'win32' ? { command: node, args: [path.join(path.dirname(node), 'node_modules/npm/bin/npm-cli.js')] } : { command: 'npm', args: [] };
}
export function commandShell(command, platform = process.platform, env = process.env) {
  return platform === 'win32' ? { command: env.ComSpec || env.COMSPEC || 'cmd.exe', args: ['/d', '/s', '/c', `"${command}"`], windowsVerbatimArguments: true }
    : { command: env.SHELL || '/bin/sh', args: ['-lc', command] };
}
export function processGroupAlive(child, platform = process.platform) {
  if (!child?.pid) return false;
  if (platform === 'win32') return child.exitCode === null && child.signalCode === null;
  try { process.kill(-child.pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
export function windowsTreeCommand(pid, env = process.env) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid owned process PID');
  return { command: path.win32.join(env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows', 'System32', 'taskkill.exe'), args: ['/PID', String(pid), '/T', '/F'] };
}
const stopping = new WeakMap();
export function terminateOwned(child, options = {}) {
  if (!child) return Promise.resolve();
  if (stopping.has(child)) return stopping.get(child);
  const operation = terminate(child, options).finally(() => stopping.delete(child));
  stopping.set(child, operation);
  return operation;
}
async function terminate(child, { platform = process.platform, graceMs = 750, killMs = 1500, spawnProcess = spawn } = {}) {
  if (!child?.pid) return;
  // Windows signals kill the leader abruptly. Kill its owned tree before the leader,
  // and never target a PID once this ChildProcess has reported exit (PID reuse).
  if (platform === 'win32') {
    if (!processGroupAlive(child, platform)) return;
    const { command, args } = windowsTreeCommand(child.pid);
    await new Promise((resolve, reject) => {
      const killer = spawnProcess(command, args, { windowsHide: true, stdio: 'ignore' });
      const timer = setTimeout(() => { killer.kill(); reject(new Error('Owned process tree termination timed out')); }, killMs + graceMs);
      killer.once('error', () => { clearTimeout(timer); reject(new Error('Cannot stop owned Windows process tree')); });
      killer.once('exit', code => { clearTimeout(timer); if (code && processGroupAlive(child, platform)) reject(new Error('Owned Windows process tree did not stop')); else resolve(); });
    });
    const end = Date.now() + killMs;
    while (processGroupAlive(child, platform) && Date.now() < end) await delay(25);
  } else {
    const signal = name => { try { process.kill(-child.pid, name); } catch (e) { if (e.code !== 'ESRCH') throw e; } };
    signal('SIGTERM');
    const deadline = Date.now() + graceMs;
    while (processGroupAlive(child, platform) && Date.now() < deadline) await delay(25);
    if (processGroupAlive(child, platform)) signal('SIGKILL');
    const end = Date.now() + killMs;
    while (processGroupAlive(child, platform) && Date.now() < end) await delay(25);
  }
  if (processGroupAlive(child, platform)) throw new Error('Owned process tree did not stop');
}

export function claudeBinary(root, platform = process.platform, arch = process.arch) {
  if (!['darwin','win32','linux'].includes(platform) || !['x64','arm64'].includes(arch)) throw new Error('Unsupported Claude Agent platform');
  return path.join(engineModules(root), '@anthropic-ai', `claude-agent-sdk-${platform}-${arch}`, platform === 'win32' ? 'claude.exe' : 'claude');
}
