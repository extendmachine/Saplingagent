import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const testPython = process.env.SAPLING_TEST_PYTHON;
const skipPty = process.platform !== 'darwin' || !testPython;
// A macOS Python test driver supplies a real controlling PTY; these checks do not claim
// native Windows acceptance. Force job control to expose background bridges.
async function fixture(t, source) {
  const parent = path.join(project, '.cache/windows-terminal');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, "中文 app's "));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const menu = source ?? await fs.readFile(path.join(project, 'Saplingagent.sh'), 'utf8');
  await fs.writeFile(path.join(root, 'Saplingagent.sh'), menu.replace('set -uo pipefail', 'set -uo pipefail\nset -m'));
  await fs.mkdir(path.join(root, 'scripts/windows'), { recursive: true });
  const bin = path.join(root, 'bin'); await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'uname'), '#!/bin/bash\necho MINGW64_NT-10.0-19045\n', { mode: 0o755 });
  return { root, env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` } };
}
function terminal(f, expected, choices = '1\n') {
  const driver = String.raw`
import os,pty,select,signal,time,sys
pid,fd=pty.fork()
if pid == 0:
    os.execv('/bin/bash',['/bin/bash',sys.argv[1],'--lang','zh'])
output=b'';started=False;finished=False;status=None
try:
    deadline=time.monotonic()+5
    while time.monotonic()<deadline:
        if select.select([fd],[],[],.05)[0]:
            try: chunk=os.read(fd,65536)
            except OSError: chunk=b''
            output+=chunk
            text=output.decode(errors='replace')
            if not started and '[0-6, 9]' in text:
                started=True;os.write(fd,sys.argv[3].encode())
            if not finished and sys.argv[2] in text:
                finished=True;os.write(fd,b'0\n')
        ended,value=os.waitpid(pid,os.WNOHANG)
        if ended: status=value;break
finally:
    if status is None:
        try: os.kill(pid,signal.SIGKILL)
        except OSError: pass
        os.waitpid(pid,0)
    os.close(fd)
sys.stdout.buffer.write(output)
sys.exit(os.waitstatus_to_exitcode(status) if status is not None else 99)
`;
  return new Promise((resolve, reject) => {
    const child = spawn(testPython, ['-c', driver, path.join(f.root, 'Saplingagent.sh'), expected, choices], { env: f.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
    child.on('error', reject); child.on('close', code => resolve({ code, output }));
  });
}
const foregroundProbe = `#!/bin/bash
read -r group foreground < <(ps -o pgid= -o tpgid= -p "$$")
if [ "$group" != "$foreground" ]; then exit 150; fi
stty -echo
stty echo
printf 'FOREGROUND_OK\\n'
`;
test('Windows menu owns the terminal before native install, even with Bash job control', { skip: skipPty }, async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, 'kernel/scripts/windows/bootstrap.sh'), foregroundProbe);
  const result = await terminal(f, 'FOREGROUND_OK');
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /FOREGROUND_OK/); assert.doesNotMatch(result.output, /退出码 150/);
});
test('background console regression yields 150 before native startup', { skip: skipPty }, async t => {
  const source = await fs.readFile(path.join(project, 'Saplingagent.sh'), 'utf8');
  // Recreate the old background dispatch with the same terminal ownership probe.
  const old = source.replace('/bin/bash "$SAPLING_BOOTSTRAP" "$@" <&0\n    result=$?', '/bin/bash "$SAPLING_BOOTSTRAP" "$@" <&0 &\n    wait $!\n    result=$?');
  const f = await fixture(t, old);
  await fs.writeFile(path.join(f.root, 'kernel/scripts/windows/bootstrap.sh'), foregroundProbe);
  const result = await terminal(f, '退出码 150');
  assert.equal(result.code, 0, result.output); assert.match(result.output, /退出码 150/); assert.doesNotMatch(result.output, /FOREGROUND_OK/);
});
test('Windows native interactive configuration still reads user input in the foreground', { skip: skipPty }, async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, 'kernel/scripts/windows/bootstrap.sh'), foregroundProbe + `printf 'PROVIDER_PROMPT\\n'\nIFS= read -r reply\n[ "$reply" = 'provider-choice' ] || exit 9\nprintf 'AUTH_INPUT_OK\\n'\n`);
  const result = await terminal(f, 'AUTH_INPUT_OK', '2\nprovider-choice\n');
  assert.equal(result.code, 0, result.output); assert.match(result.output, /AUTH_INPUT_OK/); assert.doesNotMatch(result.output, /操作未完成/);
});
async function bootstrapFixture(t) {
  const f = await fixture(t);
  await fs.copyFile(path.join(project, 'kernel/scripts/windows/bootstrap.sh'), path.join(f.root, 'kernel/scripts/windows/bootstrap.sh'));
  await fs.copyFile(path.join(project, 'kernel/scripts/windows/bootstrap.ps1'), path.join(f.root, 'kernel/scripts/windows/bootstrap.ps1'));
  await fs.writeFile(path.join(f.root, 'bin/cygpath'), "#!/bin/bash\nprintf '%s' \"C:\\test\\中文 app's folder\"\n", { mode: 0o755 });
  await fs.writeFile(path.join(f.root, 'bin/winpty'), '#!/bin/bash\nprintf "BRIDGE_CALLED\\n"\nexec "$@"\n', { mode: 0o755 });
  await fs.writeFile(path.join(f.root, 'bin/powershell.exe'), foregroundProbe + `if [ "$SAPLING_BOOTSTRAP_ACTION" = 'start' ]; then
printf 'PROVIDER_PROMPT\\n'
IFS= read -r reply
[ "$reply" = 'provider-choice' ] || exit 9
printf 'AUTH_INPUT_OK\\n'
else
printf 'DIRECT_NATIVE_OK\\n'
fi
`, { mode: 0o755 });
  return f;
}
test('TTY diagnostics and web configuration bypass winpty even when it is installed', { skip: skipPty }, async t => {
  for (const choice of ['4\n','2\n']) {
    const f = await bootstrapFixture(t);
    const result = await terminal(f, 'DIRECT_NATIVE_OK', choice);
    assert.equal(result.code, 0, result.output); assert.match(result.output, /DIRECT_NATIVE_OK/);
    assert.match(result.output, /正在启动 Windows/); assert.doesNotMatch(result.output, /BRIDGE_CALLED|操作未完成/);
  }
});
test('TTY legacy native startup uses winpty in the foreground and retains provider input', { skip: skipPty }, async t => {
  const f = await bootstrapFixture(t);
  const result = await terminal(f, 'AUTH_INPUT_OK', '3\nprovider-choice\n');
  assert.equal(result.code, 0, result.output); assert.match(result.output, /BRIDGE_CALLED/);
  assert.match(result.output, /AUTH_INPUT_OK/); assert.doesNotMatch(result.output, /操作未完成/);
});


test('TTY install and Git setup use a foreground bridge for first-install prompts', { skip: skipPty }, async t => {
  for (const choice of ['1\n', '5\n']) {
    const f = await bootstrapFixture(t);
    const result = await terminal(f, 'DIRECT_NATIVE_OK', choice);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /BRIDGE_CALLED/);
    assert.doesNotMatch(result.output, /操作未完成/);
  }
});
