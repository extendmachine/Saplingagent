import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
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

async function assertRepositoryRoot(root) {
  const repository = (await git(root, ['rev-parse', '--show-toplevel'])).trim();
  if (await fs.realpath(repository) !== await fs.realpath(root)) {
    throw new GitVersionError('GIT_NOT_REPOSITORY', 'This application folder has no Git repository. Choose Git / storage setup in Saplingagent.sh; the parent repository is not this application', 404);
  }
}

async function git(root, args, { allowUnborn = false } = {}) {
  try {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
    const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
      env, encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      timeout: 10_000,
    });
    return stdout;
  } catch (error) {
    if (allowUnborn && error.code === 1) return '';
    const detail = String(error?.stderr || error?.message || '').trim();
    if (/not a git repository/i.test(detail)) throw new GitVersionError('GIT_NOT_REPOSITORY', 'The current folder is not a Git repository', 404);
    throw new GitVersionError('GIT_COMMAND_FAILED', detail || 'Git operation failed', 500);
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

async function createVersionFingerprint(root, sha, statusRaw, changes) {
  const hash = createHash('sha256').update(sha).update('\0').update(statusRaw);
  const files = [...new Set(changes.flatMap(change => [change.file, change.from].filter(Boolean)))].sort();
  for (const file of files) {
    hash.update('\0').update(file);
    try {
      const stat = await fs.lstat(path.resolve(root, file), { bigint: true });
      hash.update(`\0${stat.size}:${stat.mtimeNs}:${stat.mode}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      hash.update('\0deleted');
    }
  }
  return hash.digest('hex').slice(0, 16);
}

async function labelsPath(root) {
  const common = (await git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim();
  return path.join(common, 'saplingagent', 'version-labels.json');
}

async function readLabels(root) {
  try {
    const labels = JSON.parse(await fs.readFile(await labelsPath(root), 'utf8'));
    if (!labels || typeof labels !== 'object' || Array.isArray(labels) || Object.entries(labels).some(([sha, name]) => !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha) || typeof name !== 'string' || name.length > 80 || /[\x00-\x1f\x7f]/.test(name))) throw new Error('Invalid labels');
    return labels;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new GitVersionError('GIT_LABELS_INVALID', 'Version names could not be read. Repair the repository label file before editing names', 500);
  }
}

async function validateCommit(root, sha) {
  await assertRepositoryRoot(root);
  if (typeof sha !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha)) throw new GitVersionError('GIT_INVALID_VERSION', 'Select a full commit ID');
  try {
    if ((await git(root, ['cat-file', '-t', sha])).trim() !== 'commit') throw new Error('Not a commit');
  } catch { throw new GitVersionError('GIT_VERSION_NOT_FOUND', 'This committed version does not exist', 404); }
  return sha;
}

export async function readGitVersion(root, { limit = 25 } = {}) {
  await assertRepositoryRoot(root);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new GitVersionError('GIT_INVALID_LIMIT', 'History limit must be an integer from 1 to 500');
  const headSha = (await git(root, ['rev-parse', '--verify', '--quiet', 'HEAD'], { allowUnborn: true })).trim();
  const unborn = !headSha;
  const [repositoryRoot, head, branchName, statusRaw, branchRaw, worktreeRaw, commitRaw] = await Promise.all([
    git(root, ['rev-parse', '--show-toplevel']),
    unborn ? '' : git(root, ['show', '-s', '--format=%h%x00%H%x00%aI%x00%s', 'HEAD']),
    git(root, ['branch', '--show-current']),
    git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    git(root, ['for-each-ref', '--format=%(refname:short)%00%(objectname:short)%00%(upstream:short)%00%(committerdate:iso-strict)%00%(subject)', 'refs/heads']),
    git(root, ['worktree', 'list', '--porcelain']),
    unborn ? '' : git(root, ['log', '--all', 'HEAD', '-n', String(limit + 1), '--format=%h%x00%H%x00%aI%x00%s']),
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
  if (unborn && branchName.trim() && !branches.some(branch => branch.current)) branches.unshift({ name: branchName.trim(), shortSha: '', upstream: '', committedAt: '', subject: '', current: true, occupied: false });
  const changes = parseStatus(statusRaw);
  const fingerprint = await createVersionFingerprint(currentRoot, sha || `unborn:${branchName.trim()}`, statusRaw, changes);
  const labels = await readLabels(root);
  const commits = parseRecords(commitRaw, ['shortSha', 'sha', 'committedAt', 'subject']);
  const withLabel = commit => ({ ...commit, ...(labels[commit.sha] ? { displayName: labels[commit.sha] } : {}) });
  return {
    repository: path.basename(currentRoot),
    branch: branchName.trim() || null,
    detached: !branchName.trim(),
    unborn,
    head: unborn ? null : withLabel({ shortSha, sha, committedAt, subject }),
    version: changes.length === 0 ? (shortSha || 'uncommitted') : `${shortSha || 'uncommitted'}+${fingerprint.slice(0, 6)}`,
    fingerprint,
    clean: changes.length === 0,
    changes: changes.slice(0, 100),
    changeCount: changes.length,
    changesTruncated: changes.length > 100,
    branches,
    recentCommits: commits.slice(0, limit).map(withLabel),
    historyTruncated: commits.length > limit,
  };
}

export async function nameGitVersion(root, sha, name) {
  await validateCommit(root, sha);
  if (typeof name !== 'string' || name.trim().length > 80 || /[\x00-\x1f\x7f]/.test(name)) throw new GitVersionError('GIT_INVALID_LABEL', 'Enter a version name of up to 80 characters without control characters');
  const file = await labelsPath(root);
  await fs.mkdir(path.dirname(file), { recursive: true });
  let lock;
  try { lock = await fs.open(`${file}.lock`, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new GitVersionError('GIT_LABEL_BUSY', 'Another version name is being saved. Retry shortly', 409); throw error; }
  let renamed = false;
  try {
    const labels = await readLabels(root);
    if (name.trim()) labels[sha] = name.trim(); else delete labels[sha];
    await lock.writeFile(JSON.stringify(labels, null, 2) + '\n');
    await lock.sync();
    await lock.close();
    await fs.rename(`${file}.lock`, file);
    renamed = true;
  } finally {
    await lock.close().catch(() => {});
    if (!renamed) await fs.rm(`${file}.lock`, { force: true });
  }
  return readGitVersion(root);
}

async function retainHead(root) {
  const sha = (await git(root, ['rev-parse', 'HEAD'])).trim();
  await git(root, ['update-ref', `refs/saplingagent/saved/${sha}`, sha]);
}

async function savePending(root, state, subject) {
  if (state.clean) return null;
  // An old version can lack today's ignore rules. Saving source must still
  // exclude this application's private data and local runtime artifacts.
  const privateFile = file => /(^|\/)(local-secrets|\.secrets|secrets|logs|data|snapshots|\.cache|\.runtime|\.worktrees|node_modules|\.venv|docker-images|dist|build)(\/|$)/.test(file) || /(^|\/)(selfdata\.json|\.env(?:\..*)?|CLAUDE\.local\.md|settings\.local\.json)$/.test(file) || /\.(key|pem|p12|pfx|log)$/.test(file);
  const staged = (await git(root, ['diff', '--cached', '--name-only', '-z'])).split('\0').filter(Boolean);
  if (staged.some(privateFile)) throw new GitVersionError('GIT_PRIVATE_FILES', 'Private runtime files are staged. Unstage them before saving a source version', 409);
  const folders = ['local-secrets', '.secrets', 'secrets', 'logs', 'data', 'snapshots', '.cache', '.runtime', '.worktrees', 'node_modules', '.venv', 'docker-images', 'dist', 'build'];
  const patterns = [...folders.map(folder => `**/${folder}/**`), '**/selfdata.json', '**/.env', '**/.env.*', '**/CLAUDE.local.md', '**/settings.local.json', '**/*.key', '**/*.pem', '**/*.p12', '**/*.pfx', '**/*.log'];
  await git(root, ['add', '--all', '--', '.', ...patterns.map(pattern => `:(exclude,glob)${pattern}`)]);
  if (!(await git(root, ['diff', '--cached', '--name-only'])).trim()) return null;
  await git(root, ['commit', '-m', subject]);
  const [shortSha, sha] = (await git(root, ['show', '-s', '--format=%h%x00%H', 'HEAD'])).trim().split('\0');
  if (!state.branch) await retainHead(root);
  return { shortSha, sha, subject };
}

export async function checkoutGitVersion(root, sha) {
  await validateCommit(root, sha);
  const state = await readGitVersion(root);
  if (state.head?.sha === sha) return state;
  const autoCommit = await savePending(root, state, `chore: save ${state.branch || 'detached version'} before loading ${sha.slice(0, 8)}`);
  if (state.head) await retainHead(root);
  await git(root, ['switch', '--detach', sha]);
  return { ...(await readGitVersion(root)), autoCommit };
}

export async function switchGitBranch(root, branch) {
  if (typeof branch !== 'string' || !branch || branch.length > 255 || branch.startsWith('-') || /[\0\r\n]/.test(branch)) {
    throw new GitVersionError('GIT_INVALID_BRANCH', 'Invalid branch name');
  }
  const state = await readGitVersion(root);
  const target = state.branches.find(candidate => candidate.name === branch);
  if (!target) throw new GitVersionError('GIT_BRANCH_NOT_FOUND', 'Target branch does not exist', 404);
  if (target.current) return state;
  if (target.occupied) throw new GitVersionError('GIT_BRANCH_IN_USE', `Branch is checked out in another worktree:${target.occupiedBy}`, 409);
  const autoCommit = await savePending(root, state, `chore: save ${state.branch || 'detached version'} before switching to ${branch}`);
  if (!state.branch) await retainHead(root);
  await git(root, ['switch', '--', branch]);
  return { ...(await readGitVersion(root)), autoCommit };
}

export async function commitGitVersion(root) {
  const state = await readGitVersion(root);
  if (state.clean) return { ...state, savedCommit: null };
  const savedCommit = await savePending(root, state, `chore: save ${state.branch || 'detached version'} from Saplingagent`);
  return { ...(await readGitVersion(root)), savedCommit };
}
