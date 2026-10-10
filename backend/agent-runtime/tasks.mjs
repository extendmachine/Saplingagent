import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const start = '<!-- seedagent-runtime-tasks:start -->';
const end = '<!-- seedagent-runtime-tasks:end -->';
const digest = value => createHash('sha256').update(value).digest('hex');
const scope = 'Files and commands accessible to the current OS user, including all front/backend/MCP/Skills/configuration/rules; specific actions follow the current user request';
export function createTaskRegistry(root) {
  let queue = Promise.resolve();
  const directory = path.join(root, 'backend/agent-runtime/ai-tasks/runtime');
  return task => {
    const pending = queue.catch(() => {}).then(async () => {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(task.requestId)) throw new Error('Invalid task request id');
      await fs.mkdir(directory, { recursive: true });
      if (await fs.realpath(directory) !== directory) throw new Error('Unsafe task directory');
      const taskId = `RUN-${task.requestId}`;
      const recordPath = path.join(directory, taskId + '.md');
      const document = `# ${taskId}\n\n- Source: the user's explicit request in this Saplingagent session. Authorization is recorded in local session ${task.sessionId}, request ${task.requestId}; conversation text is not copied into public task records.\n- Executor: Saplingagent / Codex App Server; model ${task.model}.\n- Status: ${task.status}; ${new Date().toISOString()}.\n- Allowed scope: ${scope}; each action must follow the current user request.\n- File/command permissions: full-access, without Saplingagent directory protection. Publication and external messages still require explicit user authorization.\n- No mandatory candidate validation, hash conflict gate or automatic rollback. Users may restore recorded originals; command side effects may not be reversible. Human experience validation is pending.\n- Completing a conversation turn does not establish completion of all requirements, human testing, Git synchronization or publication.\n- Runtime coordination index: the runtime section of root AI_TASKS.md; this runtime record does not create a branch, commit or main synchronization.\n`;
      try { if (!(await fs.lstat(recordPath)).isFile()) throw new Error('Unsafe task record'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const recordTmp = recordPath + '.' + randomUUID() + '.tmp';
      await fs.writeFile(recordTmp, document, { flag: 'wx', mode: 0o600 }); await fs.rename(recordTmp, recordPath);
      const indexPath = path.join(root, 'AI_TASKS.md');
      if (!(await fs.lstat(indexPath)).isFile()) throw new Error('Unsafe task index');
      for (let attempt = 0; attempt < 3; attempt++) {
        const original = await fs.readFile(indexPath, 'utf8');
        const begin = original.indexOf(start), finish = original.indexOf(end);
        if ((begin >= 0) !== (finish >= 0) || (begin >= 0 && finish < begin)) throw new Error('Runtime task index markers conflict');
        const entries = begin < 0 ? [] : original.slice(begin, finish).split('\n').filter(line => line.startsWith('| RUN-') && !line.startsWith(`| ${taskId} |`));
        entries.push(`| ${taskId} | ${task.status} | ${new Date().toISOString()} | [Record](backend/agent-runtime/ai-tasks/runtime/${taskId}.md) |`);
        const section = `${start}\n\n## Saplingagent runtime task records\n\nagent-runtime maintains this section serially. Modification tools attempt to register the user request reference and actual scope before execution; registration is nonblocking, and the final record reflects the actual turn status. Ordinary chat and read-only research save sessions without updating this task index. The latest 50 entries appear here; history remains in backend/agent-runtime/ai-tasks/runtime/. Conversation text is excluded. These runtime records do not change the public rules or replace the authoritative development coordination index.\n\n| Task | Turn status | Last update | Details |\n| --- | --- | --- | --- |\n${entries.slice(-50).join('\n')}\n\n${end}`;
        const next = begin < 0 ? original.trimEnd() + '\n\n' + section + '\n' : original.slice(0, begin) + section + original.slice(finish + end.length);
        if (digest(await fs.readFile(indexPath, 'utf8')) !== digest(original)) continue;
        const indexTmp = indexPath + '.' + randomUUID() + '.tmp';
        await fs.writeFile(indexTmp, next, { flag: 'wx' }); await fs.rename(indexTmp, indexPath); return taskId;
      }
      throw new Error('Task index changed concurrently; retry later');
    });
    queue = pending; return pending;
  };
}
