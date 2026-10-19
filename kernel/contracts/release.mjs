import fs from 'node:fs/promises';
import path from 'node:path';
import {validateKernelManifest, comparableKernelVersion} from './kernel.mjs';

// Deprecated wire names remain compatible; installed kernel metadata is authoritative.
export function parseReleaseMetadata(value) {
  if (value?.schemaVersion !== 1 || typeof value.version !== 'string'
    || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(value.version)) {
    throw new Error('Kernel version metadata is missing or invalid.');
  }
  return { schemaVersion: 1, version: value.version };
}

export async function readReleaseMetadata(root) {
  const installed = path.join(root, 'kernel/manifest.json');
  try {
    const stat = await fs.lstat(installed);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024) throw new Error('Invalid kernel metadata file.');
    const kernel = validateKernelManifest(JSON.parse(await fs.readFile(installed, 'utf8')));
    return parseReleaseMetadata({schemaVersion:1,version:comparableKernelVersion(kernel.version).join('.')});
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Older applications with no kernel manifest may still use the compatibility route.
  const file = path.join(root, 'config/release.json');
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error('Invalid release metadata file.');
  return parseReleaseMetadata(JSON.parse(await fs.readFile(file, 'utf8')));
}
