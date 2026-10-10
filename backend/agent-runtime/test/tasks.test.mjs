import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTaskRegistry } from '../tasks.mjs';

test('parallel runtime registrations preserve other tasks, finish idempotently and omit chat text', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'seed-tasks-')));
  try {
    await fs.writeFile(path.join(root, 'AI_TASKS.md'), '# Manual tasks\n\nKeep this record.\n');
    const registry = createTaskRegistry(root);
    await Promise.all(['a', 'b', 'c'].map(requestId => registry({ requestId, sessionId: 'session', model: 'test-model', status: 'inProgress' })));
    await registry({ requestId: 'b', sessionId: 'session', model: 'test-model', status: 'completed' });
    const index = await fs.readFile(path.join(root, 'AI_TASKS.md'), 'utf8');
    assert.ok(index.startsWith('# Manual tasks\n\nKeep this record.'));
    assert.equal(index.split('| RUN-b |').length - 1, 1); assert.ok(index.includes('| RUN-b | completed |'));
    assert.equal((await fs.readdir(path.join(root, 'backend/agent-runtime/ai-tasks/runtime'))).length, 3);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('broken authority markers refuse overwrite', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'seed-tasks-')));
  try {
    const original = '# Keep\n<!-- seedagent-runtime-tasks:start -->\n'; await fs.writeFile(path.join(root, 'AI_TASKS.md'), original);
    await assert.rejects(createTaskRegistry(root)({ requestId: 'a', sessionId: 's', model: 'test', status: 'inProgress' }), /markers conflict/);
    assert.equal(await fs.readFile(path.join(root, 'AI_TASKS.md'), 'utf8'), original);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
