import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, GitBranch, GitCommitHorizontal, LoaderCircle, RefreshCw, Save, X } from 'lucide-react';

type CommitInfo = { sha: string; shortSha: string; subject: string; committedAt: string; displayName?: string };
type GitBranchInfo = { name: string; shortSha: string; subject: string; current: boolean; occupied: boolean };
type GitState = {
  repository: string; branch: string | null; detached: boolean; head: CommitInfo | null; unborn?: boolean; version: string; fingerprint: string;
  clean: boolean; changeCount: number; changes: Array<{ code: string; file: string }>; changesTruncated: boolean;
  branches: GitBranchInfo[]; recentCommits: CommitInfo[]; historyTruncated?: boolean;
  autoCommit?: CommitInfo | null; savedCommit?: CommitInfo | null;
};
type Target = { kind: 'branch' | 'commit'; id: string };

async function requestGit(url = '/api/git', init?: RequestInit): Promise<GitState> {
  const response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const value = await response.json().catch(() => ({}));
  if (!response.ok || !value.git) throw new Error(value.error?.message || `Git service returned ${response.status}`);
  return value.git;
}

export function GitVersionPanel() {
  const [open, setOpen] = useState(false);
  const [git, setGit] = useState<GitState | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [limit, setLimit] = useState(25);
  const alive = useRef(true);
  const epoch = useRef(0);
  const mutation = useRef(false);

  const refresh = useCallback(async (quiet = false) => {
    if (mutation.current) return;
    const request = ++epoch.current;
    if (!quiet) setLoading(true);
    try {
      const next = await requestGit(`/api/git?limit=${limit}`);
      if (!alive.current || epoch.current !== request) return;
      setGit(next); setError('');
      if (!next.head) { setTarget(null); setName(''); setMessage(''); }
    } catch (nextError) {
      if (alive.current && epoch.current === request) setError(nextError instanceof Error ? nextError.message : 'Unable to read versions');
    } finally {
      if (alive.current && epoch.current === request) setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(true); }, 5000);
    const visible = () => { if (!document.hidden) void refresh(true); };
    document.addEventListener('visibilitychange', visible);
    return () => { alive.current = false; ++epoch.current; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);

  const selectedCommit = target?.kind === 'commit' ? (git?.recentCommits.find(commit => commit.sha === target.id) || (git?.head?.sha === target.id ? git.head : undefined)) : undefined;
  const selectedBranch = target?.kind === 'branch' ? git?.branches.find(branch => branch.name === target.id) : undefined;
  const canSwitch = Boolean(selectedCommit ? selectedCommit.sha !== git?.head?.sha : selectedBranch && !selectedBranch.current && !selectedBranch.occupied);

  const choose = (commit: CommitInfo) => { setTarget({ kind: 'commit', id: commit.sha }); setName(commit.displayName || ''); setMessage(''); };
  const mutate = async (operation: 'commit' | 'switch' | 'checkout' | 'label', input?: object) => {
    if (mutation.current) return;
    mutation.current = true; ++epoch.current; setBusy(operation); setLoading(false); setError(''); setMessage('');
    try {
      const next = await requestGit(`/api/git/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, ...(input ? { body: JSON.stringify(input) } : {}) });
      if (!alive.current) return;
      const expanded = await requestGit(`/api/git?limit=${limit}`);
      if (!alive.current) return;
      setGit({ ...next, ...expanded });
      if (operation === 'label') { setMessage(name.trim() ? 'Version name saved' : 'Version name cleared'); }
      else if (operation === 'commit') { if (next.head) choose(next.head); setMessage(next.savedCommit ? `Saved version ${next.savedCommit.shortSha}` : 'Current version saved'); }
      else { setMessage('Version loaded. Reloading page…'); window.setTimeout(() => window.location.reload(), 700); }
    } catch (nextError) {
      if (alive.current) setError(nextError instanceof Error ? nextError.message : 'Version operation failed');
    } finally { mutation.current = false; if (alive.current) setBusy(''); }
  };
  const switchVersion = () => {
    if (!target || !canSwitch) return;
    window.dispatchEvent(new Event('saplingagent:before-restart'));
    void mutate(target.kind === 'branch' ? 'switch' : 'checkout', target.kind === 'branch' ? { branch: target.id } : { sha: target.id });
  };
  const label = git ? (git.head ? `${git.branch || 'Version'} · ${git.head.displayName || git.head.shortSha}` : git.branch || 'Versions') : 'Versions';

  return <aside className={`git-version-anchor${open ? ' is-open' : ''}`} aria-label="Git version management">
    <button className="git-version-trigger" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <GitBranch size={15} aria-hidden="true" /><span title={label}>{label}</span>
      {git && !git.clean ? <span className="git-dirty-dot" title={`${git.changeCount} changes`} /> : null}
      <ChevronDown className="git-trigger-chevron" size={14} aria-hidden="true" />
    </button>
    {open ? <div className="git-version-popover">
      <div className="git-version-heading">
        <div><span className="git-eyebrow">{git?.repository || 'Current folder'}</span><strong>Versions</strong></div>
        <div className="git-heading-actions">
          <button className="git-save-button" type="button" onClick={() => void mutate('commit')} disabled={!git || git.clean || Boolean(busy)} aria-label="Save current version"><Save size={14} /><span>{busy === 'commit' ? 'Saving' : 'Save version'}</span></button>
          <button type="button" onClick={() => void refresh()} disabled={loading || Boolean(busy)} aria-label="Refresh Git status"><RefreshCw size={15} /></button>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close version panel"><X size={16} /></button>
        </div>
      </div>
      {error ? <div className="git-notice git-notice-error" role="alert"><AlertTriangle size={15} /><span>{error}</span></div> : null}
      {message ? <div className="git-notice git-notice-success" role="status"><Check size={15} /><span>{message}</span></div> : null}
      {loading && !git ? <div className="git-loading"><LoaderCircle className="spinning" size={18} /> Loading versions…</div> : null}
      {git ? <>
        <div className="git-current-card">
          <div className="git-current-line"><GitCommitHorizontal size={15} /><strong>{git.head?.displayName || git.branch || 'Historical version'}</strong><code>{git.head?.shortSha}</code></div>
          <p title={git.head?.subject}>{git.head?.subject || 'No commits yet. Use Save version to create your first local version.'}</p>
          <div className={`git-worktree-state ${git.clean ? 'is-clean' : 'is-dirty'}`}>{git.clean ? <><Check size={13} /> {git.head ? 'Current page committed' : 'No local commits'}</> : <><AlertTriangle size={13} /> {git.changeCount} changes, saved before switching</>}</div>
          <button className="git-edit-current" type="button" onClick={() => { if (git.head) choose(git.head); }} disabled={!git.head || Boolean(busy)}>Name current version</button>
        </div>
        {!git.clean ? <details className="git-changes"><summary>View changed files</summary><ul>{git.changes.map(change => <li key={`${change.code}:${change.file}`}><code>{change.code}</code><span>{change.file}</span></li>)}</ul>{git.changesTruncated ? <p>Showing the first 100 changes</p> : null}</details> : null}
        <div className="git-section-title"><span>Committed versions</span><small>{git.recentCommits.length}</small></div>
        <div className="git-commit-list" aria-label="Committed versions">
          {!git.head ? <p className="git-empty-history">No commits yet</p> : null}
          {git.recentCommits.map(commit => <button className={`git-branch-row${selectedCommit?.sha === commit.sha ? ' is-selected' : ''}`} type="button" key={commit.sha} disabled={Boolean(busy)} aria-pressed={selectedCommit?.sha === commit.sha} onClick={() => choose(commit)}>
            <span className="git-branch-main"><span title={commit.displayName || commit.subject}>{commit.displayName || commit.subject}</span><small>{new Date(commit.committedAt).toLocaleString('en-US')} {commit.displayName ? `· ${commit.subject}` : ''}</small></span>
            <span className="git-branch-meta">{commit.sha === git.head?.sha ? 'Current · ' : ''}{commit.shortSha}</span>
          </button>)}
        </div>
        {git.historyTruncated && limit < 500 ? <button className="git-load-more" type="button" disabled={Boolean(busy) || loading} onClick={() => setLimit(value => Math.min(500, value + 25))}>Load older versions</button> : null}
        {selectedCommit ? <form className="git-name-form" onSubmit={event => { event.preventDefault(); void mutate('label', { sha: selectedCommit.sha, name }); }}>
          <label htmlFor="git-version-name">Version name <code>{selectedCommit.shortSha}</code></label>
          <div><input id="git-version-name" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Chat baseline" maxLength={80} disabled={Boolean(busy)} /><button type="submit" disabled={Boolean(busy) || name.trim() === (selectedCommit.displayName || '')}>{busy === 'label' ? 'Saving' : 'Save name'}</button></div>
          <p>A display name for this commit. Leave empty to clear it.</p>
        </form> : null}
        <div className="git-section-title"><span>Branches</span></div>
        <div className="git-branch-list" aria-label="Local branches">
          {git.branches.map(branch => <button className={`git-branch-row${target?.kind === 'branch' && target.id === branch.name ? ' is-selected' : ''}`} type="button" key={branch.name} disabled={branch.current || branch.occupied || Boolean(busy)} onClick={() => { setTarget({ kind: 'branch', id: branch.name }); setMessage(''); }}>
            <span className="git-branch-main"><span>{branch.name}</span><small>{branch.subject}</small></span><span className="git-branch-meta">{branch.current ? 'Current' : branch.occupied ? 'Other worktree' : branch.shortSha}</span>
          </button>)}
        </div>
        <div className="git-switch-footer"><p>{selectedCommit ? `Load ${selectedCommit.displayName || selectedCommit.shortSha} as a historical version.` : selectedBranch ? `Switch to ${selectedBranch.name}.` : 'Select a version or branch.'}<br />Pending changes are saved first. After switching, use Restart app to load frontend and backend.</p><button type="button" onClick={switchVersion} disabled={!canSwitch || Boolean(busy)}>{busy === 'switch' || busy === 'checkout' ? <LoaderCircle className="spinning" size={14} /> : <GitBranch size={14} />}{busy === 'switch' || busy === 'checkout' ? 'Switching' : 'Switch version'}</button></div>
      </> : null}
    </div> : null}
  </aside>;
}
