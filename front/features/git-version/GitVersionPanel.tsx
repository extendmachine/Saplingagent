import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, GitBranch, GitCommitHorizontal, LoaderCircle, RefreshCw, Save, X } from 'lucide-react';

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
  version: string;
  fingerprint: string;
  clean: boolean;
  changeCount: number;
  changes: Array<{ code: string; file: string; from?: string }>;
  changesTruncated: boolean;
  branches: GitBranchInfo[];
  recentCommits: Array<{ shortSha: string; sha: string; committedAt: string; subject: string }>;
  autoCommit?: { shortSha: string; sha: string; subject: string } | null;
  savedCommit?: { shortSha: string; sha: string; subject: string } | null;
};

class GitRequestError extends Error {
  code?: string;
}

async function requestGit(url = '/api/git', init?: RequestInit): Promise<GitState> {
  const response = await fetch(url, init);
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new GitRequestError(value.error?.message || `Git service returned ${response.status}`);
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
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
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
      if (alive.current) setError(nextError instanceof Error ? nextError.message : 'Unable to read Git status');
    } finally {
      if (alive.current && !quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden && !switching && !saving) void refresh(true); }, 5000);
    const onVisible = () => { if (!document.hidden) void refresh(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive.current = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh, saving, switching]);

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
      if (alive.current) setError(nextError instanceof Error ? nextError.message : 'Unable to switch versions');
    } finally {
      if (alive.current) setSwitching(false);
    }
  };

  const saveVersion = async () => {
    if (!git || git.clean || saving || switching) return;
    setSaving(true);
    setError('');
    setSavedMessage('');
    try {
      const next = await requestGit('/api/git/commit', { method: 'POST' });
      if (!alive.current) return;
      setGit(next);
      setSavedMessage(next.savedCommit ? `Saved version ${next.savedCommit.shortSha}` : 'Current version saved');
    } catch (nextError) {
      if (alive.current) setError(nextError instanceof Error ? nextError.message : 'Unable to save version');
    } finally {
      if (alive.current) setSaving(false);
    }
  };

  const currentLabel = git?.branch || (git ? `detached · ${git.head.shortSha}` : 'Git');
  const target = git?.branches.find(branch => branch.name === selected);

  return <aside className={`git-version-anchor${open ? ' is-open' : ''}`} aria-label="Git version management">
    <button className="git-version-trigger" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <GitBranch size={15} aria-hidden="true" />
      <span>{currentLabel}</span>
      {git && !git.clean ? <span className="git-dirty-dot" title={`${git.changeCount} changes`} /> : null}
      <ChevronDown className="git-trigger-chevron" size={14} aria-hidden="true" />
    </button>

    {open ? <div className="git-version-popover">
      <div className="git-version-heading">
        <div>
          <span className="git-eyebrow">{git?.repository || 'Current folder'}</span>
          <strong>Git versions</strong>
        </div>
        <div className="git-heading-actions">
          <button className="git-save-button" type="button" onClick={() => void saveVersion()} disabled={!git || git.clean || saving || switching} title={git?.clean ? 'Current version saved' : 'Save and commit current version'} aria-label="Save and commit current version">{saving ? <LoaderCircle className="spinning" size={14} /> : <Save size={14} />}<span>{saving ? 'Saving' : 'Save commit'}</span></button>
          <button type="button" onClick={() => void refresh()} disabled={loading || switching || saving} aria-label="Refresh Git status"><RefreshCw className={loading ? 'spinning' : ''} size={15} /></button>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close version panel"><X size={16} /></button>
        </div>
      </div>

      {error ? <div className="git-notice git-notice-error"><AlertTriangle size={15} /><span>{error}</span></div> : null}
      {savedMessage ? <div className="git-notice git-notice-success"><Check size={15} /><span>{savedMessage}</span></div> : null}
      {loading && !git ? <div className="git-loading"><LoaderCircle className="spinning" size={18} /> Loading version…</div> : null}

      {git ? <>
        <div className="git-current-card">
          <div className="git-current-line"><span className="git-status-icon"><GitCommitHorizontal size={15} /></span><strong>{git.branch || 'Detached HEAD'}</strong><code>{git.head.shortSha}</code></div>
          <p title={git.head.subject}>{git.head.subject}</p>
          <div className={`git-worktree-state ${git.clean ? 'is-clean' : 'is-dirty'}`}>
            {git.clean ? <><Check size={13} /> Current page committed</> : <><AlertTriangle size={13} /> {git.changeCount} changes, will be committed before switching</>}
          </div>
        </div>

        {!git.clean ? <details className="git-changes"><summary>View changed files</summary><ul>{git.changes.map(change => <li key={`${change.code}:${change.file}`}><code>{change.code}</code><span>{change.file}</span></li>)}</ul>{git.changesTruncated ? <p>Showing the first 100 changes</p> : null}</details> : null}

        <div className="git-section-title"><span>Local branches</span><small>{git.branches.length}</small></div>
        <div className="git-branch-list" role="listbox" aria-label="Select target branch">
          {git.branches.map(branch => {
            const disabled = branch.current || branch.occupied || switching;
            return <button className={`git-branch-row${selected === branch.name ? ' is-selected' : ''}`} type="button" key={branch.name} role="option" aria-selected={selected === branch.name} disabled={disabled} onClick={() => setSelected(branch.name)}>
              <span className="git-branch-main"><span>{branch.name}</span><small>{branch.subject}</small></span>
              <span className="git-branch-meta">{branch.current ? 'Current' : branch.occupied ? 'Other worktree' : branch.shortSha}</span>
            </button>;
          })}
        </div>

        <div className="git-switch-footer">
          <p>{target ? git.clean ? `Load after switching: ${target.name}` : `Commit changes, then switch to ${target.name}` : 'Select an available branch'}</p>
          <button type="button" onClick={() => void switchBranch()} disabled={!target || switching}>
            {switching ? <LoaderCircle className="spinning" size={14} /> : <GitBranch size={14} />}
            {switching ? 'Switching' : 'Switch version'}
          </button>
        </div>

        <details className="git-history"><summary>Committed page versions</summary><ol>{git.recentCommits.map(commit => <li key={commit.sha}><code>{commit.shortSha}</code><span>{commit.subject}</span></li>)}</ol></details>
      </> : null}
    </div> : null}
  </aside>;
}
