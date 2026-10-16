import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { listenAscending, selectRuntimePorts, portKeys } from '../ports.mjs';

test('ascending allocation skips occupied ports and ports selected for another service', async t => {
  const foreign = net.createServer();
  await listenAscending(foreign, 30000);
  t.after(() => new Promise(resolve => foreign.close(resolve)));
  const start = foreign.address().port;
  const config = Object.fromEntries(portKeys.map(key => [key, start]));
  const selected = await selectRuntimePorts(config);
  assert.equal(new Set(Object.values(selected)).size, portKeys.length);
  assert.ok(Object.values(selected).every(port => port > start));
  assert.equal(foreign.listening, true);
  assert.deepEqual(config, Object.fromEntries(portKeys.map(key => [key, start])));
});

test('the actual listener retries a port claimed after allocation and keeps its foreign owner intact', async t => {
  const occupied = http.createServer((req, res) => res.end('foreign'));
  await listenAscending(occupied, 32000);
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  const own = http.createServer((req, res) => res.end('own'));
  const port = await listenAscending(own, occupied.address().port);
  t.after(() => { own.closeAllConnections(); return new Promise(resolve => own.close(resolve)); });
  assert.ok(port > occupied.address().port);
  assert.equal(await (await fetch(`http://127.0.0.1:${occupied.address().port}/`)).text(), 'foreign');
  assert.equal(await (await fetch(`http://127.0.0.1:${port}/`)).text(), 'own');
});

test('exhaustion and invalid starts fail explicitly without wrapping to another port range', async () => {
  const server = net.createServer();
  await assert.rejects(listenAscending(server, 65535, new Set([65535])), { code: 'PORT_UNAVAILABLE' });
  for (const port of [0, 1023, 65536, '5173', NaN]) await assert.rejects(listenAscending(server, port), { code: 'INVALID_CONFIG' });
  assert.equal(server.listening, false);
});
