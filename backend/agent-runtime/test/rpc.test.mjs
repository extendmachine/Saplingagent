import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter, once } from 'node:events';
import { AppServer } from '../rpc.mjs';

function fixture() {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => true;
  const rpc = new AppServer({ spawnProcess: () => child });
  rpc.on('disconnect', () => {});
  return { rpc, child };
}
test('RPC handles fragmented UTF-8, notifications and out-of-order replies', async () => {
  const { rpc, child } = fixture();
  const a = rpc.call('a'), b = rpc.call('b');
  const event = once(rpc, 'notification');
  const data = Buffer.from('{"method":"note","params":{"text":"流式"}}\n{"id":2,"result":"b"}\n{"id":1,"result":"a"}\n');
  for (let i = 0; i < data.length; i += 5) child.stdout.write(data.subarray(i, i + 5));
  assert.equal((await event)[0].params.text, '流式'); assert.equal(await b, 'b'); assert.equal(await a, 'a'); rpc.close();
});
test('RPC deadline rejects and removes pending requests', async () => {
  const { rpc } = fixture(); await assert.rejects(rpc.call('slow', {}, 10), /timed out/); assert.equal(rpc.pending.size, 0); rpc.close();
});
test('pipe failure rejects pending RPC instead of causing an unhandled process error', async () => {
  const { rpc, child } = fixture(); const pending = rpc.call('pending'); child.stdin.emit('error', new Error('EPIPE')); await assert.rejects(pending, /pipe closed/); assert.equal(rpc.closed, true);
});
test('malformed protocol terminates connection and rejects requests', async () => {
  const { rpc, child } = fixture(); const pending = rpc.call('pending'); child.stdout.write('invalid\n'); await assert.rejects(pending, /Invalid Agent protocol/); assert.equal(rpc.closed, true);
});
