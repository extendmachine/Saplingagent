import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

async function readMetadata(file) {
  try {
    if ((await fs.stat(file)).size > 2 * 1024 * 1024) return null;
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch { return null; }
}

export async function projectStatus(manager) {
  const [identity, manifest] = await Promise.all([
    readMetadata(path.join(manager.root, 'config/project.json')),
    readMetadata(path.join(manager.root, 'kernel/manifest.json'))
  ]);
  // These reads intentionally do not use the launcher identity writer/initializer.
  const state = manager.state();
  const name = typeof identity?.name === 'string' && identity.name.trim() ? identity.name.trim().slice(0, 160) : path.basename(manager.root);
  const version = typeof manifest?.version === 'string' && /^\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?$/.test(manifest.version) ? manifest.version : null;
  return { ...state, canStop: !manager.operation && !manager.closing && (!manager.maintenance || manager.closed), projectName: name, kernelVersion: version, url: state.ports?.frontPort ? `http://127.0.0.1:${state.ports.frontPort}/` : null };
}

export async function openProjectLogs(root, { platform = process.platform, launch = spawn } = {}) {
  const fail = () => Object.assign(new Error('The project logs folder could not be opened. Inspect logs in this project folder.'), { code: 'LOGS_UNAVAILABLE' });
  const directory = path.join(root, 'logs');
  try {
    const info = await fs.lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || await fs.realpath(directory) !== path.join(await fs.realpath(root), 'logs')) throw fail();
  } catch { throw fail(); }
  const command = platform === 'darwin' ? '/usr/bin/open' : platform === 'win32' ? 'explorer.exe' : null;
  if (!command) throw fail();
  await new Promise((resolve, reject) => {
    const child = launch(command, [directory], { cwd: path.dirname(root), shell: false, stdio: 'ignore', windowsHide: true });
    child.once('error', () => reject(fail()));
    child.once('spawn', () => { child.unref(); resolve(); });
  });
  return { requested: true };
}
