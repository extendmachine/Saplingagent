import fs from 'node:fs/promises';
import path from 'node:path';

// Managed configuration/runtime output follows the project. This does not
// restrict the customer's Agent tools or redirect read-only account imports.
export const MANAGED_DIRECTORIES = Object.freeze({
  TMPDIR: '.runtime/tmp', TMP: '.runtime/tmp', TEMP: '.runtime/tmp',
  npm_config_cache: '.cache/npm',
  NODE_COMPILE_CACHE: '.cache/node-compile',
  XDG_CONFIG_HOME: 'local-secrets/runtime/config',
  XDG_DATA_HOME: 'data/runtime', XDG_STATE_HOME: 'data/runtime-state',
  XDG_CACHE_HOME: '.cache/runtime',
});
const locationError = () => Object.assign(new Error('Managed configuration storage must stay in normal directories inside this project. Inspect symbolic links before retrying.'), {code:'PROJECT_STORAGE_LOCATION',status:409});

export function managedEnvironment(root, inherited = process.env) {
  const base = path.resolve(root);
  return {...inherited, ...Object.fromEntries(Object.entries(MANAGED_DIRECTORIES).map(([key, relative]) => [key, path.join(base, relative)]))};
}

export async function ensureManagedDirectory(root, relative) {
  if(typeof relative !== 'string' || !relative || path.isAbsolute(relative) || /[\\:\x00]/.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) throw locationError();
  const base = await fs.realpath(root);
  let current = base;
  for(const part of relative.split('/')) {
    current = path.join(current, part);
    try { await fs.mkdir(current, {mode:0o700}); } catch(error) { if(error.code !== 'EEXIST') throw error; }
    const stat = await fs.lstat(current);
    if(!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(current) !== current) throw locationError();
  }
  return current;
}

export async function prepareManagedEnvironment(root, inherited = process.env) {
  const base = await fs.realpath(root);
  for(const relative of new Set(Object.values(MANAGED_DIRECTORIES))) await ensureManagedDirectory(base, relative);
  return managedEnvironment(base, inherited);
}
