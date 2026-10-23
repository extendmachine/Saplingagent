import {launcherMessages} from '../localization/launcher-messages.mjs';
import {formatMessage} from '../localization/public.mjs';
import {readLanguage} from '../localization/store.mjs';
import {ensureManagedDirectory} from '../contracts/local-storage.mjs';
import {withConfigurationWrite,atomicConfigurationJSON} from '../contracts/configuration-write.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const root = process.env.SEED_ROOT || fileURLToPath(new URL('../../', import.meta.url));
export async function setup({ importExistingAuth = process.env.SEED_IMPORT_EXISTING_AUTH !== '0', projectRoot = root } = {}) {
  const targetRoot = path.resolve(projectRoot);
  for (const folder of ['local-secrets', 'local-secrets/runtime', 'local-secrets/codex', 'local-secrets/notes', 'local-secrets/api-keys', 'local-secrets/server-keys', 'local-secrets/ssh']) {
    const target = path.join(targetRoot, folder);
    await ensureManagedDirectory(targetRoot,folder);
    if ((await fs.lstat(target)).isSymbolicLink()) throw new Error('Secret directories must not be symbolic links');
    await fs.chmod(target, 0o700);
  }
  const tokenPath = path.join(targetRoot, 'local-secrets/runtime/service-token');
  try { await fs.writeFile(tokenPath, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (!(await fs.lstat(tokenPath)).isFile()) throw new Error('Invalid service token file');
  await fs.chmod(tokenPath, 0o600);
  const authPath = path.join(targetRoot, 'local-secrets/codex/auth.json');
  let imported = false;
  try { await fs.access(authPath); }
  catch {
    if (importExistingAuth) {
      const source = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'auth.json');
      try { await fs.copyFile(source, authPath, fs.constants.COPYFILE_EXCL); imported = true; }
      catch (error) { if (!['ENOENT', 'EEXIST'].includes(error.code)) throw error; }
    }
  }
  try {
    if (!(await fs.lstat(authPath)).isFile()) throw new Error('Invalid local Codex auth file');
    await fs.chmod(authPath, 0o600);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await withConfigurationWrite(targetRoot,async()=>{
  const ledgerPath = path.join(targetRoot, 'local-secrets/notes/project-secrets.json');
  let ledger = { schema_version: 1, project: { name: path.basename(targetRoot), root: targetRoot, last_updated: new Date().toISOString().slice(0, 10), maintainer: 'user' }, credentials: [] };
  try {
    if (!(await fs.lstat(ledgerPath)).isFile()) throw new Error('Invalid secret ledger file');
    ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8'));
  }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('Secret ledger JSON is invalid; preserve and repair the local file');
    if (error.code !== 'ENOENT') throw error;
  }
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger) || (ledger.runtime !== undefined && (!ledger.runtime || typeof ledger.runtime !== 'object' || Array.isArray(ledger.runtime)))) throw new Error('Secret ledger structure is invalid');
  if (ledger.project && typeof ledger.project === 'object' && !Array.isArray(ledger.project)) {
    ledger.project.root = targetRoot;
    ledger.project.last_updated = new Date().toISOString().slice(0, 10);
  }
  ledger.runtime = {
    ...ledger.runtime,
    serviceToken: 'local-secrets/runtime/service-token',
    codexAuth: 'local-secrets/codex/auth.json',
    provider: 'Codex App Server / local ChatGPT login',
    note: 'Only references; no secret values. Existing project auth is never overwritten.'
  };
  await atomicConfigurationJSON(ledgerPath,ledger);
  await fs.chmod(ledgerPath, 0o600);
  });
  return { imported };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await setup();
  const language=await readLanguage(root,process.env.SAPLING_LANG);
  const text=(key)=>formatMessage(launcherMessages,language,key);
  console.log(text(result.imported ? 'Local services prepared; existing Codex login imported into this project.' : 'Local services prepared; project login preserved.'));
}
