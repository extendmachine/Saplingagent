import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rename, symlink, unlink, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { toolFingerprint } from '../../../contracts/agent-tools.mjs';

const serviceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = join(serviceDirectory, 'server.mjs');

function result(value) { return value.structuredContent ?? JSON.parse(value.content.find(item => item.type === 'text').text); }
async function listen(server) { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return server.address().port; }
async function close(server) { await new Promise(resolve => server.close(resolve)); }

test('official MCP stdio transport, 16 full-access tools, HTTP mapping and nonblocking registration', { timeout: 90_000 }, async t => {
  const fixtureParent = join(serviceDirectory, '.test-data');
  await mkdir(fixtureParent, { recursive: true });
  const fixture = await mkdtemp(join(fixtureParent, 'protocol-'));
  const token = randomBytes(32).toString('base64url');
  const tokenFile = join(fixture, 'local-secrets/runtime/service-token');
  await mkdir(dirname(tokenFile), { recursive: true });
  await writeFile(tokenFile, token, { mode: 0o600 });
  for (const file of ['AGENTS.md', 'FINAL_GOAL.md', 'TODO.md', 'AI_TASKS.md', 'rules/README.md', 'contracts/runtime-api.md']) {
    await mkdir(dirname(join(fixture, file)), { recursive: true });
    await writeFile(join(fixture, file), `Public fixture for ${file}\n`);
  }
  const skillDirectory = join(fixture, '.agents/skills/check-one');
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(join(skillDirectory, 'SKILL.md'), '---\nname: check-one\ndescription: Check one known process.\n---\nUse only the requested process.\n');
  await mkdir(join(fixture, '.agents/skills/bad-one'), { recursive: true });
  await writeFile(join(fixture, '.agents/skills/bad-one/SKILL.md'), 'Missing frontmatter.');
  await mkdir(join(fixture, '.agents/skills/empty-one'), { recursive: true });
  await mkdir(join(fixture, '.agents/skills/missing-one'), { recursive: true });
  await writeFile(join(fixture, '.agents/skills/missing-one/reference.md'), 'This nonempty directory has no Skill manifest.');
  const linkedDirectory = join(fixture, 'outside-skills');
  await mkdir(linkedDirectory);
  await writeFile(join(linkedDirectory, 'SKILL.md'), '---\nname: link-one\ndescription: A linked workflow.\n---\nUse linked instructions.\n');
  await symlink(linkedDirectory, join(fixture, '.agents/skills/link-one'));

  const requests = [];
  const preferences = [];
  let changeStatus = 'ready';
  let registrationDenied = false;
  let malformedRegistration = false;
  let snapshotUnavailable = false;
  const commandStarted = Promise.withResolvers();
  const commandCancelled = Promise.withResolvers();
  const httpServer = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    let body = '';
    for await (const chunk of request) body += chunk;
    const parsed = body ? JSON.parse(body) : undefined;
    requests.push({ method: request.method, url: request.url, body: parsed });
    response.setHeader('Content-Type', 'application/json');
    const url = new URL(request.url, 'http://127.0.0.1');
    let output;
    if (request.method === 'POST' && url.pathname === '/page/read') output = { snapshot: { pageId: 'current', capturedAt: new Date().toISOString(), text: 'Fresh rendered page', elements: [], image: { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ' } } };
    else if (request.method === 'POST' && url.pathname === '/internal/register-task') {
      assert.deepEqual(Object.keys(parsed).sort(), ['fingerprint', 'tool']);
      assert.match(parsed.fingerprint, /^[a-f0-9]{64}$/);
      if (registrationDenied) { response.statusCode = 409; output = { error: { code: 'TASK_REQUIRED', message: 'No matching active tool request.' } }; }
      else output = { taskId: malformedRegistration ? null : 'RUN-managed-fixture' };
    } else if (request.method === 'GET' && url.pathname === '/files') output = { files: [{ path: 'front/App.tsx', size: 8, writable: true }], truncated: true, nextCursor: '2' };
    else if (request.method === 'GET' && url.pathname === '/file') {
      if (url.searchParams.get('path') === 'front/error.tsx') {
        response.statusCode = 409; output = { error: { code: 'CONFLICT', message: 'Source changed.' } };
      } else output = { path: url.searchParams.get('path'), content: url.searchParams.get('encoding') === 'base64' ? 'AAEC' : 'export {}', encoding: url.searchParams.get('encoding') ?? 'utf8', hash: 'a'.repeat(64), size: 100, truncated: true, nextOffset: 16 };
    } else if (request.method === 'POST' && ['/files/write', '/files/delete'].includes(url.pathname)) {
      output = snapshotUnavailable
        ? { status: 'applied', path: parsed.path, warnings: [{ code: 'SNAPSHOT_UNAVAILABLE', message: 'Snapshot was not recorded; the file operation completed.' }] }
        : { changeId: 'direct-1', status: 'applied', path: parsed.path };
    } else if (request.method === 'POST' && url.pathname === '/commands') {
      if (parsed.command === 'fixture-cancel') {
        response.once('close', () => commandCancelled.resolve());
        commandStarted.resolve();
        return;
      }
      output = { exitCode: parsed.command === 'fixture-failure' ? 7 : 0, stdout: 'fixture-output', stderr: '', timedOut: false, stdoutTruncated: false, stderrTruncated: false };
    } else if (request.method === 'POST' && url.pathname === '/changes') {
      changeStatus = 'ready';
      output = { changeId: 'candidate-1', status: changeStatus, checks: [] };
    } else if (request.method === 'POST' && url.pathname === '/changes/candidate-1/apply') {
      changeStatus = 'applied'; output = { changeId: 'candidate-1', status: changeStatus };
    } else if (request.method === 'POST' && url.pathname === '/changes/candidate-1/rollback') {
      changeStatus = 'rolledBack'; output = { changeId: 'candidate-1', status: changeStatus };
    } else if (request.method === 'GET' && url.pathname === '/changes') output = { changes: [{ changeId: 'candidate-1', status: changeStatus }] };
    else if (request.method === 'GET' && url.pathname === '/preferences') output = { preferences };
    else if (request.method === 'POST' && url.pathname === '/preferences') {
      const preference = { id: 'pref-1', ...parsed }; preferences.push(preference); output = { preference };
    } else if (request.method === 'DELETE' && url.pathname === '/preferences/pref-1') { preferences.length = 0; output = { ok: true }; }
    else { response.statusCode = 404; output = { error: { code: 'NOT_FOUND', message: 'Endpoint unavailable.' } }; }
    response.end(JSON.stringify(output));
  });
  const servicePort = await listen(httpServer);
  const transport = new StdioClientTransport({
    command: process.execPath, args: [serverPath], cwd: fixture, stderr: 'pipe',
    env: { PATH: process.env.PATH, SEEDAGENT_PROJECT_ROOT: fixture, SEEDAGENT_WORKSPACE_PORT: String(servicePort), SEEDAGENT_BUILDER_PORT: String(servicePort) },
  });
  const client = new Client({ name: 'seedagent-protocol-check', version: '1.0.0' });
  let stderr = '';
  transport.stderr?.on('data', data => { stderr += data; });
  await client.connect(transport);
  t.after(async () => { await client.close(); await close(httpServer); await rm(fixture, { recursive: true, force: true }); });

  const listed = await client.listTools();
  assert.equal(listed.tools.length, 16);
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(), ['page_read', 'workspace_list_files', 'workspace_read_file', 'workspace_write_file', 'workspace_delete_file', 'workspace_run_command', 'page_propose', 'page_apply', 'page_rollback', 'page_changes', 'preferences_get', 'preferences_set', 'preferences_forget', 'skills_list', 'skills_read', 'project_context'].sort());
  assert.ok(listed.tools.some(tool => tool.name === 'page_propose' && tool.inputSchema.required.includes('files')));
  assert.ok(listed.tools.find(tool => tool.name === 'preferences_set').inputSchema.required.includes('evidence'));
  assert.equal(listed.tools.find(tool => tool.name === 'page_apply').annotations.readOnlyHint, false);
  assert.equal(listed.tools.find(tool => tool.name === 'workspace_run_command').annotations.destructiveHint, true);
  assert.equal(listed.tools.find(tool => tool.name === 'workspace_write_file').inputSchema.properties.content.maxLength, 16 * 1024 * 1024);

  const inspected = await client.callTool({ name: 'page_read', arguments: { includeImage: true } });
  assert.equal(result(inspected).snapshot.text, 'Fresh rendered page');
  assert.equal(result(inspected).snapshot.image, undefined);
  assert.equal(inspected.content.find(part => part.type === 'image').mimeType, 'image/png');
  assert.equal(listed.tools.find(tool => tool.name === 'page_read').annotations.readOnlyHint, true);
  const context = result(await client.callTool({ name: 'project_context', arguments: {} }));
  assert.equal(context.files.length, 6);
  assert.equal(context.errors.length, 0);
  assert.deepEqual(context.protected, []);
  assert.equal(context.permissionMode, 'full-access');
  assert.ok(context.editableAreas.includes('backend/'));
  assert.ok(!JSON.stringify(context).includes(token));
  const skills = result(await client.callTool({ name: 'skills_list', arguments: {} }));
  assert.deepEqual(skills.skills.map(skill => skill.name), ['check-one', 'link-one']);
  assert.deepEqual(skills.errors.map(skill => skill.name), ['bad-one', 'missing-one']);
  assert.ok(!JSON.stringify(skills).includes('empty-one'));
  const skill = result(await client.callTool({ name: 'skills_read', arguments: { name: 'check-one' } }));
  assert.match(skill.content, /Use only/);
  assert.match(skill.hash, /^[a-f0-9]{64}$/);
  assert.match(result(await client.callTool({ name: 'skills_read', arguments: { name: 'link-one' } })).content, /linked instructions/);

  const file = result(await client.callTool({ name: 'workspace_read_file', arguments: { path: 'front/App.tsx' } }));
  assert.equal(file.content, 'export {}');
  const files = result(await client.callTool({ name: 'workspace_list_files', arguments: {} }));
  assert.equal(files.files[0].path, 'front/App.tsx');
  assert.equal(requests.at(-1).url, '/files?path=.');
  await client.callTool({ name: 'workspace_list_files', arguments: { path: '../outside', limit: 17, cursor: '2' } });
  assert.equal(requests.at(-1).url, '/files?path=..%2Foutside&limit=17&cursor=2');
  for (const path of ['../local-secrets/fake-file', '/fixture/absolute-file', 'backend/server.mjs', 'front/chat/Chat.tsx', 'node_modules/example.js']) {
    const read = await client.callTool({ name: 'workspace_read_file', arguments: { path } });
    assert.notEqual(read.isError, true);
    assert.equal(result(read).path, path);
  }
  const binary = result(await client.callTool({ name: 'workspace_read_file', arguments: { path: '../fixture.bin', encoding: 'base64', offset: 8, maxBytes: 8 } }));
  assert.equal(binary.content, 'AAEC');
  assert.equal(binary.nextOffset, 16);
  assert.equal(requests.at(-1).url, '/file?path=..%2Ffixture.bin&encoding=base64&offset=8&maxBytes=8');
  const beforeInvalid = requests.length;
  for (const [name, args] of [
    ['workspace_read_file', { path: 'bad\0path' }], ['workspace_read_file', { path: '' }],
    ['workspace_read_file', { path: '.', maxBytes: 4 * 1024 * 1024 + 1 }],
    ['workspace_list_files', { limit: 0 }], ['workspace_list_files', { cursor: '-1' }],
    ['workspace_write_file', { path: '../file', content: '', encoding: 'hex' }],
    ['workspace_run_command', { command: 'test', timeoutMs: 3_600_001 }],
    ['workspace_run_command', { command: 'test', timeoutMs: 0 }],
  ]) assert.equal((await client.callTool({ name, arguments: args })).isError, true);
  const missingEvidence = await client.callTool({ name: 'preferences_set', arguments: { key: 'theme', value: 'dark' } });
  assert.equal(missingEvidence.isError, true);
  const reasonTooLong = await client.callTool({ name: 'page_propose', arguments: { reason: 'a'.repeat(4001), files: [{ path: 'front/features/example.tsx', content: 'export {}' }] } });
  assert.equal(reasonTooLong.isError, true);
  assert.equal(requests.length, beforeInvalid);

  const writeArgs = { path: '/fixture/backend/new.bin', content: 'AAEC', encoding: 'base64', reason: ' fixture write ' };
  assert.equal(result(await client.callTool({ name: 'workspace_write_file', arguments: writeArgs })).status, 'applied');
  assert.deepEqual(requests.at(-1), { method: 'POST', url: '/files/write', body: { ...writeArgs, reason: 'fixture write' } });
  assert.equal(result(await client.callTool({ name: 'workspace_delete_file', arguments: { path: '../fixture-delete' } })).status, 'applied');
  assert.deepEqual(requests.at(-1), { method: 'POST', url: '/files/delete', body: { path: '../fixture-delete' } });
  const commandArgs = { command: 'fixture-failure', cwd: '/fixture/cwd', timeoutMs: 3_600_000 };
  const command = result(await client.callTool({ name: 'workspace_run_command', arguments: commandArgs }));
  assert.equal(command.exitCode, 7);
  assert.equal(command.timedOut, false);
  assert.deepEqual(requests.at(-1), { method: 'POST', url: '/commands', body: commandArgs });
  snapshotUnavailable = true;
  for (const name of ['workspace_write_file', 'workspace_delete_file']) {
    const output = result(await client.callTool({ name, arguments: { path: '../fixture-unsnapshotted', ...(name === 'workspace_write_file' ? { content: 'fixture-content' } : {}) } }));
    assert.equal(output.status, 'applied');
    assert.equal(output.changeId, undefined);
    assert.equal(output.warnings[0].code, 'SNAPSHOT_UNAVAILABLE');
  }
  snapshotUnavailable = false;
  const cancellation = new AbortController();
  const pendingCommand = client.callTool({ name: 'workspace_run_command', arguments: { command: 'fixture-cancel' } }, undefined, { signal: cancellation.signal, timeout: 5000 });
  const commandRejected = assert.rejects(pendingCommand);
  await commandStarted.promise;
  cancellation.abort();
  await commandRejected;
  await Promise.race([commandCancelled.promise, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('MCP cancellation did not close the downstream HTTP response.')), 2000);
    timer.unref();
  })]);

  const failed = result(await client.callTool({ name: 'page_propose', arguments: { reason: 'Fixture invalid candidate', files: [{ path: 'front/App.tsx', content: 'invalid source', expectedHash: file.hash }] } }));
  assert.equal(failed.status, 'ready');
  assert.deepEqual(failed.checks, []);
  const proposed = result(await client.callTool({ name: 'page_propose', arguments: { reason: 'Fixture candidate', files: [{ path: '../backend/example.mjs', content: 'a'.repeat(512 * 1024), expectedHash: null, encoding: 'utf8' }] } }));
  assert.equal(proposed.status, 'ready');
  assert.equal(requests.at(-1).body.files[0].expectedHash, null);
  const applied = result(await client.callTool({ name: 'page_apply', arguments: { changeId: proposed.changeId } }));
  assert.equal(applied.status, 'applied');
  const rolledBack = result(await client.callTool({ name: 'page_rollback', arguments: { changeId: proposed.changeId } }));
  assert.equal(rolledBack.status, 'rolledBack');
  const changes = result(await client.callTool({ name: 'page_changes', arguments: {} }));
  assert.equal(changes.changes[0].status, 'rolledBack');

  const evidence = 'Always use the dark theme from now on.';
  const preference = result(await client.callTool({ name: 'preferences_set', arguments: { key: 'theme', value: { name: 'dark' }, evidence } }));
  assert.equal(preference.preference.evidence, evidence);
  assert.equal(result(await client.callTool({ name: 'preferences_get', arguments: {} })).preferences.length, 1);
  assert.equal(result(await client.callTool({ name: 'preferences_forget', arguments: { id: 'pref-1' } })).ok, true);
  assert.equal(result(await client.callTool({ name: 'preferences_get', arguments: {} })).preferences.length, 0);
  const conflict = await client.callTool({ name: 'workspace_read_file', arguments: { path: 'front/error.tsx' } });
  assert.equal(conflict.isError, true);
  assert.equal(result(conflict).error.code, 'CONFLICT');

  // Managed registration records ownership but is never a write permission gate.
  assert.ok(!requests.some(request => request.url === '/internal/register-task'));
  const managedClient = new Client({ name: 'seedagent-managed-protocol-check', version: '1.0.0' });
  const managedTransport = new StdioClientTransport({
    command: process.execPath, args: [serverPath], cwd: fixture, stderr: 'pipe',
    env: { PATH: process.env.PATH, SEEDAGENT_PROJECT_ROOT: fixture, SEEDAGENT_WORKSPACE_PORT: String(servicePort), SEEDAGENT_BUILDER_PORT: String(servicePort), SEED_AGENT_PORT: String(servicePort), SEED_AGENT_MANAGED: '1' },
  });
  await managedClient.connect(managedTransport);
  t.after(() => managedClient.close());
  const beforeContext = requests.length;
  assert.equal(result(await managedClient.callTool({ name: 'project_context', arguments: {} })).taskId, undefined);
  assert.equal(result(await managedClient.callTool({ name: 'project_context', arguments: { modification: false } })).taskId, undefined);
  assert.equal(requests.length, beforeContext);
  const registeredContext = result(await managedClient.callTool({ name: 'project_context', arguments: { modification: true } }));
  assert.equal(registeredContext.taskId, 'RUN-managed-fixture');
  assert.equal(requests.at(-1).body.fingerprint, toolFingerprint('project_context', { modification: true }));
  const managedMutations = [
    ['page_propose', { reason: '  Managed fixture candidate  ', files: [{ path: 'front/features/managed.tsx', content: 'export {}' }] }, '/changes'],
    ['page_apply', { changeId: 'candidate-1' }, '/changes/candidate-1/apply'],
    ['page_rollback', { changeId: 'candidate-1' }, '/changes/candidate-1/rollback'],
    ['preferences_set', { key: '  theme  ', value: 'dark', evidence: ' Use the dark theme from now on. ' }, '/preferences'],
    ['preferences_forget', { id: 'pref-1' }, '/preferences/pref-1'],
    ['workspace_write_file', { path: '/fixture/direct', content: 'written', reason: '  managed write  ' }, '/files/write'],
    ['workspace_delete_file', { path: '../fixture-direct', reason: '  managed delete  ' }, '/files/delete'],
    ['workspace_run_command', { command: 'fixture-command', cwd: '../fixture-cwd', timeoutMs: 1 }, '/commands'],
  ];
  for (const [name, args, endpoint] of managedMutations) {
    const before = requests.length;
    const output = await managedClient.callTool({ name, arguments: args });
    assert.notEqual(output.isError, true);
    const added = requests.slice(before);
    assert.equal(added.length, 2);
    assert.equal(added[0].url, '/internal/register-task');
    assert.equal(added[0].body.tool, name);
    assert.equal(added[0].body.fingerprint, toolFingerprint(name, args));
    assert.equal(added[1].url, endpoint);
  }
  registrationDenied = true;
  for (const [name, args, endpoint] of managedMutations) {
    const before = requests.length;
    const output = await managedClient.callTool({ name, arguments: args });
    assert.notEqual(output.isError, true, `${name} must continue after registration refusal`);
    assert.equal(result(output).warnings[0].code, 'TASK_REGISTRATION_FAILED');
    assert.equal(result(output).warnings[0].cause, 'TASK_REQUIRED');
    assert.deepEqual(requests.slice(before).map(request => request.url), ['/internal/register-task', endpoint]);
  }
  const deniedContext = result(await managedClient.callTool({ name: 'project_context', arguments: { modification: true } }));
  assert.equal(deniedContext.taskId, undefined);
  assert.equal(deniedContext.files.length, 6);
  assert.equal(deniedContext.warnings[0].code, 'TASK_REGISTRATION_FAILED');
  snapshotUnavailable = true;
  const twoWarnings = result(await managedClient.callTool({ name: 'workspace_write_file', arguments: { path: '../fixture-two-warnings', content: 'applied despite two warnings' } }));
  assert.equal(twoWarnings.status, 'applied');
  assert.equal(twoWarnings.changeId, undefined);
  assert.deepEqual(twoWarnings.warnings.map(warning => warning.code), ['SNAPSHOT_UNAVAILABLE', 'TASK_REGISTRATION_FAILED']);
  snapshotUnavailable = false;
  registrationDenied = false;
  malformedRegistration = true;
  const malformed = result(await managedClient.callTool({ name: 'workspace_write_file', arguments: { path: '../fixture-malformed', content: 'still written' } }));
  assert.equal(malformed.status, 'applied');
  assert.equal(malformed.warnings[0].cause, 'DEPENDENCY_PROTOCOL');
  await managedClient.close();

  // Authentication remains file-based, and symlinks are allowed in full-access mode.
  await rename(tokenFile, `${tokenFile}.real`);
  await symlink(`${tokenFile}.real`, tokenFile);
  const tokenLink = await client.callTool({ name: 'preferences_get', arguments: {} });
  assert.notEqual(tokenLink.isError, true);
  await unlink(tokenFile);
  await rename(`${tokenFile}.real`, tokenFile);
  await close(httpServer);
  const unavailable = await client.callTool({ name: 'preferences_get', arguments: {} });
  assert.equal(unavailable.isError, true);
  assert.equal(result(unavailable).error.code, 'DEPENDENCY_UNAVAILABLE');
  assert.ok(!JSON.stringify(unavailable).includes(token));
  const logs = await readFile(join(fixture, 'logs/mcp-runtime', `mcp-runtime-${new Date().toISOString().slice(0, 10)}.log`), 'utf8');
  assert.ok(!logs.includes(token));
  assert.ok(!logs.includes(evidence));
  assert.ok(logs.includes('TASK_REGISTRATION_FAILED'));
  assert.ok(!logs.includes('fixture-failure'));
  assert.ok(!logs.includes('invalid source'));
  assert.ok(!logs.includes('written'));
  assert.equal(stderr, '');
});
