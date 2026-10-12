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
  return /^(?:front\/|backend\/|contracts\/|config\/|scripts\/|docs\/|rules\/|services\/|\.agents\/skills\/)/.test(file)
    || /^(?:LICENSE|NOTICE|THIRD_PARTY_NOTICES.md|CHANGELOG.md|AGENTS\.md|CLAUDE\.md|README\.md|FINAL_GOAL\.md|TODO\.md|AI_TASKS\.md|\.gitignore|Saplingagent\.sh)$/.test(file);
}

function initialProjectRecords(commit) {
  return {
    'FINAL_GOAL.md': `# Saplingagent final goal\n\nStart with one web page and a chat interface. Build and adapt a local application through conversation. Frontend: front/; backend: backend/; documentation: docs/. Source, rules, sessions and runtime belong to this application folder.\n\n## Implemented\n\nProject-local installation on macOS 13.5+, your own Codex login, official App Server integration, 15 MCP tools, 3 project Skills, streaming chat and local sessions. Full Access uses the current OS user's permissions, without directory protection, per-operation confirmation or automatic root elevation. Restore only on explicit user request.\n\n## Limits\n\nThis package is for local use under the noncommercial LICENSE. Commercial use requires separate authorization from the project owner, and commercial/hosted OpenAI authentication requires an eligible separate integration. Cloud synchronization, signed native apps, self-extracting seeds, Windows/Linux delivery and proven long-term layout adaptation are not implemented. Actual model access, quota and network availability depend on your account and requests.\n\n## Source\n\nCommit: ${commit}. Manifest: delivery.json. Installation: docs/macos-install.html. This is a new application folder; the developer's task and approval records do not authorize changes here. Follow this application's user's requests.\n`,
    'TODO.md': `# Saplingagent progress\n\n## Initial state\n\nSource commit: ${commit}. Installation, login and startup have not yet been performed in this folder. Run bash Saplingagent.sh, choose English or Chinese, then Install / update, Configure AI, then Start app. Diagnostics is available from the same menu. See docs/macos-install.html.\n\n## Next steps\n\n- Install and log in with your own account.\n- Send a message and check the actual model response.\n- Add features through conversation and record implementation, self-checks and human validation for this application.\n\nThe extracted folder has no Git repository or approved main commit. Initialize version control only under the current user's authorization; do not inherit the developer's task, test or merge approvals.\n`,
    'AI_TASKS.md': `# AI task coordination\n\n## Coordination\n\n- Authoritative index: root AI_TASKS.md; progress: TODO.md.\n- No task is claimed and no AI is currently executing.\n- Source commit: ${commit}.\n- Git is not initialized. Future parallel development follows rules/14 to locate coordination and separate worktrees.\n\n## Current tasks\n\nNone. agent-runtime records actual runtime modifications locally. Read-only chat creates no modification task. Registration failure is not a file permission gate. Developer tasks and approvals were not copied into this folder.\n`,
  };
}

export async function packageMac({ ref = 'HEAD', outputDir = path.join(root, '.cache/releases'), sourceRoot = root } = {}) {
  if (process.platform !== 'darwin') throw new Error('The macOS packaging entry point supports macOS only.');
  const git = args => execFileSync('git', args, { cwd: sourceRoot, maxBuffer: 64 * 1024 * 1024 });
  const commit = git(['rev-parse', '--verify', `${ref}^{commit}`]).toString().trim();
  const entries = git(['ls-tree', '-r', '-z', commit]).toString().split('\0').filter(Boolean).map(line => {
    const match = line.match(/^(\d+) blob ([a-f0-9]+)\t(.+)$/s);
    if (!match) throw new Error('The commit contains an unsupported file type.');
    return { mode: match[1], blob: match[2], path: match[3] };
  });
  const files = entries.filter(entry => distributable(entry.path));
  if (files.some(entry => entry.mode === '120000')) throw new Error('Distribution source contains symlinks. Review and replace them with explicit tracked files first.');
  const required = ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'Saplingagent.sh', 'scripts/macos/bootstrap.sh', 'scripts/macos/codex.sh', 'scripts/macos/cli.mjs', 'docs/macos-install.html', 'docs/macos-install.zh.html', 'rules/README.md', 'config/macos.json', 'front/package-lock.json', 'backend/mcp-runtime/package-lock.json', 'backend/agent-runtime/package-lock.json'];
  for (const file of required) if (!files.some(entry => entry.path === file)) throw new Error(`Delivery version is missing ${file}`);
  const ruleFiles = entries.filter(entry => entry.path.startsWith('rules/'));
  if (ruleFiles.some(entry => !files.some(file => file.path === entry.path))) throw new Error('Incomplete rules; distribution refused.');
  await fs.mkdir(outputDir, { recursive: true });
  const staging = path.join(sourceRoot, '.cache', 'macos-package', randomUUID());
  const packageName = `Saplingagent-macOS-${commit.slice(0, 8)}`;
  const directory = path.join(staging, packageName);
  const zip = path.join(path.resolve(outputDir), packageName + '.zip');
  const tempZip = zip + `.${randomUUID()}.tmp.zip`;
  await fs.mkdir(directory, { recursive: true });
  try {
    const archive = git(['archive', '--format=tar', commit, '--', ...files.map(file => file.path)]);
    execFileSync('/usr/bin/tar', ['-xf', '-', '-C', directory], { input: archive });
    for (const file of files) {
      const content = await fs.readFile(path.join(directory, file.path));
      const blob = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
      if (blob !== file.blob) throw new Error(`Extracted file does not match the commit:${file.path}`);
    }
    const records = initialProjectRecords(commit);
    for (const [file, content] of Object.entries(records)) await fs.writeFile(path.join(directory, file), content);
    const agentsFile = path.join(directory, 'AGENTS.md');
    let agents = await fs.readFile(agentsFile, 'utf8');
    agents = agents.replace(/^.*TASK014.*\n/gm, '');
    agents += `\n- This macOS source package comes from commit ${commit}. Task records are initialized for this application. See docs/macos-install.html; developer approvals do not transfer.\n`;
    await fs.writeFile(agentsFile, agents);
    const generated = [...Object.keys(records), 'AGENTS.md'];
    const manifestFiles = [];
    for (const file of files) {
      const content = await fs.readFile(path.join(directory, file.path));
      manifestFiles.push({ path: file.path, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex'), ...(generated.includes(file.path) ? { initializedForRecipient: true } : {}) });
    }
    const settings = JSON.parse(await fs.readFile(path.join(directory, 'config/macos.json'), 'utf8'));
    await fs.writeFile(path.join(directory, 'delivery.json'), JSON.stringify({ schemaVersion: 1, sourceCommit: commit, platform: 'macOS 13.5+', architectures: ['arm64', 'x64'], runtimes: settings, files: manifestFiles }, null, 2) + '\n');
    execFileSync('/usr/bin/zip', ['-q', '-r', tempZip, packageName], { cwd: staging });
    await fs.rename(tempZip, zip);
    const digest = createHash('sha256').update(await fs.readFile(zip)).digest('hex');
    await fs.writeFile(zip + '.sha256', `${digest}  ${path.basename(zip)}\n`);
    return { commit, zip, sha256: digest, files: files.length, rules: ruleFiles.length };
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
    await fs.rm(tempZip, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [ref = 'HEAD', outputDir] = process.argv.slice(2);
    console.log(JSON.stringify(await packageMac({ ref, ...(outputDir ? { outputDir: path.resolve(outputDir) } : {}) }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
