import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ensureManagedDirectory} from '../../kernel/contracts/local-storage.mjs';

// Only terminal writes without a confirmed Workspace acknowledgement land here.
// After restart an oversized response needs only its small, original terminal patch.
export async function terminalRecovery(root) {
  const directory = await ensureManagedDirectory(root, 'data/agent-runtime/pending-saves');
  const entries = new Map();
  const damaged = new Set();
  const file = id => path.join(directory, id + '.json');
  for (const entry of await fs.readdir(directory, {withFileTypes:true})) {
    if (!entry.name.endsWith('.json')) continue;
    const id = entry.name.slice(0, -5);
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) continue;
    if (!entry.isFile()) { damaged.add(id); continue; }
    try {
      const bytes = await fs.readFile(file(id), 'utf8');
      const value = JSON.parse(bytes);
      const last = value?.patch?.requests?.at(-1);
      if (!value.requestId || value.patch.running !== false || last?.id !== value.requestId ||
          !['completed', 'interrupted', 'failed'].includes(last.status)) throw Error('Invalid terminal record');
      entries.set(id, value);
    } catch (error) {
      if (error.code !== 'ENOENT') damaged.add(id);
    }
  }
  return {
    entries, damaged,
    async remember(id, entry) {
      entries.set(id, entry); // Keep the recoverable copy when disk IO fails.
      const temporary = file(id) + '.' + randomUUID() + '.tmp';
      try {
        await fs.writeFile(temporary, JSON.stringify(entry), {mode:0o600, flag:'wx', flush:true});
        await fs.rename(temporary, file(id));
      } finally { await fs.rm(temporary, {force:true}); }
    },
    async forget(id) {
      await fs.rm(file(id), {force:true});
      entries.delete(id);
    },
  };
}
