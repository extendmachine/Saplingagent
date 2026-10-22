import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGateway } from '../gateway.mjs';
import { RuntimeManager } from '../manager.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(10);
  }
  assert.fail('Gateway mutation did not settle after upstream termination');
}
async function fixture(t, handler) {
  const cache = fileURLToPath(new URL('../../../../.cache/tmp/', import.meta.url));
  await fs.mkdir(cache, { recursive: true });
  const root = await fs.mkdtemp(path.join(cache, 'gateway-drain-'));
  const upstream = http.createServer(handler);
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const manager = new RuntimeManager({ root, token: 'fixture-token', definitions: [], output: false });
  manager.phase = 'ready';
  manager.config = { agentPort: upstream.address().port, vitePort: upstream.address().port };
  const options = { manager, token: 'fixture-token' };
  const gateway = createGateway(options);
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  options.frontPort = gateway.address().port;
  const base = `http://127.0.0.1:${options.frontPort}`;
  t.after(async () => {
    gateway.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([new Promise(resolve => gateway.close(resolve)), new Promise(resolve => upstream.close(resolve))]);
    await fs.rm(root, { recursive: true, force: true });
  });
  const request = headers => {
    const req = http.request(base + '/api/write', { method: 'POST', headers: { Origin: base, ...headers } });
    req.on('error', () => {});
    return req;
  };
  return { root, manager, request };
}
async function assertReleased(manager) {
  await until(() => manager.gatewayWrites === 0);
  const undo = await manager.prepareMaintenance();
  await undo();
  // Socket close/error notifications may follow end. They must not decrement twice.
  await delay(30);
  assert.equal(manager.gatewayWrites, 0);
}

test('disconnected mutation drains a large response and keeps stop blocked until the write completes', async t => {
  const release = Promise.withResolvers();
  const finished = Promise.withResolvers();
  const connected = Promise.withResolvers();
  let upstreamResponse;
  const { root, manager, request } = await fixture(t, async (req, res) => {
    req.resume();
    upstreamResponse = res;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: started\n\n');
    await release.promise;
    await fs.writeFile(path.join(root, 'committed'), 'complete');
    res.end(Buffer.alloc(2 * 1024 * 1024, 'x'));
    finished.resolve();
  });
  const req = request();
  req.once('response', response => response.once('data', () => { response.destroy(); connected.resolve(); }));
  req.end('fixture');
  await connected.promise;
  await delay(30);
  assert.equal(upstreamResponse.destroyed, false);
  assert.equal(manager.gatewayWrites, 1);
  await assert.rejects(manager.prepareMaintenance(), { code: 'KERNEL_BUSY' });
  release.resolve();
  await finished.promise;
  assert.equal(await fs.readFile(path.join(root, 'committed'), 'utf8'), 'complete');
  await assertReleased(manager);
});

test('a mutation disconnected before response headers remains pending until its response ends', async t => {
  const uploaded = Promise.withResolvers();
  const headers = Promise.withResolvers();
  const release = Promise.withResolvers();
  let upstreamResponse;
  const { manager, request } = await fixture(t, async (req, res) => {
    upstreamResponse = res;
    req.resume();
    req.once('end', () => uploaded.resolve());
    await headers.promise;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: still writing\n\n');
    await release.promise;
    res.end('data: complete\n\n');
  });
  const req = request();
  req.end('fixture');
  await uploaded.promise;
  req.destroy();
  await delay(30);
  headers.resolve();
  await delay(30);
  assert.equal(manager.gatewayWrites, 1);
  assert.equal(upstreamResponse.destroyed, false);
  await assert.rejects(manager.prepareMaintenance(), { code: 'KERNEL_BUSY' });
  release.resolve();
  await assertReleased(manager);
});

test('aborted upload before response headers releases accounting once', async t => {
  const uploading = Promise.withResolvers();
  const closed = Promise.withResolvers();
  const { manager, request } = await fixture(t, (req, res) => {
    req.on('error', () => {});
    req.once('data', () => uploading.resolve());
    res.once('close', () => closed.resolve());
  });
  const req = request({ 'Content-Length': 1024 });
  req.write('partial');
  await uploading.promise;
  assert.equal(manager.gatewayWrites, 1);
  req.destroy();
  await closed.promise;
  await assertReleased(manager);
});

test('truncated upstream response and request failure each release exactly once', async t => {
  let calls = 0;
  const { manager, request } = await fixture(t, (req, res) => {
    req.resume();
    if (++calls === 1) {
      res.writeHead(200, { 'Content-Length': 1024 });
      res.write('partial');
      setImmediate(() => res.destroy());
    } else req.socket.destroy();
  });
  for (let index = 0; index < 2; index++) {
    await new Promise(resolve => {
      const req = request();
      req.once('error', resolve);
      req.once('response', response => {
        response.on('error', () => {});
        response.once('close', resolve);
        response.resume();
      });
      req.end('fixture');
    });
    await assertReleased(manager);
  }
});
