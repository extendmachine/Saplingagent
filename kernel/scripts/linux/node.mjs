// The Bash entry holds a per-project flock until this process completes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runtimeMode, containsPath } from '../../tooling/bindings.mjs';
import { nodeRuntimeName } from '../../tooling/device.mjs';
import { ensureManagedDirectory } from '../../contracts/local-storage.mjs';

const [root, version] = process.argv.slice(2);
const name = nodeRuntimeName(version);
const runtime = await ensureManagedDirectory(root, '.runtime');
const alias = path.join(runtime, name);
const mode = runtimeMode(root);
const binary = await fs.realpath(process.execPath);
const source = path.dirname(path.dirname(binary));
const npmDirectory = 'lib/node_modules/npm';
const npmEntry = path.join(npmDirectory, 'bin/npm-cli.js');

try {
  if (!process.report.getReport().header.glibcVersionRuntime) throw Error('glibc');
  await fs.access(path.join(source, npmEntry));
} catch {
  console.error(process.env.SAPLING_LANG === 'zh'
    ? `请使用 GNU/Linux glibc 和官方 Node.js ${version} 发行包（含 npm）。`
    : `Use GNU/Linux with glibc and the official Node.js ${version} distribution including npm.`);
  process.exit(1);
}

let target = source;
if (mode === 'portable') {
  const store = await ensureManagedDirectory(root, '.runtime/tool-store/runtimes');
  target = path.join(store, name);
  const existing = await fs.lstat(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) throw Error('Invalid portable Node directory');
    const node = path.join(target, 'bin/node');
    // Verify that the saved executable and npm still reside in this project.
    for (const item of ['bin/node', npmEntry]) {
      if (!containsPath(target, await fs.realpath(path.join(target, item)))) throw Error('Invalid portable Node installation');
    }
    const identity = execFileSync(node, ['-p', 'process.version + "/" + process.platform + "/" + process.arch'], {encoding:'utf8',timeout:5000}).trim();
    if (identity !== `v${version}/linux/${process.arch}`) throw Error('The portable Node runtime needs repair.');
  } else {
    const stage = await fs.mkdtemp(path.join(store, '.linux-node-'));
    try {
      await fs.mkdir(path.join(stage, 'bin'));
      await fs.copyFile(binary, path.join(stage, 'bin/node'));
      await fs.chmod(path.join(stage, 'bin/node'), 0o755);
      await fs.cp(path.join(source, npmDirectory), path.join(stage, npmDirectory), { recursive: true, verbatimSymlinks: true });
      for (const cmd of ['npm', 'npx']) await fs.symlink(`../${npmDirectory}/bin/${cmd}-cli.js`, path.join(stage, 'bin', cmd));
      await fs.rename(stage, target);
    } finally { await fs.rm(stage, { recursive: true, force: true }); }
  }
} else if (containsPath(path.join(runtime, 'tool-store'), binary)) {
  throw Error(`Place the official shared Node.js ${version} with npm on PATH before switching to shared mode.`);
}

const current = await fs.realpath(alias).catch(error => { if (error.code !== 'ENOENT') throw error; });
if (current !== target) {
  const stage = await fs.mkdtemp(path.join(runtime, '.linux-bind-'));
  try {
    const link = path.join(stage, 'node');
    await fs.symlink(containsPath(runtime, target) ? path.relative(runtime, target) : target, link);
    await fs.rename(link, alias);
  } finally { await fs.rm(stage, { recursive: true, force: true }); }
}
if ((await fs.readFile(path.join(runtime, 'runtime-mode'), 'utf8').catch(() => '')).trim() !== mode) {
  await fs.writeFile(path.join(runtime, 'runtime-mode'), mode + '\n');
}
