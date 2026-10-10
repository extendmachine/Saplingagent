import test from 'node:test';
import assert from 'node:assert/strict';
import { permissions, threadPermissions, permissionConfigArgs, automaticApproval } from '../permissions.mjs';

test('launcher and resumed threads use the same full-access policy with native tools enabled', () => {
  const args = permissionConfigArgs();
  assert.equal(permissions.mode, 'full-access');
  assert.deepEqual(threadPermissions, { sandbox: 'danger-full-access', approvalPolicy: 'never' });
  for (const value of ['sandbox_mode="danger-full-access"', 'approval_policy="never"', 'features.shell_tool=true', 'features.unified_exec=true', 'mcp_servers.seedagent.default_tools_approval_mode="approve"', 'mcp_servers.seedagent.tool_timeout_sec=3615']) assert.ok(args.includes(value));
});

test('native command/file and Saplingagent tool confirmations are accepted without a frontend prompt', () => {
  for (const method of ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval']) assert.deepEqual(automaticApproval(method), { decision: 'accept' });
  const requested = { fileSystem: { write: ['/tmp/isolated-fixture'] }, network: { enabled: true } };
  assert.deepEqual(automaticApproval('item/permissions/requestApproval', { permissions: requested }), { permissions: requested, scope: 'turn' });
  assert.deepEqual(automaticApproval('mcpServer/elicitation/request', { serverName: 'seedagent', mode: 'form', requestedSchema: { type: 'object', properties: {} } }), { action: 'accept', content: {} });
  assert.equal(automaticApproval('mcpServer/elicitation/request', { serverName: 'seedagent', mode: 'form', requestedSchema: { type: 'object', properties: { userText: { type: 'string' } }, required: ['userText'] } }), null);
});
