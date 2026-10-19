import {prepareManagedEnvironment} from '../contracts/local-storage.mjs';
import {acquireKernelLock,assertKernelOffline} from '../contracts/kernel.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { npmCommand, openCodeBinary } from '../contracts/local-process.mjs';
import { root } from './setup.mjs';
const npm = npmCommand();
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 11)) throw new Error('Saplingagent requires Node.js 24.11 or newer');
const env=await prepareManagedEnvironment(root);
const release=await acquireKernelLock(root,'legacy-install');
try {
await assertKernelOffline(root);
for (const service of ['front', 'backend/app-builder', 'backend/mcp-runtime', 'backend/agent-runtime']) {
  await new Promise((resolve, reject) => {
    // OpenCode's pinned package selects its locked platform binary in postinstall.
    const args = service === 'backend/agent-runtime' ? ['ci'] : ['ci', '--ignore-scripts'];
    const child = spawn(npm.command, [...npm.args, ...args], { cwd: path.join(root, service), stdio: 'inherit', env });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Install failed: ${service}`)));
  });
}
await new Promise((resolve, reject) => {
  const command = openCodeBinary(root);
  const child = spawn(command, ['--version'], { cwd: root, stdio: 'inherit', env });
  child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('OpenCode runtime verification failed')));
});
console.log('Project-local dependencies installed. Run: node scripts/dev.mjs');

} finally {await release();}
