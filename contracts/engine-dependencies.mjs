// Resolve the pinned ESM engine exports from the independent core dependency tree.
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
export function engineModules(root) {
  return path.join(root, existsSync(path.join(root, 'kernel/package.json')) ? 'kernel' : 'backend/agent-runtime', 'node_modules');
}
export async function engineDependency(root, name) {
  if (!['@anthropic-ai/claude-agent-sdk','@opencode-ai/sdk'].includes(name)) throw new Error('Unknown engine dependency.');
  const directory=path.join(engineModules(root),name);
  const pkg=JSON.parse(await fs.readFile(path.join(directory,'package.json'),'utf8'));
  const exported=pkg.exports?.['.'];
  const entry=typeof exported==='string'?exported:exported?.import||exported?.default||pkg.main;
  if(typeof entry!=='string'||!entry||path.isAbsolute(entry)||entry.split('/').includes('..'))throw new Error('Engine package has no supported ESM entry.');
  return import(pathToFileURL(path.join(directory,entry)).href);
}
