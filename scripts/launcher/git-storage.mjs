import fs from 'node:fs/promises';
import { readSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export const AUTHOR_REMOTE = 'https://github.com/extendmachine/Saplingagent.git';
const t = (en, zh) => process.env.SAPLING_LANG === 'zh' ? zh : en;
const modes = ['local', 'own', 'upstream', 'existing'];
// Git state belongs to this folder, even when extracted beneath another repo.
// Ignore inherited Git routing variables; never modify global configuration.
function gitEnv() {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_') && key !== 'GIT_TERMINAL_PROMPT') delete env[key];
  return env;
}
async function git(root, args, { optional = false } = {}) {
  try { return (await exec('git', ['-C', root, ...args], { env: gitEnv(), encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 })).stdout.trim(); }
  catch (error) {
    if (optional && error.code !== 'ENOENT') return '';
    // Remote/credential helpers may include credentials in stderr. Do not echo it.
    throw new Error(error.code === 'ENOENT' ? t('Git is required for version history. Install Git for Windows, or install Apple Command Line Tools with xcode-select --install, then retry.', '版本历史需要 Git。Windows 请安装 Git for Windows；Mac 请运行 xcode-select --install 安装 Apple 命令行工具，然后重试。') : t(`Git ${args[0]} failed. Files were not reset. Check Git, connectivity and repository access; retry Git / storage setup.`, `Git ${args[0]} 失败，文件没有被重置。请检查 Git、网络和仓库访问，再选择 Git / 存放配置重试。`));
  }
}
export function validateRemote(value) {
  if (typeof value !== 'string' || !value || value.startsWith('-') || /[\x00-\x1f\x7f]/.test(value)) throw new Error(t('Enter a repository URL without credentials, whitespace or options.', '请输入不含凭据、空白或命令参数的仓库网址。'));
  if (path.isAbsolute(value) && !value.includes('?') && !value.includes('#')) return value;
  if (/\s/.test(value)) throw new Error(t('Repository URLs cannot contain whitespace.', '仓库网址不能含有空白。'));
  if (/^[\w.-]+@[\w.-]+:[^?#]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (!['https:', 'ssh:'].includes(url.protocol) || url.password || (url.protocol === 'https:' && url.username) || url.search || url.hash || !url.hostname || url.pathname === '/') throw new Error();
    return value;
  } catch { throw new Error(t('Use an HTTPS/SSH Git URL without embedded credentials, query or fragment, or an absolute local repository path. Create your own repository first; installation does not create or publish it.', '请使用不含内嵌凭据、查询或片段的 HTTPS / SSH Git 地址，或本地仓库绝对路径。请先自行创建仓库；安装不会创建或发布远端仓库。')); }
}
function isAuthor(url) { return /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)extendmachine\/Saplingagent(?:\.git)?\/?$/i.test(url); }
function ask(label, fallback) {
  process.stdout.write(label);
  const bytes = [];
  const byte = Buffer.alloc(1);
  while (true) {
    const count = readSync(0, byte, 0, 1);
    if (!count) throw new Error(t('Git setup cancelled (no input). For unattended installation set SAPLING_GIT_MODE=local, own or upstream, with SAPLING_GIT_REMOTE for own.', 'Git 配置已取消（没有输入）。自动安装请设置 SAPLING_GIT_MODE=local、own 或 upstream；own 还需要 SAPLING_GIT_REMOTE。'));
    if (byte[0] === 10) break;
    if (byte[0] !== 13) bytes.push(byte[0]);
    if (bytes.length > 4096) throw new Error(t('Input is too long.', '输入过长。'));
  }
  return Buffer.from(bytes).toString('utf8').trim() || fallback;
}
async function identity(root) {
  if (!await git(root, ['config', 'user.name'], { optional: true })) await git(root, ['config', '--local', 'user.name', 'Saplingagent User']);
  if (!await git(root, ['config', 'user.email'], { optional: true })) await git(root, ['config', '--local', 'user.email', 'user@localhost']);
}
async function defaults(root) {
  const file = path.join(root, '.git/info/exclude');
  const previous = await fs.readFile(file, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  if (previous.includes('# Saplingagent local source snapshots')) return;
  const ignores = ['local-secrets/', '.secrets/', 'secrets/', '.runtime/', '.cache/', '.worktrees/', 'logs/', 'data/', 'snapshots/', 'node_modules/', '.venv/', 'docker-images/', 'dist/', 'build/', 'selfdata.json', '.env', '.env.*', '*.key', '*.pem', '*.p12', '*.pfx', '*.log', 'CLAUDE.local.md', 'settings.local.json', '**/ai-tasks/runtime/'];
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, previous + '\n# Saplingagent local source snapshots\n' + ignores.join('\n') + '\n');
}
async function initialCommit(root, parent) {
  await identity(root);
  await defaults(root);
  await git(root, ['add', '--all', '--', '.']);
  const files = (await git(root, ['ls-files', '-z'])).split('\0').filter(Boolean);
  if (files.some(file => /(^|\/)(local-secrets|\.secrets|secrets|data|logs|snapshots|\.runtime|\.cache|\.worktrees|node_modules|\.venv|docker-images|dist|build)(\/|$)/.test(file) || /(^|\/)(selfdata\.json|\.env(?:\..*)?|CLAUDE\.local\.md|settings\.local\.json)$/.test(file) || /\.(key|pem|p12|pfx|log)$/.test(file))) throw new Error(t('Private/runtime files are already staged. Unstage them before initializing source history.', '已有私密 / 运行时文件被暂存。请先取消暂存，再初始化源码历史。'));
  if (parent) {
    const tree = await git(root, ['write-tree']);
    const sha = await git(root, ['commit-tree', tree, '-p', parent, '-m', 'chore: initialize customer application from release source']);
    await git(root, ['update-ref', 'HEAD', sha]);
  } else await git(root, ['commit', '--allow-empty', '-m', 'chore: initialize customer application']);
}
async function remote(root, name, url) {
  const current = await git(root, ['config', '--get', `remote.${name}.url`], { optional: true });
  if (current && current !== url && !(name === 'upstream' && isAuthor(current) && isAuthor(url))) throw new Error(t(`Remote ${name} already has another URL. Change the conflicting remote yourself before retrying.`, `远端 ${name} 已有其他地址。请自行修改冲突的远端后再重试。`));
  if (!current) await git(root, ['remote', 'add', name, url]);
}

export async function configureGitStorage(root, { force = false, mode, remoteUrl, branch, prompt = ask, output = console.log } = {}) {
  await git(root, ['--version']);
  const marker = await fs.lstat(path.join(root, '.git')).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (marker && !marker.isDirectory()) {
    output(t('Linked worktree: keeping its shared Git configuration and current version. Use a complete independent customer folder for storage setup.', '检测到链接 Worktree：保留共享 Git 配置和当前版本。请在完整独立的客户目录中配置存放方式。'));
    return { mode: 'worktree', preserved: true };
  }
  const existing = Boolean(marker);
  let saved = '';
  const hasHead = existing && Boolean(await git(root, ['rev-parse', '--verify', 'HEAD'], { optional: true }));
  if (existing) {
    const top = await fs.realpath(await git(root, ['rev-parse', '--show-toplevel']));
    if (top !== await fs.realpath(root)) throw new Error(t('Git belongs to another folder; configuration was not changed.', 'Git 属于其他目录，未修改配置。'));
    saved = await git(root, ['config', '--local', '--get', 'saplingagent.storageMode'], { optional: true });
    if (saved && !force) {
      output(t('Keeping saved Git / storage configuration and your current branch/version.', '保留已保存的 Git / 存放配置和当前分支 / 版本。'));
      return { mode: saved, branch: await git(root, ['branch', '--show-current']), preserved: true };
    }
  }
  const currentBranch = existing ? await git(root, ['branch', '--show-current']) : '';
  const origin = existing ? await git(root, ['config', '--get', 'remote.origin.url'], { optional: true }) : '';
  mode ??= process.env.SAPLING_GIT_MODE;
  remoteUrl ??= process.env.SAPLING_GIT_REMOTE;
  branch ??= process.env.SAPLING_GIT_BRANCH;
  if (!mode) {
    const independent = saved === 'local' || saved === 'own';
    let menu = t('\nGit / storage — choose where your application changes belong:\n  1. Local only (ERASE all Git history/config; start empty main, no remotes)\n  2. My own repository (connect your existing repository URL)', '\nGit / 存放 — 选择应用修改存放位置：\n  1. 仅本地（清除全部 Git 历史和配置，重建空 main，无远端）\n  2. 自己的远端仓库（连接已创建的仓库地址）');
    if (!independent) menu += t('\n  3. Follow Saplingagent release (author upstream; no automatic push/PR)', '\n  3. 跟随 Saplingagent release（作者上游；不自动推送或发 PR）');
    output(menu);
    const choice = prompt(independent ? t('Choose [1-2] (local clears Git history): ', '请选择 [1-2]（仅本地会清除 Git 历史）：') : t('Choose [1-3] (local clears Git history): ', '请选择 [1-3]（仅本地会清除 Git 历史）：'), '');
    mode = { '1': 'local', '2': 'own', ...(!independent ? { '3': 'upstream' } : {}) }[choice];
    if (!mode) throw new Error(independent ? t('Invalid selection. Choose 1 or 2; nothing was changed.', '选项无效。请选择 1 或 2；未进行修改。') : t('Invalid selection. Choose 1, 2 or 3; nothing was changed.', '选项无效。请选择 1、2 或 3；未进行修改。'));
  }
  if (!modes.includes(mode) || (mode === 'existing' && !hasHead)) throw new Error(t('Invalid Git storage mode.', 'Git 存放模式无效。'));
  if (mode === 'local') {
    output(t('Local management clears ALL previous Git commits, branches, tags, version names and remote configuration in this folder. Application files, data and credentials remain. The new repository has only an empty main branch and no cloud links; no initial commit is created.', '本地管理将清除本文件夹内全部 Git 提交历史、分支、标签、版本名称和远端配置。应用文件、数据和凭据保留。重建后只有空 main 分支，不连接云端，也不创建初始提交。'));
    if (existing) await fs.rm(path.join(root, '.git'), { recursive: true });
    await git(root, ['init', '--template=', '-b', 'main']);
    await identity(root);
    await defaults(root);
    await git(root, ['config', '--local', 'saplingagent.initialBranch', 'main']);
    await git(root, ['config', '--local', 'saplingagent.storageMode', 'local']);
    output(t('Local Git ready: main; 0 commits; no remotes. Use Save version when you want your first local commit.', '本地 Git 已就绪：main；0 条提交；无远端。需要第一条本地记录时，点击 Save version。'));
    return { mode: 'local', branch: 'main', unborn: true, preserved: false };
  }
  let delivery;
  try { delivery = JSON.parse(await fs.readFile(path.join(root, 'delivery.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error(t('delivery.json is invalid. Repair it before retrying Git setup.', 'delivery.json 无效，请修复后重试 Git 配置。')); }
  if (mode === 'existing') {
    if (branch && branch !== currentBranch) throw new Error(t('Keep existing retains the current version. Choose another mode to configure a branch.', '保留现有模式保留当前版本。请选择其他模式配置分支。'));
    await git(root, ['config', '--local', 'saplingagent.storageMode', mode]);
    return { mode, branch: currentBranch, preserved: true };
  }
  if (mode === 'own') {
    remoteUrl ||= prompt(t('Your repository URL (no token/password): ', '自己的仓库地址（不要包含 token / 密码）：'), '');
    validateRemote(remoteUrl);
    if (isAuthor(remoteUrl)) throw new Error(t('This is the author repository. Choose Follow release, or enter your own repository URL.', '这是作者仓库，请选择跟随 release，或输入自己的仓库地址。'));
  }
  // Own storage changes remote configuration, not an existing selected version.
  // An empty current branch represents detached HEAD and must remain detached.
  const keepVersion = hasHead && mode !== 'upstream' && !branch;
  const target = keepVersion ? currentBranch : branch || (hasHead && !isAuthor(origin) ? currentBranch : delivery?.git?.initialBranch || 'release') || 'release';
  if (target && !await git(root, ['check-ref-format', '--branch', target], { optional: true })) throw new Error(t('Invalid branch name.', '分支名称无效。'));
  if (hasHead && target !== currentBranch && await git(root, ['status', '--porcelain'])) throw new Error(t('Save your pending changes before configuring another branch. No checkout or reset was performed.', '请先保存未提交修改，再配置其他分支。未切换或重置代码。'));
  if (hasHead && target !== currentBranch && mode !== 'upstream' && !await git(root, ['rev-parse', '--verify', `refs/heads/${target}`], { optional: true })) throw new Error(t('The requested branch is missing. Choose Follow release to fetch it, or keep your current branch.', '所选分支不存在。请选择跟随 release 获取它，或保留当前分支。'));
  if (!existing) await git(root, ['init', '-b', target]);
  if (isAuthor(origin)) {
    if (mode !== 'upstream') await git(root, ['remote', 'remove', 'origin']);
    else {
      const upstream = await git(root, ['config', '--get', 'remote.upstream.url'], { optional: true });
      if (upstream && !isAuthor(upstream)) throw new Error(t('An unrelated upstream already exists. Rename it yourself before retrying.', '已有其他 upstream。请自行改名后再重试。'));
      if (!upstream) await git(root, ['remote', 'rename', 'origin', 'upstream']);
      else await git(root, ['remote', 'remove', 'origin']);
    }
  }
  if (mode === 'own') {
    const upstream = await git(root, ['config', '--get', 'remote.upstream.url'], { optional: true });
    if (isAuthor(upstream)) await git(root, ['remote', 'remove', 'upstream']);
  }
  if (mode === 'upstream') {
    await remote(root, 'upstream', AUTHOR_REMOTE);
    // Follow only the selected release branch on future ordinary fetches as well.
    await git(root, ['config', '--local', '--replace-all', 'remote.upstream.fetch', `+refs/heads/${target}:refs/remotes/upstream/${target}`]);
    await git(root, ['config', '--local', 'remote.upstream.tagOpt', '--no-tags']);
    await git(root, ['fetch', '--no-tags', 'upstream', `refs/heads/${target}:refs/remotes/upstream/${target}`]);
  }
  if (!hasHead) {
    if (existing && target !== currentBranch) await git(root, ['symbolic-ref', 'HEAD', `refs/heads/${target}`]);
    let parent;
    if (mode === 'upstream') {
      parent = await git(root, ['rev-parse', `refs/remotes/upstream/${target}`]);
      if (delivery?.sourceCommit) {
        if (!/^[a-f0-9]{40}$/.test(delivery.sourceCommit)) throw new Error(t('Invalid delivery source commit.', '分发源码提交无效。'));
        // The shipped version must be in fetched history; never anchor an older
        // package to today's tip and accidentally revert later upstream changes.
        await git(root, ['merge-base', '--is-ancestor', delivery.sourceCommit, parent]);
        parent = delivery.sourceCommit;
      }
      if (!delivery?.sourceCommit) {
        // A raw GitHub ZIP has no provenance manifest. Match the exact shipped
        // tree against upstream history instead of claiming today's tip as base.
        await defaults(root);
        await git(root, ['add', '--all', '--', '.']);
        const tree = await git(root, ['write-tree']);
        const history = await git(root, ['log', '--format=%H %T', `refs/remotes/upstream/${target}`]);
        const match = history.split('\n').find(record => record.split(' ')[1] === tree);
        if (!match) throw new Error(t('This ZIP does not match upstream source history. Choose local/own storage, or use a release Git clone/manifest package to follow upstream. Your files were kept.', '这个 ZIP 与上游源码历史不匹配。请选择本地 / 自有仓库，或使用 release Git 克隆 / 带清单的分发包跟随上游。文件已保留。'));
        parent = match.split(' ')[0];
      }
    }
    await initialCommit(root, parent);
  } else if (target !== currentBranch) {
    const found = await git(root, ['rev-parse', '--verify', `refs/heads/${target}`], { optional: true });
    if (found) await git(root, ['switch', target]);
    else {
      if (mode !== 'upstream') throw new Error(t('The requested branch is missing. Choose Follow release to fetch it, or keep your current branch.', '所选分支不存在。请选择跟随 release 获取它，或保留当前分支。'));
      await git(root, ['switch', '-c', target, '--track', `upstream/${target}`]);
    }
  }
  if (mode === 'own') {
    const currentOrigin = await git(root, ['config', '--get', 'remote.origin.url'], { optional: true });
    if (currentOrigin) {
      await git(root, ['config', '--local', '--replace-all', 'remote.origin.url', remoteUrl]);
      // A separate old push URL must not send customer commits to the previous host.
      await git(root, ['config', '--local', '--unset-all', 'remote.origin.pushurl'], { optional: true });
    } else await remote(root, 'origin', remoteUrl);
    await git(root, ['config', '--local', 'saplingagent.ownRemote', remoteUrl]);
  }
  if (mode === 'upstream') {
    await git(root, ['config', '--local', `branch.${target}.remote`, 'upstream']);
    await git(root, ['config', '--local', `branch.${target}.merge`, `refs/heads/${target}`]);
    await git(root, ['config', '--local', 'pull.ff', 'only']);
  }
  await git(root, ['config', '--local', 'saplingagent.initialBranch', target]);
  await git(root, ['config', '--local', 'saplingagent.storageMode', mode]);
  output(t(`Git storage configured: ${mode}; branch/version: ${target || 'detached HEAD'}. Changes stay local until you explicitly publish them.`, `Git 存放已配置：${mode}；分支 / 版本：${target || 'detached HEAD'}。修改保存在本地，只有主动发布才会上传。`));
  return { mode, branch: target, preserved: false };
}
