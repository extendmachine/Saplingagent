// Public bridge from a resident runtime to short-lived configuration bootstrap A.
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { findConfiguration } from './bootstrap.mjs';
import { openExternal } from '../launcher/manager.mjs';

const failure = code => Object.assign(new Error('Configuration could not open. Check logs/project-launcher and retry, or run bash Saplingagent.sh configure.'), { code });
export async function launchConfiguration(root, { launch = spawn, find = findConfiguration, open = openExternal, env = process.env } = {}) {
  // Bootstrap A and B publish real paths; compare the same identity even when
  // the caller supplies a directory URL's trailing separator or a path alias.
  try { root = await fs.realpath(root); }
  catch { throw failure('CONFIGURATION_START_FAILED'); }
  const childEnv = { ...env, SEED_ROOT: root, SAPLING_NO_OPEN: '1' };
  for (const key of ['SAPLING_CONFIG_PARENT_PID', 'SAPLING_CONFIGURATION_DIR', 'SAPLING_SETUP_JOB', 'SAPLING_MAINTENANCE_JOB', 'SAPLING_MANAGEMENT_PORT', 'NODE_OPTIONS', 'NODE_PATH']) delete childEnv[key];
  const receipt = await new Promise((resolve, reject) => {
    let result;
    const child = launch(process.execPath, [path.join(root, 'kernel/launcher/entry.mjs'), '--configuration-request', '--ai-only', '--no-open'], {
      cwd: root, env: childEnv, shell: false, windowsHide: true, detached: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    child.on('message', message => { if (message?.type === 'sapling-configuration') result = message; });
    child.once('error', () => reject(failure('CONFIGURATION_START_FAILED')));
    // An early IPC message is not completion: B waits for bootstrap A to exit.
    child.once('exit', code => {
      if (code !== 0 || !result?.ok) return reject(failure(/^[A-Z][A-Z0-9_]{0,63}$/.test(result?.code || '') ? result.code : 'CONFIGURATION_START_FAILED'));
      if (result.configurationMode !== 'ai' || !Number.isInteger(result.port) || result.port < 1 || result.port > 65535 || typeof result.instanceId !== 'string') return reject(failure('CONFIGURATION_START_FAILED'));
      resolve(result);
    });
  });
  const address = await find(root);
  if (!address || address.root !== root || address.configurationHost !== 'external' || address.configurationMode !== 'ai' || address.port !== receipt.port || address.instanceId !== receipt.instanceId) throw failure('CONFIGURATION_START_FAILED');
  const url = `http://127.0.0.1:${address.port}/`;
  let browserRequested = false;
  try { await open(url); browserRequested = true; } catch { /* Keep the verified address for manual opening. */ }
  return { url, browserRequested };
}
