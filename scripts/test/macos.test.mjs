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
  const root = await fs.mkdtemp(path.join(parent, "\u6d4b\u8bd5 app's "));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const file of ['scripts/setup.mjs', 'scripts/macos/cli.mjs', 'scripts/macos/bootstrap.sh', 'scripts/macos/codex.sh', 'Saplingagent.command', 'config/macos.json', 'config/runtime.json']) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.copyFile(path.join(project, file), path.join(root, file));
  }
  const settings = JSON.parse(await fs.readFile(path.join(root, 'config/macos.json'), 'utf8'));
  const hash = createHash('sha256').update(JSON.stringify(settings));
  for (const service of ['front', 'backend/app-builder', 'backend/mcp-runtime', 'backend/agent-runtime']) {
    await fs.mkdir(path.join(root, service), { recursive: true });
    await fs.writeFile(path.join(root, service, 'package-lock.json'), '{}'); hash.update('{}');
  }
  const codex = path.join(root, '.runtime/codex/node_modules/.bin/codex');
  const fake = `#!/bin/sh\ncase "$*" in\n *--version*) echo 'codex-cli 0.146.1'; exit 0;;\n *status*) ${auth === 'missing' ? "echo 'Not logged in' >&2; exit 1" : auth === 'broken' ? "echo 'Config error PRIVATE_FIXTURE_VALUE' >&2; exit 1" : 'exit 0'};;\n *) exit 7;;\nesac\n`;
  await fs.mkdir(path.dirname(codex), { recursive: true }); await fs.writeFile(codex, fake, { mode: 0o755 });
  for (const file of ['front/node_modules/vite/bin/vite.js', 'backend/mcp-runtime/node_modules/@modelcontextprotocol/sdk/package.json', 'backend/agent-runtime/node_modules/.bin/opencode']) { await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.writeFile(path.join(root, file), '{}'); }
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
  for (const file of ['local-secrets/codex/auth.json', 'backend/a/local-secrets/key.txt', 'data/session.json', 'backend/agent-runtime/ai-tasks/runtime/run.md', 'front/node_modules/react/index.js', '.runtime/codex/package.json', '.worktrees/coordination/TODO.md', 'logs/front/x.log', 'backend/a/.env.local', 'backend/a/token.pem', 'front/dist/index.html', '1-Install.command', '2-Login-Codex.command', '3-Start-Saplingagent.command', '4-Doctor.command', '5-Configure-OpenCode.command']) assert.equal(distributable(file), false, file);
  for (const file of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md', 'rules/README.md', 'rules/clawtask-package-skill-v2.zip', '.agents/skills/seed-page-edit/SKILL.md', 'Saplingagent.command', 'front/App.tsx', 'scripts/macos/codex.sh']) assert.equal(distributable(file), true, file);
});
test('missing login does not launch services or copy global authentication', async t => {
  const root = await fixture(t);
  const result = await runCli(root, ['start', '--no-open']);
  assert.equal(result.code, 1); assert.match(result.output, /not logged in/);
  assert.equal(await fs.access(path.join(root, 'UNEXPECTED_LAUNCH')).then(() => true, () => false), false);
  assert.equal(await fs.access(path.join(root, 'local-secrets/codex/auth.json')).then(() => true, () => false), false);
  const ledger = JSON.parse(await fs.readFile(path.join(root, 'local-secrets/notes/project-secrets.json'), 'utf8'));
  assert.equal(ledger.schema_version, 1); assert.equal(ledger.project.root, root); assert.deepEqual(ledger.credentials, []);
});
test('configuration errors are not reported as missing login and raw diagnostics stay private', async t => {
  const root = await fixture(t, { auth: 'broken' });
  const result = await runCli(root, ['login']);
  assert.equal(result.code, 1); assert.match(result.output, /does not mean the project is not logged in/); assert.doesNotMatch(result.output, /PRIVATE_FIXTURE_VALUE/);
});
test('OpenCode configuration uses this project storage without requiring Codex login', async t => {
  const root = await fixture(t);
  const binary = path.join(root, 'backend/agent-runtime/node_modules/.bin/opencode');
  await fs.writeFile(binary, '#!/bin/sh\nprintf "%s\\n" "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$CODEX_HOME" "${OPENAI_API_KEY-unset}" > opencode-env.txt\nexit 0\n', { mode: 0o755 });
  await fs.chmod(binary, 0o755);
  const result = await runCli(root, ['opencode'], { OPENAI_API_KEY: 'SYNTHETIC_EXTERNAL_KEY' });
  assert.equal(result.code, 0);
  assert.match(result.output, /OpenCode provider saved/);
  assert.equal(await fs.readFile(path.join(root, 'opencode-env.txt'), 'utf8'), [path.join(root, 'local-secrets/opencode/data'), path.join(root, 'local-secrets/opencode/config'), path.join(root, 'local-secrets/codex'), 'unset', ''].join('\n'));
  assert.equal(await fs.access(path.join(root, 'UNEXPECTED_LAUNCH')).then(() => true, () => false), false);
});
test('cancelled OpenCode configuration stops the owned auth child and does not claim success', async t => {
  const root = await fixture(t);
  const binary = path.join(root, 'backend/agent-runtime/node_modules/.bin/opencode');
  await fs.writeFile(binary, '#!/bin/sh\ntrap "printf stopped > auth-stopped.txt; exit 0" TERM INT HUP\nprintf running > auth-running.txt\nwhile true; do sleep 0.05; done\n');
  await fs.chmod(binary, 0o755);
  const child = spawn(process.execPath, [path.join(root, 'scripts/macos/cli.mjs'), 'opencode'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
  const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  const deadline = Date.now() + 2000;
  while (!await fs.access(path.join(root, 'auth-running.txt')).then(() => true, () => false) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(await fs.readFile(path.join(root, 'auth-running.txt'), 'utf8'), 'running');
  child.kill('SIGTERM');
  assert.equal(await exited, 1);
  assert.equal(await fs.readFile(path.join(root, 'auth-stopped.txt'), 'utf8'), 'stopped');
  assert.match(output, /cancelled/);
  assert.doesNotMatch(output, /provider saved/);
});
test('dependency changes invalidate the success marker before launching', async t => {
  const root = await fixture(t, { auth: 'present' }); await fs.writeFile(path.join(root, 'front/package-lock.json'), '{"changed":true}');
  const result = await runCli(root, ['start', '--no-open']);
  assert.equal(result.code, 1); assert.match(result.output, /lockfiles have changed/);
  assert.equal(await fs.access(path.join(root, 'UNEXPECTED_LAUNCH')).then(() => true, () => false), false);
});
test('a failed launcher cannot claim another live project is ready', async t => {
  const root = await fixture(t, { auth: 'present', badDev: true });
  const result = await runCli(root, ['start', '--no-open']);
  assert.equal(result.code, 1); assert.match(result.output, /Port occupied/); assert.doesNotMatch(result.output, /Connected to Codex App Server/);
});
test('failed staging preserves a complete old installation and repairs stripped script permissions', async t => {
  const root = await fixture(t, { auth: 'present' });
  const marker = path.join(root, '.runtime/macos-install.json'), wrapper = path.join(root, 'scripts/macos/codex.sh');
  const before = await fs.readFile(marker, 'utf8'); await fs.chmod(wrapper, 0o644);
  const bin = path.join(root, 'fake-bin'); await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'npm'), '#!/bin/sh\necho "Synthetic network failure" >&2\nexit 42\n', { mode: 0o755 });
  const result = await runCli(root, ['install', '--repair'], { PATH: bin + path.delimiter + process.env.PATH });
  assert.equal(result.code, 1); assert.match(result.output, /exit code 42/);
  assert.equal(await fs.readFile(marker, 'utf8'), before);
  assert.equal((await fs.stat(wrapper)).mode & 0o777, 0o755);
  assert.equal(await fs.access(path.join(root, '.runtime/macos-install.lock')).then(() => true, () => false), false);
  assert.equal((await fs.readdir(path.join(root, '.runtime'))).some(x => x.startsWith('codex-install-')), false);
});

test('failed managed startup keeps the recovery gateway alive until the user stops the Mac launcher', async t => {
  const root = await fixture(t, { auth: 'saved' });
  const net = await import('node:net'); const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const file = path.join(root, 'config/runtime.json'), config = JSON.parse(await fs.readFile(file, 'utf8')); config.frontPort = port; await fs.writeFile(file, JSON.stringify(config));
  await fs.writeFile(path.join(root, 'scripts/dev.mjs'), `import http from 'node:http';const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({phase:'failed',busy:false,error:{code:'FIXTURE_NOT_READY'}}))});server.listen(${port},'127.0.0.1',()=>console.log('Saplingagent: http://127.0.0.1:${port}/'));process.on('SIGTERM',()=>{server.close(()=>process.exit(0));server.closeAllConnections()});`);
  const child = spawn(process.execPath,[path.join(root,'scripts/macos/cli.mjs'),'start','--no-open'],{cwd:root,env:{...process.env,SEED_ROOT:root},stdio:['ignore','pipe','pipe']});
  let output = ''; child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM')});
  const exited = new Promise(resolve=>child.once('exit',code=>resolve(code)));
  const end=Date.now()+5000;while(!output.includes('Keep this window open')&&child.exitCode===null&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,30));
  assert.match(output,/Keep this window open/);assert.equal(child.exitCode,null);assert.equal((await fetch(`http://127.0.0.1:${port}/api/runtime/status`)).status,200);
  child.kill('SIGTERM');assert.equal(await exited,0);
});
