import { parseReleaseMetadata } from '../contracts/release.mjs';
import { validateKernelManifest, isKernelPath } from '../contracts/kernel.mjs';
import { initialProjectRecords, recipientAgentInstructions } from './launcher/recipient-records.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
export function distributable(file) {
  if (!file || file.startsWith('/') || file.split('/').some(part => part === '..')) return false;
  if (/(^|\/)(?:\.git|\.worktrees|\.cache|\.runtime|local-secrets|logs|data|snapshots|node_modules|\.venv|\.test-data|dist|build)(\/|$)/.test(file)) return false;
  if (['config/project.json','config/project-icon.png'].includes(file)) return false;
  if (/(^|\/)ai-tasks\/runtime(\/|$)/.test(file)) return false;
  if (/(^|\/)(?:selfdata\.json|\.DS_Store|\.env(?:\..*)?|auth\.json|service-token)$/.test(file)) return false;
  if (/\.(?:key|pem|p12|pfx|log)$/i.test(file)) return false;
  return /^(?:assets\/|kernel\/|front\/|backend\/|contracts\/|config\/|scripts\/|docs\/|rules\/|services\/|\.agents\/(?:skills\/|\.claude-plugin\/plugin\.json$))/.test(file)
    || /^(?:LICENSE|NOTICE|THIRD_PARTY_NOTICES.md|CHANGELOG.md|AGENTS\.md|CLAUDE\.md|README\.md|README\.zh-CN\.md|FINAL_GOAL\.md|TODO\.md|AI_TASKS\.md|\.gitignore|\.gitattributes|Saplingagent\.sh|install\.sh)$/.test(file);
}


export async function packageSource({ ref = 'release', outputDir = path.join(root, '.cache/releases'), sourceRoot = root, platform = 'macOS' } = {}) {
  if (!['macOS', 'Windows'].includes(platform)) throw new Error('Unsupported package target');
  if (!['darwin', 'win32'].includes(process.platform)) throw new Error('Source ZIP packaging requires macOS or Windows.');
  const git = args => execFileSync('git', args, { cwd: sourceRoot, maxBuffer: 64 * 1024 * 1024 });
  const commit = git(['rev-parse', '--verify', `${ref}^{commit}`]).toString().trim();
  const release = parseReleaseMetadata(JSON.parse(git(['show', `${commit}:config/release.json`])));
  const symbolic = git(['rev-parse', '--symbolic-full-name', ref]).toString().trim();
  const initialBranch = symbolic.startsWith('refs/heads/') ? symbolic.slice(11) : symbolic.startsWith('refs/remotes/') ? symbolic.split('/').slice(3).join('/') : 'release';
  const entries = git(['ls-tree', '-r', '-z', commit]).toString().split('\0').filter(Boolean).map(line => {
    const match = line.match(/^(\d+) blob ([a-f0-9]+)\t(.+)$/s);
    if (!match) throw new Error('The commit contains an unsupported file type.');
    return { mode: match[1], blob: match[2], path: match[3] };
  });
  const files = entries.filter(entry => distributable(entry.path));
  if (files.some(entry => entry.mode === '120000')) throw new Error('Distribution source contains symlinks. Review and replace them with explicit tracked files first.');
  const required = ['config/release.json', 'contracts/release.mjs', 'kernel/manifest.json','kernel/manager.mjs','kernel/recover.mjs','contracts/kernel.mjs','.agents/.claude-plugin/plugin.json', 'backend/agent-runtime/providers/claude.mjs', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'Saplingagent.sh', 'scripts/macos/bootstrap.sh', 'scripts/macos/codex.sh', 'scripts/macos/cli.mjs', 'scripts/launcher/cli.mjs', 'scripts/launcher/git-storage.mjs', 'contracts/local-process.mjs', 'contracts/ai-configuration.mjs', 'contracts/codex-rpc.mjs', 'backend/ai-config/server.mjs', 'backend/ai-config/store.mjs', 'backend/ai-config/auth.mjs', 'front/ai-config/main.tsx', 'front/ai-config/index.html', 'front/ai-config/styles.css', 'front/ai-config/vite.config.mjs', 'docs/ai-configuration.html', 'docs/macos-install.html', 'docs/macos-install.zh.html', 'rules/README.md', 'rules/18-saplingagent-folder-boundary.md', 'config/macos.json', 'front/package-lock.json', 'backend/mcp-runtime/package-lock.json', 'backend/agent-runtime/package-lock.json'];
  const [major,minor,patch]=release.version.split('.').map(Number);
  if(major>0||minor>9||minor===9&&patch>=3)required.push('kernel/launcher/public.mjs','kernel/launcher/entry.mjs','kernel/launcher/manager.mjs','kernel/launcher/build.mjs','kernel/launcher/io.mjs','kernel/launcher/toolchain.json','kernel/launcher/native/main.go','kernel/launcher/native/spawn_darwin.go','kernel/launcher/native/spawn_windows.go','kernel/launcher/windows-icon.ps1','front/ai-config/ProjectSetup.tsx','docs/project-launcher.html');
  if (platform === 'Windows') required.push('scripts/windows/bootstrap.sh', 'config/windows.json', 'docs/windows-install.html', 'docs/windows-install.zh.html');
  for (const file of required) if (!files.some(entry => entry.path === file)) throw new Error(`Delivery version is missing ${file}`);
  const ruleFiles = entries.filter(entry => entry.path.startsWith('rules/'));
  if (ruleFiles.some(entry => !files.some(file => file.path === entry.path))) throw new Error('Incomplete rules; distribution refused.');
  await fs.mkdir(outputDir, { recursive: true });
  const staging = path.join(sourceRoot, '.cache', 'source-package', randomUUID());
  const packageName = `Saplingagent-${platform}-${release.version}-${commit.slice(0, 8)}`;
  const directory = path.join(staging, packageName);
  const zip = path.join(path.resolve(outputDir), packageName + '.zip');
  const tempZip = zip + `.${randomUUID()}.tmp.zip`;
  await fs.mkdir(directory, { recursive: true });
  try {
    for (const file of files) {
      const content = git(['show', `${commit}:${file.path}`]);
      const blob = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
      if (blob !== file.blob) throw new Error(`Source file does not match the commit:${file.path}`);
      const destination = path.join(directory, file.path);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, content, { mode: file.mode === '100755' ? 0o755 : 0o644 });
    }
    const kernel = validateKernelManifest(JSON.parse(await fs.readFile(path.join(directory,'kernel/manifest.json'),'utf8')));
    const owned = files.filter(file => isKernelPath(file.path) && file.path !== 'kernel/manifest.json');
    if (owned.length !== kernel.files.length) throw new Error('Kernel manifest membership is stale; regenerate and review before packaging.');
    for (const declared of kernel.files) {
      const entry = owned.find(file => file.path === declared.path);
      if (!entry) throw new Error('Kernel package is missing an owned source file: ' + declared.path);
      const content = await fs.readFile(path.join(directory, declared.path));
      if (content.length !== declared.bytes || createHash('sha256').update(content).digest('hex') !== declared.sha256 || (entry.mode === '100755') !== declared.executable) throw new Error('Kernel manifest does not match packaged source: ' + declared.path);
    }
    const records = initialProjectRecords(commit, platform);
    for (const [file, content] of Object.entries(records)) await fs.writeFile(path.join(directory, file), content);
    const agentsFile = path.join(directory, 'AGENTS.md');
    let agents = await fs.readFile(agentsFile, 'utf8');
    agents = recipientAgentInstructions(agents, commit, platform);
    await fs.writeFile(agentsFile, agents);
    const generated = [...Object.keys(records), 'AGENTS.md'];
    const manifestFiles = [];
    for (const file of files) {
      const content = await fs.readFile(path.join(directory, file.path));
      manifestFiles.push({ path: file.path, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex'), ...(generated.includes(file.path) ? { initializedForRecipient: true } : {}) });
    }
    const settings = JSON.parse(await fs.readFile(path.join(directory, `config/${platform === 'Windows' ? 'windows' : 'macos'}.json`), 'utf8'));
    await fs.writeFile(path.join(directory, 'delivery.json'), JSON.stringify({ schemaVersion: 2, releaseVersion: release.version, sourceCommit: commit, sourceRef: ref, distribution: { source: 'release-archive', gitIncluded: false }, platform: platform === 'Windows' ? 'Windows 10/11 x64 and ARM64' : 'macOS 13.5+', architectures: platform === 'Windows' ? ['x64', 'arm64'] : ['arm64', 'x64'], runtimes: settings, files: manifestFiles }, null, 2) + '\n');
    if (process.platform === 'win32') {
      const powershell = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
      execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference=\"Stop\"; Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:SAPLING_PACKAGE_FOLDER,$env:SAPLING_PACKAGE_ZIP,[IO.Compression.CompressionLevel]::Optimal,$true)'], { windowsHide: true, env: { ...process.env, SAPLING_PACKAGE_FOLDER: directory, SAPLING_PACKAGE_ZIP: tempZip } });
    } else execFileSync('/usr/bin/zip', ['-q', '-r', tempZip, packageName], { cwd: staging });
    await fs.rename(tempZip, zip);
    const digest = createHash('sha256').update(await fs.readFile(zip)).digest('hex');
    await fs.writeFile(zip + '.sha256', `${digest}  ${path.basename(zip)}\n`);
    return { version: release.version, commit, zip, sha256: digest, files: files.length, rules: ruleFiles.length };
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
    await fs.rm(tempZip, { force: true });
  }
}

export const packageMac = options => packageSource({ ...options, platform: 'macOS' });

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [ref = 'release', outputDir] = process.argv.slice(2);
    console.log(JSON.stringify(await packageMac({ ref, ...(outputDir ? { outputDir: path.resolve(outputDir) } : {}) }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
