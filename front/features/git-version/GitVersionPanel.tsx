import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, GitBranch, GitCommitHorizontal, LoaderCircle, RefreshCw, X } from 'lucide-react';

type GitBranchInfo = {
  name: string;
  shortSha: string;
  subject: string;
  current: boolean;
  occupied: boolean;
  occupiedBy?: string;
};

type GitState = {
  repository: string;
  branch: string | null;
  detached: boolean;
  head: { shortSha: string; sha: string; committedAt: string; subject: string };
  clean: boolean;
  changeCount: number;
  changes: Array<{ code: string; file: string; from?: string }>;
  changesTruncated: boolean;
  branches: GitBranchInfo[];
  recentCommits: Array<{ shortSha: string; sha: string; committedAt: string; subject: string }>;
  autoCommit?: { shortSha: string; sha: string; subject: string } | null;
};

class GitRequestError extends Error {
  code?: string;
}

async function requestGit(url = '/api/git', init?: RequestInit): Promise<GitState> {
  const response = await fetch(url, init);
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new GitRequestError(value.error?.message || `Git 服务返回 ${response.status}`);
    error.code = value.error?.code;
    throw error;
  }
  return value.git;
}

export function GitVersionPanel() {
  const [open, setOpen] = useState(false);
  const [git, setGit] = useState<GitState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await requestGit();
      if (!alive.current) return;
      setGit(next);
      setSelected(current => current && next.branches.some(branch => branch.name === current && !branch.current) ? current : null);
      setError('');
    } catch (nextError) {
      if (alive.current) setError(nextError instanceof Error ? nextError.message : '无法读取 Git 状态');
    } finally {
      if (alive.current && !quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden && !switching) void refresh(true); }, 5000);
    const onVisible = () => { if (!document.hidden) void refresh(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive.current = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh, switching]);

  const switchBranch = async () => {
    if (!selected || switching) return;
    setSwitching(true);
    setError('');
    try {
      const next = await requestGit('/api/git/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: selected }),
      });
      if (!alive.current) return;
      setGit(next);
      setSelected(null);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (nextError) {
      if (alive.current) setError(nextError instanceof Error ? nextError.message : '切换版本失败');
    } finally {
      if (alive.current) setSwitching(false);
    }
  };

  const currentLabel = git?.branch || (git ? `detached · ${git.head.shortSha}` : 'Git');
  const target = git?.branches.find(branch => branch.name === selected);

  return <aside className={`git-version-anchor${open ? ' is-open' : ''}`} aria-label="Git 版本管理">
    <button className="git-version-trigger" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <GitBranch size={15} aria-hidden="true" />
      <span>{currentLabel}</span>
      {git && !git.clean ? <span className="git-dirty-dot" title={`${git.changeCount} 项改动`} /> : null}
      <ChevronDown className="git-trigger-chevron" size={14} aria-hidden="true" />
    </button>

    {open ? <div className="git-version-popover">
      <div className="git-version-heading">
        <div>
          <span className="git-eyebrow">{git?.repository || '当前文件夹'}</span>
          <strong>Git 版本</strong>
        </div>
        <div className="git-heading-actions">
          <button type="button" onClick={() => void refresh()} disabled={loading || switching} aria-label="刷新 Git 状态"><RefreshCw className={loading ? 'spinning' : ''} size={15} /></button>
          <button type="button" onClick={() => setOpen(false)} aria-label="关闭版本面板"><X size={16} /></button>
        </div>
      </div>

      {error ? <div className="git-notice git-notice-error"><AlertTriangle size={15} /><span>{error}</span></div> : null}
      {loading && !git ? <div className="git-loading"><LoaderCircle className="spinning" size={18} /> 正在读取版本…</div> : null}

      {git ? <>
        <div className="git-current-card">
          <div className="git-current-line"><span className="git-status-icon"><GitCommitHorizontal size={15} /></span><strong>{git.branch || 'Detached HEAD'}</strong><code>{git.head.shortSha}</code></div>
          <p title={git.head.subject}>{git.head.subject}</p>
          <div className={`git-worktree-state ${git.clean ? 'is-clean' : 'is-dirty'}`}>
            {git.clean ? <><Check size={13} /> 当前页面已提交</> : <><AlertTriangle size={13} /> {git.changeCount} 项改动，切换时自动提交</>}
          </div>
        </div>

        {!git.clean ? <details className="git-changes"><summary>查看改动文件</summary><ul>{git.changes.map(change => <li key={`${change.code}:${change.file}`}><code>{change.code}</code><span>{change.file}</span></li>)}</ul>{git.changesTruncated ? <p>仅显示前 100 项</p> : null}</details> : null}

        <div className="git-section-title"><span>本地分支</span><small>{git.branches.length}</small></div>
        <div className="git-branch-list" role="listbox" aria-label="选择目标分支">
          {git.branches.map(branch => {
            const disabled = branch.current || branch.occupied || switching;
            return <button className={`git-branch-row${selected === branch.name ? ' is-selected' : ''}`} type="button" key={branch.name} role="option" aria-selected={selected === branch.name} disabled={disabled} onClick={() => setSelected(branch.name)}>
              <span className="git-branch-main"><span>{branch.name}</span><small>{branch.subject}</small></span>
              <span className="git-branch-meta">{branch.current ? '当前' : branch.occupied ? '其他工作树' : branch.shortSha}</span>
            </button>;
          })}
        </div>

        <div className="git-switch-footer">
          <p>{target ? git.clean ? `切换后载入 ${target.name}` : `先自动提交，再切换到 ${target.name}` : '选择一个可用分支'}</p>
          <button type="button" onClick={() => void switchBranch()} disabled={!target || switching}>
            {switching ? <LoaderCircle className="spinning" size={14} /> : <GitBranch size={14} />}
            {switching ? '切换中' : '切换版本'}
          </button>
        </div>

        <details className="git-history"><summary>已提交的页面版本</summary><ol>{git.recentCommits.map(commit => <li key={commit.sha}><code>{commit.shortSha}</code><span>{commit.subject}</span></li>)}</ol></details>
      </> : null}
    </div> : null}
  </aside>;
}
