import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const start = '<!-- seedagent-runtime-tasks:start -->';
const end = '<!-- seedagent-runtime-tasks:end -->';
const digest = value => createHash('sha256').update(value).digest('hex');
const scope = '当前系统用户可访问的文件和命令，包括完整front/backend/MCP/Skills/配置/规则；具体动作按用户当前请求';
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
      const document = `# ${taskId}\n\n- 来源：用户在 Saplingagent 当前会话中的明确请求；授权详情以本地会话 ${task.sessionId} 的请求 ${task.requestId} 为准，不在公共任务记录复制聊天。\n- 执行：Saplingagent / Codex App Server，模型 ${task.model}。\n- 状态：${task.status}；${new Date().toISOString()}。\n- 允许：${scope}；具体动作必须符合当前用户请求。\n- 文件/命令权限：full-access，无Saplingagent目录保护；发布与外部消息仍按用户明确授权。\n- 无强制候选验证或hash冲突拦截，不自动回退；用户可主动恢复已有原件，命令副作用不保证可恢复；人工体验未验收。\n- 对话轮完成不代表所有业务需求、人工测试、Git同步或发布完成。\n- 权威协调索引：根 AI_TASKS.md 运行期区块；非Git，无分支/提交/main同步。\n`;
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
        entries.push(`| ${taskId} | ${task.status} | ${new Date().toISOString()} | [记录](backend/agent-runtime/ai-tasks/runtime/${taskId}.md) |`);
        const section = `${start}\n\n## Saplingagent 运行期权威任务登记\n\n由 agent-runtime 串行维护此区块；修改工具在执行前尝试登记用户请求引用和实际范围，登记为非阻断记录，结束时记录真实轮状态。普通聊天和只读调研只保存会话，不更新项目任务索引。最近50条列于此处，历史记录保留在 backend/agent-runtime/ai-tasks/runtime/。用户聊天正文不写入公共索引。此入口为当前非Git项目的运行期协调记录，不改变公共rules。\n\n| 任务 | 轮状态 | 最后更新 | 详情 |\n| --- | --- | --- | --- |\n${entries.slice(-50).join('\n')}\n\n${end}`;
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
