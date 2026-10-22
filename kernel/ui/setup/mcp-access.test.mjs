import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConnectionReady, exportMcpConfiguration, saveMcpSettings, mcpSettingsChanged } from './mcp-access.ts';
import { setupAvailability } from './setup-flow.ts';

const snapshot = (root = '/fixture/app', change = {}) => ({ schemaVersion: 1, revision: 3, enabled: true, externalOnly: true, available: true, transport: 'stdio', permissionMode: 'full-access', configuration: { mcpServers: { saplingagent: { command: root + '/.runtime/node', args: [root + '/kernel/services/mcp-access/stdio.mjs'] } } }, warnings: [], ...change });

test('external-only MCP can finish setup without an account, but only after saving and building', () => {
  assert.equal(aiConnectionReady(null, snapshot()), true);
  for (const change of [{ enabled: false }, { externalOnly: false }]) assert.equal(aiConnectionReady(null, snapshot('', change)), false);
  assert.equal(aiConnectionReady('saved-profile'), true);
  const built = { configurationHost: 'external', settingsSaved: true, exportReady: true, launcher: { artifact: 'app.app' } };
  assert.equal(setupAvailability(built, false, false, aiConnectionReady(null, snapshot())).finishSetup, true);
  assert.equal(setupAvailability(built, false, true, true).finishSetup, false);
  assert.equal(setupAvailability({ ...built, exportReady: false }, false, false, true).finishSetup, false);
});

test('MCP saves only its independent revision and choices; conflicts propagate without claiming success', async () => {
  const calls = [], draft = { ...snapshot(), revision: 9 };
  const result = await saveMcpSettings(async (route, body) => { calls.push({ route, body }); return snapshot(); }, draft);
  assert.equal(result.revision, 3);
  assert.deepEqual(calls, [{ route: 'mcp', body: { revision: 9, enabled: true, externalOnly: true } }]);
  await assert.rejects(saveMcpSettings(async () => { throw Object.assign(Error('Changed'), { code: 'CONFIG_CHANGED' }); }, draft), { code: 'CONFIG_CHANGED' });
  await assert.rejects(saveMcpSettings(async () => assert.fail('Must not write'), { revision: 9, enabled: false, externalOnly: true }), { code: 'MCP_DISABLED' });
  assert.equal(mcpSettingsChanged(snapshot(), { revision: 3, enabled: false, externalOnly: false }), true);
});

test('each export fetches the final current path and exports only client JSON', async () => {
  let root = '/fixture/before'; const copied = [], routes = [];
  const request = async route => { routes.push(route); return snapshot(root); };
  await exportMcpConfiguration(request, json => copied.push(JSON.parse(json)));
  root = '/fixture/after rename';
  await exportMcpConfiguration(request, json => copied.push(JSON.parse(json)));
  assert.deepEqual(routes, ['mcp', 'mcp']);
  assert.equal(copied[0].mcpServers.saplingagent.command, '/fixture/before/.runtime/node');
  assert.equal(copied[1].mcpServers.saplingagent.command, '/fixture/after rename/.runtime/node');
  assert.deepEqual(Object.keys(copied[1]), ['mcpServers']);
});

test('disabled or unavailable MCP never exports stale configuration', async () => {
  for (const change of [{ enabled: false }, { available: false }, { configuration: null }]) {
    await assert.rejects(exportMcpConfiguration(async () => snapshot('', change), () => assert.fail('Must not export')));
  }
});

test('clipboard or download failures reject instead of claiming export success', async () => {
  await assert.rejects(exportMcpConfiguration(async () => snapshot(), async () => { throw Error('Clipboard denied'); }), /Clipboard denied/);
});
