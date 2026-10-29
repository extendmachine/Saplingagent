import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createControlHandler } from '../server.mjs';
import { openRuntimeConfiguration, configurationStatus } from '../configuration.mjs';

test('shared control handlers deduplicate setup, validate requests and release only their own write counter', async t => {
  const manager = { root: '/fixture', instanceId: 'runtime-fixture', gatewayWrites: 2 };
  let resolve, launches = 0;
  const launchConfiguration = () => { launches++; return new Promise(r => { resolve = r; }); };
  const options = { manager, token: 'fixture', launchConfiguration };
  const servers = [http.createServer(createControlHandler(options)), http.createServer(createControlHandler(options))];
  for (const server of servers) { await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => { server.closeAllConnections(); return new Promise(r => server.close(r)); }); }
  [options.frontPort, options.managerPort] = servers.map(s => s.address().port);
  const request = (index, body, headers = {}, suffix = '/open') => fetch(`http://127.0.0.1:${servers[index].address().port}/api/runtime/configuration${suffix}`, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await request(0, { instanceId: 'wrong' })).status, 409);
  assert.equal((await request(0, { instanceId: manager.instanceId, command: 'arbitrary' })).status, 400);
  assert.equal((await request(0, { instanceId: manager.instanceId }, { Origin: 'https://foreign.invalid' })).status, 403);
  assert.equal(launches, 0);
  const first = await request(0, { instanceId: manager.instanceId }); assert.equal(first.status, 202);
  const job = (await first.json()).configuration;
  assert.deepEqual((await (await request(1, { instanceId: manager.instanceId })).json()).configuration, job);
  assert.equal(launches, 1); assert.equal(manager.gatewayWrites, 3);
  assert.equal((await (await request(1, null, {}, '')).json()).configuration.phase, 'starting');
  resolve({ url: 'http://127.0.0.1:61234/', browserRequested: true }); await new Promise(setImmediate);
  assert.equal(configurationStatus(manager).phase, 'ready'); assert.equal(manager.gatewayWrites, 2);
  manager.operation = Promise.resolve(); assert.equal((await request(0, { instanceId: manager.instanceId })).status, 409);
  manager.operation = null;
  await request(0, { instanceId: manager.instanceId }); assert.equal(launches, 2);
  resolve({ url: 'http://127.0.0.1:61234/', browserRequested: true }); await new Promise(setImmediate);
});
test('slow jobs stay pending without duplicate launch; failures release gates and projects remain independent', async () => {
  const one = { root: '/one', gatewayWrites: 0 }, two = { root: '/two', gatewayWrites: 0 };
  let reject;
  const job = openRuntimeConfiguration(one, { slowMs: 2, launch: () => new Promise((_, r) => { reject = r; }) });
  await delay(10);
  assert.equal(configurationStatus(one).slow, true); assert.equal(configurationStatus(one).phase, 'starting');
  assert.equal(openRuntimeConfiguration(one, { launch: () => assert.fail('duplicate') }).id, job.id);
  assert.equal(one.gatewayWrites, 1);
  openRuntimeConfiguration(two, { launch: async () => ({ url: 'http://127.0.0.1:61235/', browserRequested: false }) });
  await new Promise(setImmediate); assert.equal(two.gatewayWrites, 0); assert.equal(configurationStatus(two).phase, 'ready');
  reject(Object.assign(Error('private details'), { code: 'UI_BUILD_FAILED' })); await new Promise(setImmediate);
  assert.equal(one.gatewayWrites, 0); assert.deepEqual(configurationStatus(one).error, { code: 'UI_BUILD_FAILED' });
  openRuntimeConfiguration(one, { launch: () => { throw Error('private details'); } }); await new Promise(setImmediate);
  assert.equal(one.gatewayWrites, 0); assert.equal(configurationStatus(one).error.code, 'CONFIGURATION_START_FAILED');
});
