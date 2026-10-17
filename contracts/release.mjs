import fs from 'node:fs/promises';
import path from 'node:path';

// Distribution identity survives a customer Git reset. Kernel updates do not own it.
export function parseReleaseMetadata(value) {
  if (value?.schemaVersion !== 1 || typeof value.version !== 'string'
    || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(value.version)) {
    throw new Error('Release metadata is missing or invalid.');
  }
  return { schemaVersion: 1, version: value.version };
}

export async function readReleaseMetadata(root) {
  const file = path.join(root, 'config/release.json');
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error('Invalid release metadata file.');
  return parseReleaseMetadata(JSON.parse(await fs.readFile(file, 'utf8')));
}
