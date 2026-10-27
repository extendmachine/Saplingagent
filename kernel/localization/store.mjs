import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {ensureManagedDirectory} from '../contracts/local-storage.mjs';
import {withConfigurationWrite} from '../contracts/configuration-write.mjs';
import { normalizeLanguage, supportedLanguages } from './public.mjs';
export async function readLanguage(root, fallback = 'en') {
  try {
    const directory = path.join(await fs.realpath(root),'config'), file = path.join(directory,'ui-language.json');
    if ((await fs.lstat(directory)).isSymbolicLink() || !(await fs.lstat(file)).isFile()) throw Object.assign(new Error('Language settings must be a regular project file.'),{code:'PROJECT_STORAGE_LOCATION',status:409});
    const value = JSON.parse(await fs.readFile(path.join(root, 'config/ui-language.json'), 'utf8'));
    if (value?.schemaVersion === 1 && supportedLanguages.includes(value.language)) return value.language;
  } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  return normalizeLanguage(fallback);
}
export async function writeLanguage(root, language) {
  if (!supportedLanguages.includes(language)) throw Object.assign(new Error('Choose en or zh.'), {code:'INVALID_LANGUAGE', status:400});
  return withConfigurationWrite(root,async()=>{
  const directory = await ensureManagedDirectory(root,'config'), file = path.join(directory,'ui-language.json');
  const existing=await fs.lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(existing&&!existing.isFile())throw Object.assign(new Error('Language settings must be a regular project file.'),{code:'PROJECT_STORAGE_LOCATION',status:409});
  const stage = path.join(directory,`.ui-language-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(stage, JSON.stringify({schemaVersion:1,language},null,2)+'\n', {flag:'wx',mode:0o600});
    await fs.rename(stage,file);
  } finally { await fs.rm(stage,{force:true}); }
  return language;
  });
}
