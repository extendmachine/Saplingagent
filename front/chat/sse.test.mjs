import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeEvents, EventParser } from './sse.ts';

test('network chunks may split UTF-8, CRLF, JSON and event boundaries', async () => {
  const text = ': heartbeat\r\n\r\nevent: token\r\ndata: {"type":"text_delta","delta":"你好🌱"}\r\n\r\ndata: {"type":"done","status":"completed"}\n\n';
  const bytes = new TextEncoder().encode(text);
  const response = new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } }));
  const events = [];
  await consumeEvents(response, event => events.push(event));
  assert.deepEqual(events, [{ type: 'text_delta', delta: '你好🌱' }, { type: 'done', status: 'completed' }]);
});

test('supports multi-line data and final event without a blank terminator', () => {
  const events = [];
  const parser = new EventParser(event => events.push(event));
  parser.push('data: {"type":"status",\rdata: "label":"执行中"}\r');
  parser.push('', true);
  assert.deepEqual(events, [{ type: 'status', label: '执行中' }]);
});

test('malformed data produces a clear failure instead of silently losing output', () => {
  const parser = new EventParser(() => {});
  assert.throws(() => parser.push('data: broken\n\n'), /格式错误/);
  assert.throws(() => new EventParser(() => {}).push('data: {"delta":"hello"}\n\n'), /事件类型/);
});

test('comments and retry fields do not create fake messages', () => {
  const events = [];
  const parser = new EventParser(event => events.push(event));
  parser.push(': pong\nretry: 3000\nid: 15\n\n');
  parser.push('data: {"type":"done","status":"interrupted"}\n\n');
  assert.equal(events.length, 1);
});
