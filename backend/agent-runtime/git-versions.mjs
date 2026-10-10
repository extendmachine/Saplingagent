import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class GitVersionError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function git(root, args) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      timeout: 10_000,
    });
    return stdout;
  } catch (error) {
    const detail = String(error?.stderr || error?.message || '').trim();
    if (/not a git repository/i.test(detail)) throw new GitVersionError('GIT_NOT_REPOSITORY', '当前文件夹不是 Git 仓库', 404);
    throw new GitVersionError('GIT_COMMAND_FAILED', detail || 'Git 操作失败', 500);
  }
}

function parseStatus(raw) {
  const fields = raw.split('\0');
  const changes = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field) continue;
    const code = field.slice(0, 2);
    const file = field.slice(3);
    const renamed = /[RC]/.test(code);
    const from = renamed ? fields[++index] || null : null;
    changes.push({ code, file, ...(from ? { from } : {}) });
  }
  return changes;
}

function parseWorktrees(raw) {
  return raw.trim().split(/\n\n+/).filter(Boolean).map(block => {
    const value = {};
    for (const line of block.split('\n')) {
      const space = line.indexOf(' ');
      const key = space === -1 ? line : line.slice(0, space);
      const field = space === -1 ? true : line.slice(space + 1);
      value[key] = field;
    }
    return value;
  });
}

function parseRecords(raw, fields) {
  return raw.split('\n').filter(Boolean).map(line => {
    const values = line.split('\0');
    return Object.fromEntries(fields.map((field, index) => [field, values[index] || '']));
  });
}

export async function readGitVersion(root) {
  const [repositoryRoot, head, branchName, statusRaw, branchRaw, worktreeRaw, commitRaw] = await Promise.all([
    git(root, ['rev-parse', '--show-toplevel']),
    git(root, ['show', '-s', '--format=%h%x00%H%x00%aI%x00%s', 'HEAD']),
    git(root, ['branch', '--show-current']),
    git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    git(root, ['for-each-ref', '--format=%(refname:short)%00%(objectname:short)%00%(upstream:short)%00%(committerdate:iso-strict)%00%(subject)', 'refs/heads']),
    git(root, ['worktree', 'list', '--porcelain']),
    git(root, ['log', '--all', '-n', '8', '--format=%h%x00%H%x00%aI%x00%s']),
  ]);
  const [shortSha, sha, committedAt, subject] = head.trimEnd().split('\0');
  const currentRoot = path.resolve(repositoryRoot.trim());
  const worktrees = parseWorktrees(worktreeRaw);
  const occupied = new Map();
  for (const worktree of worktrees) {
    if (typeof worktree.branch !== 'string' || typeof worktree.worktree !== 'string') continue;
    const name = worktree.branch.replace(/^refs\/heads\//, '');
    if (path.resolve(worktree.worktree) !== currentRoot) occupied.set(name, path.basename(worktree.worktree));
  }
  const branches = parseRecords(branchRaw, ['name', 'shortSha', 'upstream', 'committedAt', 'subject']).map(branch => ({
    ...branch,
    current: branch.name === branchName.trim(),
    occupied: occupied.has(branch.name),
    ...(occupied.has(branch.name) ? { occupiedBy: occupied.get(branch.name) } : {}),
  }));
  const changes = parseStatus(statusRaw);
  return {
    repository: path.basename(currentRoot),
    branch: branchName.trim() || null,
    detached: !branchName.trim(),
    head: { shortSha, sha, committedAt, subject },
    clean: changes.length === 0,
    changes: changes.slice(0, 100),
    changeCount: changes.length,
    changesTruncated: changes.length > 100,
    branches,
    recentCommits: parseRecords(commitRaw, ['shortSha', 'sha', 'committedAt', 'subject']),
  };
}

export async function switchGitBranch(root, branch) {
  if (typeof branch !== 'string' || !branch || branch.length > 255 || branch.startsWith('-') || /[\0\r\n]/.test(branch)) {
    throw new GitVersionError('GIT_INVALID_BRANCH', '分支名称无效');
  }
  const state = await readGitVersion(root);
  const target = state.branches.find(candidate => candidate.name === branch);
  if (!target) throw new GitVersionError('GIT_BRANCH_NOT_FOUND', '目标分支不存在', 404);
  if (target.current) return state;
  if (!state.branch) throw new GitVersionError('GIT_DETACHED', '当前目录未处于命名分支，无法自动保存后切换', 409);
  if (target.occupied) throw new GitVersionError('GIT_BRANCH_IN_USE', `分支正在其他工作树中使用：${target.occupiedBy}`, 409);
  let autoCommit = null;
  if (!state.clean) {
    await git(root, ['add', '--all']);
    const subject = `chore: save ${state.branch} before switching to ${branch}`;
    await git(root, ['commit', '-m', subject]);
    const [shortSha, sha] = (await git(root, ['show', '-s', '--format=%h%x00%H', 'HEAD'])).trim().split('\0');
    autoCommit = { shortSha, sha, subject };
  }
  await git(root, ['switch', '--', branch]);
  return { ...(await readGitVersion(root)), autoCommit };
}
