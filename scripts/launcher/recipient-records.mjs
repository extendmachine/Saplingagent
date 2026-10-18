import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function initialProjectRecords(commit, platform) {
  const windows = platform === 'Windows';
  const guide = windows ? 'windows-install.html' : 'macos-install.html';
  const launch = 'bash Saplingagent.sh';
  return {
    'FINAL_GOAL.md': `# Saplingagent final goal\n\nSaplingagent is a minimal software seed package that users can modify themselves. Start with one web page and a chat interface. Build and adapt a local application through conversation. Frontend: front/; backend: backend/; documentation: docs/. Source, rules, sessions and runtime belong to this application folder.\n\n## Folder boundary and conversation receipts\n\nAll project-owned application code, rules, MCP, Skills, configuration, documentation and launcher helpers belong to this complete folder. Maintainer development does not modify external code or depend on sibling checkouts. Dependencies install locally; declared model services and OS tools remain external requirements. Rules recommend customer edits stay in this folder by default; explicit customer requests may target external code using unchanged Full Access, without path protection or permission gates. Every final assistant reply, including read-only conversation, must include the eight-field completion-review receipt from rules/README.md with actual results. Read-only replies remain unregistered.\n\n## Implemented\n\nProject-local installation through Bash (Windows requires Git Bash) on ${windows ? 'Windows 10/11 x64 and ARM64' : 'macOS 13.5+'}, your own ChatGPT account or custom Codex/OpenCode/Claude Agent API scheme through an independent configuration page, official App Server and Claude Agent SDK integration, 15 MCP tools, 3 project Skills, streaming chat and local sessions. Full Access uses the current OS user's permissions, without directory protection, per-operation confirmation or automatic root elevation. Restore only on explicit user request.\n\n## Limits\n\nThis package is for local use under the noncommercial LICENSE. Commercial use requires separate authorization from the project owner, and commercial/hosted OpenAI authentication requires an eligible separate integration. Cloud synchronization, signed native apps, self-extracting seeds, Linux delivery and proven long-term layout adaptation are not implemented. Actual model access, quota and network availability depend on your account and requests. ${windows ? 'Native Windows10 installation/login/model/restart acceptance remains pending; Mac checks are not native Windows validation.' : ''}\n\n## Source\n\nCommit: ${commit}. Manifest: delivery.json. Installation: docs/${guide}. This is a new application folder; the developer's task and approval records do not authorize changes here. Follow this application's user's requests.\n`,
    'TODO.md': `# Saplingagent progress\n\n## Initial state\n\nSource commit: ${commit}. Installation, login and startup have not yet been performed in this folder. Run ${launch}, choose English or Chinese, then Install / repair dependencies, Configure AI, then Start app. Diagnostics is available from the same menu. See docs/${guide}.\n\n## Next steps\n\n- Install and configure your own account or API scheme in the local setup page.\n- Send a message and check the actual model response.\n- Add features through conversation and record implementation, self-checks and human validation for this application.\n\nThe extracted release snapshot has no Git metadata. Installation never creates Git, prompts for storage or connects an upstream. The page has no default Git controls. You can create your own repository later; reinstall and kernel update preserve it. Kernel maintenance from the web control updates only its declared core and independent dependencies, retaining your application, configuration and data. Source restore is explicit. Do not inherit developer approvals.\n`,
    'AI_TASKS.md': `# AI task coordination\n\n## Coordination\n\n- Authoritative index: root AI_TASKS.md; progress: TODO.md.\n- No task is claimed and no AI is currently executing.\n- Source commit: ${commit}.\n- Git is not initialized. Future parallel development follows rules/14 to locate coordination and separate worktrees.\n\n## Current tasks\n\nNone. agent-runtime records actual runtime modifications locally. Read-only chat creates no modification task. Registration failure is not a file permission gate. Developer tasks and approvals were not copied into this folder.\n`,
  };
}

export function recipientAgentInstructions(agents, commit, platform) {
  agents = agents.replace(/^.*TASK014.*\n/gm, '');
  agents = agents.replace(/^- Keep only `main`, `testcode` and `release`.*$/m, '- Customer repositories keep their own branch policy. Installation defaults to release unless explicitly configured; upstream maintainer branches do not constrain this application.');
  return agents + `\n- This ${platform} source package comes from commit ${commit}. Task records are initialized for this application. See docs/${platform === 'Windows' ? 'windows-install.html' : 'macos-install.html'}; developer approvals do not transfer.\n- This release snapshot has no Git metadata. Installation does not initialize Git or connect remotes. Existing customer Git survives reinstall and kernel maintenance. Publication always needs explicit customer authorization.\n`;
}

export async function initializeDownloadedRecords(root, output = console.log) {
  const file = path.join(root, 'delivery.json');
  let delivery;
  try { delivery = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  if (delivery.initializeRecords !== true) return false;
  if (!/^[a-f0-9]{40}$/.test(delivery.sourceCommit) || delivery.sourceRef !== 'release' || !['macOS','Windows'].includes(delivery.platform)) throw new Error('Invalid release download receipt. Preserve delivery.json and retry the download in a new folder.');
  const records = initialProjectRecords(delivery.sourceCommit, delivery.platform);
  const agents = await fs.readFile(path.join(root,'AGENTS.md'),'utf8');
  const content = { ...records, 'AGENTS.md': recipientAgentInstructions(agents, delivery.sourceCommit, delivery.platform) };
  let unchanged = true;
  for (const name of Object.keys(content)) {
    const current = await fs.readFile(path.join(root,name));
    if (createHash('sha256').update(current).digest('hex') !== delivery.recordHashes?.[name]) unchanged = false;
  }
  try { await fs.lstat(path.join(root,'.git')); unchanged = false; } catch (error) { if(error.code!=='ENOENT')throw error; }
  if (unchanged) for (const [name,text] of Object.entries(content)) await fs.writeFile(path.join(root,name),text);
  else output('Project records or Git changed before first installation; keeping your existing records.');
  delivery.initializeRecords = false;
  await fs.writeFile(file,JSON.stringify(delivery,null,2)+'\n');
  return unchanged;
}
