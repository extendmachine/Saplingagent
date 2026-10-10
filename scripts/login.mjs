import { spawn } from 'node:child_process';
import path from 'node:path';
import { root, setup } from './setup.mjs';
await setup();
const child = spawn(process.env.SEED_CODEX_BIN || 'codex', ['login'], { cwd: root, env: { ...process.env, CODEX_HOME: path.join(root, 'local-secrets/codex') }, stdio: 'inherit' });
child.once('error', () => { console.error('Install the official Codex CLI before signing in.'); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code || 0; });
