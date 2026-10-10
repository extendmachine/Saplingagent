import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { distributable } from '../package-macos.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
async function fixture(t, { auth = 'missing', badDev = false } = {}) {
  const parent = path.join(project, '.cache/macos-tests'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "测试 app's "));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const file of ['scripts/setup.mjs', 'scripts/macos/cli.mjs', 'scripts/macos/bootstrap.sh', 'scripts/macos/entry.sh', 'scripts/macos/codex.sh', '1-安装.command', '2-登录Codex.command', '3-启动SeedAgent.command', '4-诊断.command', 'config/macos.json', 'config/runtime.json']) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.copyFile(path.join(project, file), path.join(root, file));
  }
  const settings = JSON.parse(await fs.readFile(path.join(root, 'config/macos.json'), 'utf8'));
  const hash = createHash('sha256').update(JSON.stringify(settings));
  for (const service of ['front', 'backend/app-builder', 'backend/mcp-runtime']) {
    await fs.mkdir(path.join(root, service), { recursive: true });
    await fs.writeFile(path.join(root, service, 'package-lock.json'), '{}'); hash.update('{}');
  }
  const codex = path.join(root, '.runtime/codex/node_modules/.bin/codex');
  const fake = `#!/bin/sh\ncase "$*" in\n *--version*) echo 'codex-cli 0.146.1'; exit 0;;\n *status*) ${auth === 'missing' ? "echo 'Not logged in' >&2; exit 1" : auth === 'broken' ? "echo 'Config error PRIVATE_FIXTURE_VALUE' >&2; exit 1" : 'exit 0'};;\n *) exit 7;;\nesac\n`;
  await fs.mkdir(path.dirname(codex), { recursive: true }); await fs.writeFile(codex, fake, { mode: 0o755 });
  for (const file of ['front/node_modules/vite/bin/vite.js', 'backend/mcp-runtime/node_modules/@modelcontextprotocol/sdk/package.json']) { await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.writeFile(path.join(root, file), '{}'); }
  await fs.writeFile(path.join(root, '.runtime/macos-install.json'), JSON.stringify({ signature: hash.digest('hex'), arch: process.arch }));
  await fs.writeFile(path.join(root, 'scripts/dev.mjs'), badDev ? "console.error('Port occupied'); process.exit(1);" : "await import('node:fs/promises').then(f=>f.writeFile(new URL('../UNEXPECTED_LAUNCH',import.meta.url),'bad'));process.exit(7);");
  return root;
}
function runCli(root, action, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts/macos/cli.mjs'), ...action], { cwd: root, env: { ...process.env, SEED_ROOT: '/invalid-root', CODEX_HOME: '/invalid-codex-home', ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', x => output += x); child.stderr.on('data', x => output += x); child.once('error', reject); child.once('exit', code => resolve({ code, output }));
  });
}
test('distribution filter excludes runtime/private files while retaining complete rules and Skills', () => {
  for (const file of ['local-secrets/codex/auth.json', 'backend/a/local-secrets/key.txt', 'data/session.json', 'backend/agent-runtime/ai-tasks/runtime/run.md', 'front/node_modules/react/index.js', '.runtime/codex/package.json', '.worktrees/coordination/TODO.md', 'logs/front/x.log', 'backend/a/.env.local', 'backend/a/token.pem', 'front/dist/index.html']) assert.equal(distributable(file), false, file);
  for (const file of ['rules/README.md', 'rules/clawtask-package-skill-v2.zip', '.agents/skills/seed-page-edit/SKILL.md', '1-安装.command', 'front/App.tsx', 'scripts/macos/codex.sh']) assert.equal(distributable(file), true, file);
});
test('missing login does not launch services or copy global authentication', async t => {
  const root = await fixture(t);
  const result = await runCli(root, ['start', '--no-open']);
  assert.equal(result.code, 1); assert.match(result.output, /尚未登录/);
  assert.equal(await fs.access(path.join(root, 'UNEXPECTED_LAUNCH')).then(() => true, () => false), false);
  assert.equal(await fs.access(path.join(root, 'local-secrets/codex/auth.json')).then(() => true, () => false), false);
  const ledger = JSON.parse(await fs.readFile(path.join(root, 'local-secrets/notes/project-secrets.json'), 'utf8'));
  assert.equal(ledger.schema_version, 1); assert.equal(ledger.project.root, root); assert.deepEqual(ledger.credentials, []);
});
test('configuration errors are not reported as missing login and raw diagnostics stay private', async t => {
  const root = await fixture(t, { auth: 'broken' });
  const result = await runCli(root, ['login']);
  assert.equal(result.code, 1); assert.match(result.output, /不能视为尚未登录/); assert.doesNotMatch(result.output, /PRIVATE_FIXTURE_VALUE/);
});
test('dependency changes invalidate the success marker before launching', async t => {
  const root = await fixture(t, { auth: 'present' }); await fs.writeFile(path.join(root, 'front/package-lock.json'), '{"changed":true}');
  const result = await runCli(root, ['start', '--no-open']);
  assert.equal(result.code, 1); assert.match(result.output, /锁文件已经变化/);
  assert.equal(await fs.access(path.join(root, 'UNEXPECTED_LAUNCH')).then(() => true, () => false), false);
});
test('a failed launcher cannot claim another live project is ready', async t => {
  const root = await fixture(t, { auth: 'present', badDev: true });
  const result = await runCli(root, ['start', '--no-open']);
  assert.equal(result.code, 1); assert.match(result.output, /Port occupied/); assert.doesNotMatch(result.output, /已接入 Codex App Server/);
});
test('failed staging preserves a complete old installation and repairs stripped script permissions', async t => {
  const root = await fixture(t, { auth: 'present' });
  const marker = path.join(root, '.runtime/macos-install.json'), wrapper = path.join(root, 'scripts/macos/codex.sh');
  const before = await fs.readFile(marker, 'utf8'); await fs.chmod(wrapper, 0o644);
  const bin = path.join(root, 'fake-bin'); await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'npm'), '#!/bin/sh\necho "Synthetic network failure" >&2\nexit 42\n', { mode: 0o755 });
  const result = await runCli(root, ['install', '--repair'], { PATH: bin + path.delimiter + process.env.PATH });
  assert.equal(result.code, 1); assert.match(result.output, /退出码 42/);
  assert.equal(await fs.readFile(marker, 'utf8'), before);
  assert.equal((await fs.stat(wrapper)).mode & 0o777, 0o755);
  assert.equal(await fs.access(path.join(root, '.runtime/macos-install.lock')).then(() => true, () => false), false);
  assert.equal((await fs.readdir(path.join(root, '.runtime'))).some(x => x.startsWith('codex-install-')), false);
});
