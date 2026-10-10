import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const root = process.env.SEED_ROOT || fileURLToPath(new URL('../', import.meta.url));
export async function setup() {
  for (const folder of ['local-secrets', 'local-secrets/runtime', 'local-secrets/codex', 'local-secrets/notes']) {
    const target = path.join(root, folder);
    await fs.mkdir(target, { recursive: true, mode: 0o700 });
    if ((await fs.lstat(target)).isSymbolicLink()) throw new Error('Secret directories must not be symbolic links');
    await fs.chmod(target, 0o700);
  }
  const tokenPath = path.join(root, 'local-secrets/runtime/service-token');
  try { await fs.writeFile(tokenPath, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (!(await fs.lstat(tokenPath)).isFile()) throw new Error('Invalid service token file');
  await fs.chmod(tokenPath, 0o600);
  const authPath = path.join(root, 'local-secrets/codex/auth.json');
  let imported = false;
  try { await fs.access(authPath); }
  catch {
    const source = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'auth.json');
    try { await fs.copyFile(source, authPath, fs.constants.COPYFILE_EXCL); imported = true; }
    catch (error) { if (!['ENOENT', 'EEXIST'].includes(error.code)) throw error; }
  }
  try {
    if (!(await fs.lstat(authPath)).isFile()) throw new Error('Invalid local Codex auth file');
    await fs.chmod(authPath, 0o600);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const ledgerPath = path.join(root, 'local-secrets/notes/project-secrets.json');
  let ledger = {};
  try {
    if (!(await fs.lstat(ledgerPath)).isFile()) throw new Error('Invalid secret ledger file');
    ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8'));
  }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('Secret ledger JSON is invalid; preserve and repair the local file');
    if (error.code !== 'ENOENT') throw error;
  }
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger) || (ledger.runtime !== undefined && (!ledger.runtime || typeof ledger.runtime !== 'object' || Array.isArray(ledger.runtime)))) throw new Error('Secret ledger structure is invalid');
  ledger.runtime = {
    ...ledger.runtime,
    serviceToken: 'local-secrets/runtime/service-token',
    codexAuth: 'local-secrets/codex/auth.json',
    provider: 'Codex App Server / local ChatGPT login',
    note: 'Only references; no secret values. Existing project auth is never overwritten.'
  };
  await fs.writeFile(ledgerPath, JSON.stringify(ledger, null, 2) + '\n', { mode: 0o600 });
  await fs.chmod(ledgerPath, 0o600);
  return { imported };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await setup();
  console.log(result.imported ? 'Local services prepared; existing Codex login imported into this project.' : 'Local services prepared; project login preserved.');
}
