import fs from 'node:fs/promises';
import path from 'node:path';
import { json, writeJSON, issue } from './io.mjs';

// Move project-owned process references only. External credential import sources stay external.
export function relocateEnvironment(previous, current, env = process.env) {
  const moved = value => {
    if (!value || !path.isAbsolute(value)) return value;
    const relative = path.relative(previous, value);
    return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)
      ? path.join(current, relative) : value;
  };
  for (const name of ['SEED_ROOT','SEED_CODEX_BIN','CODEX_HOME','TMPDIR','TMP','TEMP','npm_config_cache',
    'XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME','XDG_STATE_HOME','CLAUDE_CONFIG_DIR']) {
    if (env[name]) env[name] = moved(env[name]);
  }
  if (env.PATH) env.PATH = env.PATH.split(path.delimiter).map(moved).join(path.delimiter);
  return env;
}

export async function relocationLedger(root) {
  const file = path.join(root, 'local-secrets/notes/project-secrets.json');
  const value = await json(file);
  if (value && (!value.project || typeof value.project !== 'object' || Array.isArray(value.project)))
    throw issue('PROJECT_METADATA_INVALID', 'Preserve and repair the project credential ledger before changing its directory.');
  return value;
}

export async function completeRelocation(previous, current, ledger) {
  relocateEnvironment(previous, current);
  const cwd = process.cwd(), relative = path.relative(previous, cwd);
  if (relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
    process.chdir(path.join(current, relative));
  if (ledger?.project?.root && path.resolve(ledger.project.root) === previous) {
    // Preserve every credential payload/reference; this changes project location metadata only.
    ledger.project.root = current;
    ledger.project.last_updated = new Date().toISOString().slice(0, 10);
    await writeJSON(path.join(current, 'local-secrets/notes/project-secrets.json'), ledger);
  }
}
