import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeLanguage, supportedLanguages } from './public.mjs';
export async function readLanguage(root, fallback = 'en') {
  try {
    const value = JSON.parse(await fs.readFile(path.join(root, 'config/ui-language.json'), 'utf8'));
    if (value.schemaVersion === 1 && supportedLanguages.includes(value.language)) return value.language;
  } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  return normalizeLanguage(fallback);
}
export async function writeLanguage(root, language) {
  if (!supportedLanguages.includes(language)) throw Object.assign(new Error('Choose en or zh.'), {code:'INVALID_LANGUAGE', status:400});
  const directory = path.join(root,'config'), file = path.join(directory,'ui-language.json');
  await fs.mkdir(directory,{recursive:true});
  const stage = path.join(directory,`.ui-language-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(stage, JSON.stringify({schemaVersion:1,language},null,2)+'\n', {flag:'wx',mode:0o600});
    await fs.rename(stage,file);
  } finally { await fs.rm(stage,{force:true}); }
  return language;
}
