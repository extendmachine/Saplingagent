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
    || /^(?:AGENTS\.md|CLAUDE\.md|README\.md|FINAL_GOAL\.md|TODO\.md|AI_TASKS\.md|\.gitignore|[1-4]-.+\.command)$/.test(file);
}

function initialProjectRecords(commit) {
  return {
    'FINAL_GOAL.md': `# Saplingagent 最终目标\n\n从单网页、单聊天入口开始，用户通过与AI对话构建和逐步适配本地应用。前端在front/，后端在backend/，文档在docs/，资料、会话、规则和运行环境归应用文件夹。\n\n## 已实现\n\nmacOS13.5+项目内安装，用户自己的Codex登录，官方App Server、15个MCP工具和3个项目Skills，流式聊天与本地会话。当前OS用户Full Access，无MCP文件保护或逐次确认，不自动提权root；恢复仅由用户主动请求。\n\n## 当前边界\n\n本包用于本机开发/开源运行。商业/托管认证需另行Sign in with ChatGPT；云端、签名原生App、单文件自解包、Windows/Linux交付和长期布局效果尚未实现。用户自己的模型/额度/网络由实际请求验证。\n\n## 来源\n\n源码提交 ${commit}，交付清单delivery.json，安装指南docs/macos-install.html。此目录是独立新应用，开发者原项目任务和批准记录不作为本应用授权。后续修改由本应用用户的实际要求决定。\n`,
    'TODO.md': `# Saplingagent 当前进度\n\n## 初始状态\n\n源码来源 ${commit}。用户尚未在此目录安装、登录或启动；使用根目录1-安装.command、2-登录Codex.command、3-启动Saplingagent.command，故障诊断4-诊断.command。完整步骤见docs/macos-install.html。\n\n## 待办\n\n- 本机安装和用户自己的账号登录。\n- 打开页面发送一条消息，核对实际模型回复。\n- 根据用户需求通过对话新增应用内容；记录本应用的实现、自检与人工验收。\n\n此目录解压后没有Git仓库或已批准的main提交。需要版本管理时按用户当前授权初始化，不沿用开发者项目的任务、测试或合并批准。\n`,
    'AI_TASKS.md': `# 多 AI 任务管理\n\n## 协调信息\n\n- 权威索引：本应用根目录AI_TASKS.md；权威进度TODO.md。\n- 当前没有任务认领或正在执行的AI。\n- 来源提交：${commit}。\n- 本目录尚未初始化Git；后续并行修改按rules/14定位协调索引和独立Worktree。\n\n## 当前任务\n\n无。运行期实际修改由agent-runtime记录本应用的任务区块；只读聊天不登记，记录失败不构成文件权限门槛。开发者原项目的任务和授权未复制到本目录。\n`,
  };
}

export async function packageMac({ ref = 'HEAD', outputDir = path.join(root, '.cache/releases'), sourceRoot = root } = {}) {
  if (process.platform !== 'darwin') throw new Error('macOS 打包入口只支持 macOS。');
  const git = args => execFileSync('git', args, { cwd: sourceRoot, maxBuffer: 64 * 1024 * 1024 });
  const commit = git(['rev-parse', '--verify', `${ref}^{commit}`]).toString().trim();
  const entries = git(['ls-tree', '-r', '-z', commit]).toString().split('\0').filter(Boolean).map(line => {
    const match = line.match(/^(\d+) blob ([a-f0-9]+)\t(.+)$/s);
    if (!match) throw new Error('提交中含不支持的文件类型。');
    return { mode: match[1], blob: match[2], path: match[3] };
  });
  const files = entries.filter(entry => distributable(entry.path));
  if (files.some(entry => entry.mode === '120000')) throw new Error('分发源码含符号链接，请先核对并改为明确受控文件。');
  const required = ['1-安装.command', '2-登录Codex.command', '3-启动Saplingagent.command', '4-诊断.command', 'scripts/macos/bootstrap.sh', 'scripts/macos/codex.sh', 'scripts/macos/cli.mjs', 'docs/macos-install.html', 'rules/README.md', 'config/macos.json', 'front/package-lock.json', 'backend/mcp-runtime/package-lock.json'];
  for (const file of required) if (!files.some(entry => entry.path === file)) throw new Error(`交付版本缺少 ${file}`);
  const ruleFiles = entries.filter(entry => entry.path.startsWith('rules/'));
  if (ruleFiles.some(entry => !files.some(file => file.path === entry.path))) throw new Error('rules 不完整，拒绝分发。');
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
      if (blob !== file.blob) throw new Error(`提取后的文件与提交不一致：${file.path}`);
    }
    const records = initialProjectRecords(commit);
    for (const [file, content] of Object.entries(records)) await fs.writeFile(path.join(directory, file), content);
    const agentsFile = path.join(directory, 'AGENTS.md');
    let agents = await fs.readFile(agentsFile, 'utf8');
    agents = agents.replace(/^.*TASK014.*\n/gm, '');
    agents += `\n- 此macOS源包来自提交 ${commit}；本目录任务状态已初始化，安装见docs/macos-install.html，不沿用开发者原项目批准。\n`;
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
