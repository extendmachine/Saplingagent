import {prepareManagedEnvironment} from '../contracts/local-storage.mjs';
import {acquireKernelLock,assertKernelOffline} from '../contracts/kernel.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { codexBinary } from '../contracts/local-process.mjs';
import { root, setup } from './setup.mjs';
const environment=await prepareManagedEnvironment(root);
const release=await acquireKernelLock(root,'account-login');
try {
await assertKernelOffline(root);
await setup();
const child = spawn(process.env.SEED_CODEX_BIN || (process.platform === 'win32' ? codexBinary(root) : 'codex'), ['-c','cli_auth_credentials_store="file"','login'], { cwd: root, env: { ...environment, CODEX_HOME: path.join(root, 'local-secrets/codex') }, stdio: 'inherit' });
await new Promise(resolve=>{
child.once('error', () => { console.error('Install the official Codex CLI before signing in.'); process.exitCode = 1; resolve(); });
child.once('exit', code => { process.exitCode = code || 0; resolve(); });
});
} finally {await release();}
