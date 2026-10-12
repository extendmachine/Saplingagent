import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
export function distributable(file) {
  if (!file || file.startsWith('/') || file.split('/').some(part => part === '..')) return false;
  if (/(^|\/)(?:\.git|\.worktrees|\.cache|\.runtime|local-secrets|logs|data|snapshots|node_modules|\.venv|\.test-data|dist|build)(\/|$)/.test(file)) return false;
  if (/(^|\/)ai-tasks\/runtime(\/|$)/.test(file)) return false;
  if (/(^|\/)(?:selfdata\.json|\.DS_Store|\.env(?:\..*)?|auth\.json|service-token)$/.test(file)) return false;
  if (/\.(?:key|pem|p12|pfx|log)$/i.test(file)) return false;
  return /^(?:front\/|backend\/|contracts\/|config\/|scripts\/|docs\/|rules\/|services\/|\.agents\/(?:skills\/|\.claude-plugin\/plugin\.json$))/.test(file)
    || /^(?:LICENSE|NOTICE|THIRD_PARTY_NOTICES.md|CHANGELOG.md|AGENTS\.md|CLAUDE\.md|README\.md|FINAL_GOAL\.md|TODO\.md|AI_TASKS\.md|\.gitignore|\.gitattributes|Saplingagent\.sh)$/.test(file);
}

function initialProjectRecords(commit, platform) {
  const windows = platform === 'Windows';
  const guide = windows ? 'windows-install.html' : 'macos-install.html';
  const launch = 'bash Saplingagent.sh';
  return {
    'FINAL_GOAL.md': `# Saplingagent final goal\n\nSaplingagent is a minimal software seed package that users can modify themselves. Start with one web page and a chat interface. Build and adapt a local application through conversation. Frontend: front/; backend: backend/; documentation: docs/. Source, rules, sessions and runtime belong to this application folder.\n\n## Folder boundary and conversation receipts\n\nAll project-owned application code, rules, MCP, Skills, configuration, documentation and launcher helpers belong to this complete folder. Maintainer development does not modify external code or depend on sibling checkouts. Dependencies install locally; declared model services and OS tools remain external requirements. Rules recommend customer edits stay in this folder by default; explicit customer requests may target external code using unchanged Full Access, without path protection or permission gates. Every final assistant reply, including read-only conversation, must include the eight-field completion-review receipt from rules/README.md with actual results. Read-only replies remain unregistered.\n\n## Implemented\n\nProject-local installation through Bash (Windows requires Git Bash) on ${windows ? 'Windows 10/11 x64 and ARM64' : 'macOS 13.5+'}, your own ChatGPT account or custom Codex/OpenCode API scheme through an independent configuration page, official App Server integration, 15 MCP tools, 3 project Skills, streaming chat and local sessions. Full Access uses the current OS user's permissions, without directory protection, per-operation confirmation or automatic root elevation. Restore only on explicit user request.\n\n## Limits\n\nThis package is for local use under the noncommercial LICENSE. Commercial use requires separate authorization from the project owner, and commercial/hosted OpenAI authentication requires an eligible separate integration. Cloud synchronization, signed native apps, self-extracting seeds, Linux delivery and proven long-term layout adaptation are not implemented. Actual model access, quota and network availability depend on your account and requests. ${windows ? 'Native Windows10 installation/login/model/restart acceptance remains pending; Mac checks are not native Windows validation.' : ''}\n\n## Source\n\nCommit: ${commit}. Manifest: delivery.json. Installation: docs/${guide}. This is a new application folder; the developer's task and approval records do not authorize changes here. Follow this application's user's requests.\n`,
    'TODO.md': `# Saplingagent progress\n\n## Initial state\n\nSource commit: ${commit}. Installation, login and startup have not yet been performed in this folder. Run ${launch}, choose English or Chinese, then Install / update, Configure AI, then Start app. Diagnostics is available from the same menu. See docs/${guide}.\n\n## Next steps\n\n- Install and configure your own account or API scheme in the local setup page.\n- Send a message and check the actual model response.\n- Add features through conversation and record implementation, self-checks and human validation for this application.\n\nThe extracted folder has no Git repository or approved main commit. Initialize version control only under the current user's authorization; do not inherit the developer's task, test or merge approvals.\n`,
    'AI_TASKS.md': `# AI task coordination\n\n## Coordination\n\n- Authoritative index: root AI_TASKS.md; progress: TODO.md.\n- No task is claimed and no AI is currently executing.\n- Source commit: ${commit}.\n- Git is not initialized. Future parallel development follows rules/14 to locate coordination and separate worktrees.\n\n## Current tasks\n\nNone. agent-runtime records actual runtime modifications locally. Read-only chat creates no modification task. Registration failure is not a file permission gate. Developer tasks and approvals were not copied into this folder.\n`,
  };
}

export async function packageSource({ ref = 'HEAD', outputDir = path.join(root, '.cache/releases'), sourceRoot = root, platform = 'macOS' } = {}) {
  if (!['macOS', 'Windows'].includes(platform)) throw new Error('Unsupported package target');
  if (!['darwin', 'win32'].includes(process.platform)) throw new Error('Source ZIP packaging requires macOS or Windows.');
  const git = args => execFileSync('git', args, { cwd: sourceRoot, maxBuffer: 64 * 1024 * 1024 });
  const commit = git(['rev-parse', '--verify', `${ref}^{commit}`]).toString().trim();
  const entries = git(['ls-tree', '-r', '-z', commit]).toString().split('\0').filter(Boolean).map(line => {
    const match = line.match(/^(\d+) blob ([a-f0-9]+)\t(.+)$/s);
    if (!match) throw new Error('The commit contains an unsupported file type.');
    return { mode: match[1], blob: match[2], path: match[3] };
  });
  const files = entries.filter(entry => distributable(entry.path));
  if (files.some(entry => entry.mode === '120000')) throw new Error('Distribution source contains symlinks. Review and replace them with explicit tracked files first.');
  const required = ['.agents/.claude-plugin/plugin.json', 'backend/agent-runtime/providers/claude.mjs', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'Saplingagent.sh', 'scripts/macos/bootstrap.sh', 'scripts/macos/codex.sh', 'scripts/macos/cli.mjs', 'scripts/launcher/cli.mjs', 'contracts/local-process.mjs', 'contracts/ai-configuration.mjs', 'contracts/codex-rpc.mjs', 'backend/ai-config/server.mjs', 'backend/ai-config/store.mjs', 'backend/ai-config/auth.mjs', 'front/ai-config/main.tsx', 'front/ai-config/index.html', 'front/ai-config/styles.css', 'front/ai-config/vite.config.mjs', 'docs/ai-configuration.html', 'docs/macos-install.html', 'docs/macos-install.zh.html', 'rules/README.md', 'rules/18-saplingagent-folder-boundary.md', 'config/macos.json', 'front/package-lock.json', 'backend/mcp-runtime/package-lock.json', 'backend/agent-runtime/package-lock.json'];
  if (platform === 'Windows') required.push('scripts/windows/bootstrap.sh', 'config/windows.json', 'docs/windows-install.html', 'docs/windows-install.zh.html');
  for (const file of required) if (!files.some(entry => entry.path === file)) throw new Error(`Delivery version is missing ${file}`);
  const ruleFiles = entries.filter(entry => entry.path.startsWith('rules/'));
  if (ruleFiles.some(entry => !files.some(file => file.path === entry.path))) throw new Error('Incomplete rules; distribution refused.');
  await fs.mkdir(outputDir, { recursive: true });
  const staging = path.join(sourceRoot, '.cache', 'source-package', randomUUID());
  const packageName = `Saplingagent-${platform}-${commit.slice(0, 8)}`;
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
    const records = initialProjectRecords(commit, platform);
    for (const [file, content] of Object.entries(records)) await fs.writeFile(path.join(directory, file), content);
    const agentsFile = path.join(directory, 'AGENTS.md');
    let agents = await fs.readFile(agentsFile, 'utf8');
    agents = agents.replace(/^.*TASK014.*\n/gm, '');
    agents += `\n- This ${platform} source package comes from commit ${commit}. Task records are initialized for this application. See docs/${platform === 'Windows' ? 'windows-install.html' : 'macos-install.html'}; developer approvals do not transfer.\n`;
    await fs.writeFile(agentsFile, agents);
    const generated = [...Object.keys(records), 'AGENTS.md'];
    const manifestFiles = [];
    for (const file of files) {
      const content = await fs.readFile(path.join(directory, file.path));
      manifestFiles.push({ path: file.path, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex'), ...(generated.includes(file.path) ? { initializedForRecipient: true } : {}) });
    }
    const settings = JSON.parse(await fs.readFile(path.join(directory, `config/${platform === 'Windows' ? 'windows' : 'macos'}.json`), 'utf8'));
    await fs.writeFile(path.join(directory, 'delivery.json'), JSON.stringify({ schemaVersion: 1, sourceCommit: commit, platform: platform === 'Windows' ? 'Windows 10/11 x64 and ARM64' : 'macOS 13.5+', architectures: platform === 'Windows' ? ['x64', 'arm64'] : ['arm64', 'x64'], runtimes: settings, files: manifestFiles }, null, 2) + '\n');
    if (process.platform === 'win32') {
      const powershell = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
      execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference=\"Stop\"; Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:SAPLING_PACKAGE_FOLDER,$env:SAPLING_PACKAGE_ZIP,[IO.Compression.CompressionLevel]::Optimal,$true)'], { windowsHide: true, env: { ...process.env, SAPLING_PACKAGE_FOLDER: directory, SAPLING_PACKAGE_ZIP: tempZip } });
    } else execFileSync('/usr/bin/zip', ['-q', '-r', tempZip, packageName], { cwd: staging });
    await fs.rename(tempZip, zip);
    const digest = createHash('sha256').update(await fs.readFile(zip)).digest('hex');
    await fs.writeFile(zip + '.sha256', `${digest}  ${path.basename(zip)}\n`);
    return { commit, zip, sha256: digest, files: files.length, rules: ruleFiles.length };
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
    await fs.rm(tempZip, { force: true });
  }
}

export const packageMac = options => packageSource({ ...options, platform: 'macOS' });

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [ref = 'HEAD', outputDir] = process.argv.slice(2);
    console.log(JSON.stringify(await packageMac({ ref, ...(outputDir ? { outputDir: path.resolve(outputDir) } : {}) }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
