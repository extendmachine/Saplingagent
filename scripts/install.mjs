import { spawn } from 'node:child_process';
import path from 'node:path';
import { root } from './setup.mjs';
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 11)) throw new Error('SeedAgent requires Node.js 24.11 or newer');
for (const service of ['front', 'backend/app-builder', 'backend/mcp-runtime']) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--ignore-scripts'], { cwd: path.join(root, service), stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Install failed: ${service}`)));
  });
}
console.log('Project-local dependencies installed. Run: node scripts/dev.mjs');
