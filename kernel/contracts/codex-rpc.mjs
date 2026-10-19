import { spawn } from 'node:child_process';
import { codexBinary, terminateOwned } from './local-process.mjs';
import { EventEmitter } from 'node:events';

export class AppServer extends EventEmitter {
  constructor({ cwd, command = process.env.SEED_CODEX_BIN || (process.platform === 'win32' ? codexBinary(cwd || process.env.SEED_ROOT || process.cwd()) : 'codex'), args = [], env, spawnProcess = spawn }) {
    super(); this.nextId = 1; this.pending = new Map(); this.closed = false;
    this.child = spawnProcess(command, ['app-server', '--listen', 'stdio://', ...args], { cwd, env, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdin.on('error', () => this.fail(new Error('Agent input pipe closed')));
    let buffer = '';
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 16 * 1024 * 1024) return this.fail(new Error('Agent protocol frame exceeded limit'));
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try { this.receive(JSON.parse(line)); } catch { this.fail(new Error('Invalid Agent protocol frame')); }
      }
    });
    // Codex stderr can contain account/network diagnostics. Never persist raw stderr.
    this.child.stderr.on('data', () => {});
    this.child.once('error', error => this.fail(new Error(`Cannot start Codex App Server (${error.code || 'spawn error'})`)));
    this.child.once('exit', (code, signal) => this.fail(new Error(`Codex App Server stopped (${signal || code})`)));
  }
  receive(message) {
    if (message.method) this.emit(message.id === undefined ? 'notification' : 'request', message);
    else {
      const pending = this.pending.get(message.id); if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timer);
      if (message.error) pending.reject(Object.assign(new Error(message.error.message || 'Agent request failed'), { code: message.error.code }));
      else pending.resolve(message.result);
    }
  }
  send(message) {
    if (this.closed || !this.child.stdin.writable) throw new Error('Agent connection is closed');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  call(method, params = {}, timeoutMs = 60000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Agent request timed out: ${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  reply(id, result) { this.send({ id, result }); }
  reject(id, message = 'Unsupported request') { this.send({ id, error: { code: -32601, message } }); }
  fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.terminate();
    this.emit('disconnect', error);
  }
  terminate() {
    if (this.termination) return this.termination;
    this.termination = terminateOwned(this.child, { killMs: 750 }).catch(() => {
      // Stream cleanup still completes; no raw system diagnostics/credentials.
    }).finally(() => {
      this.child.stdin.destroy(); this.child.stdout.destroy(); this.child.stderr.destroy();
    });
    return this.termination;
  }
  close() { this.fail(new Error('Agent shut down')); return this.termination; }
}
