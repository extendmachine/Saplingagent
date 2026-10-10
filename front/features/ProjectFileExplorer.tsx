import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Copy,
  FileCode2,
  FileQuestion,
  Folder,
  FolderOpen,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  RotateCcw,
  Save,
  Undo2,
  X,
} from 'lucide-react';

type ProjectEntry = {
  path: string;
  absolutePath: string;
  size: number;
  type: 'file' | 'directory' | 'symlink' | 'other';
  writable: boolean;
};

type FileDocument = {
  path: string;
  absolutePath: string;
  content: string;
  hash: string;
  hashScope: 'file' | 'returnedBytes';
  size: number;
  truncated: boolean;
};

type ApiError = Error & { code?: string };

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(value.error?.message || '项目文件操作失败') as ApiError;
    error.code = value.error?.code;
    throw error;
  }
  return value as T;
}

function displayName(filePath: string) {
  const parts = filePath.split(/[\\/]/);
  return parts.at(-1) || filePath;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function looksBinary(content: string) {
  if (content.includes('\0')) return true;
  const replacements = content.match(/\uFFFD/g)?.length || 0;
  return replacements > Math.max(3, content.length / 500);
}

export function ProjectFileExplorer() {
  const [directories, setDirectories] = useState<Record<string, ProjectEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['.']));
  const [selected, setSelected] = useState<ProjectEntry | null>(null);
  const [document, setDocument] = useState<FileDocument | null>(null);
  const [draft, setDraft] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('正在读取项目文件…');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lastChangeId, setLastChangeId] = useState<string | null>(null);

  const dirty = document !== null && draft !== original;
  const binary = useMemo(() => looksBinary(original), [original]);
  const editable = Boolean(document && document.hashScope === 'file' && !document.truncated && !binary && selected?.type === 'file');

  async function loadDirectory(directory: string, refresh = false) {
    if (!refresh && directories[directory]) return;
    const files: ProjectEntry[] = [];
    let cursor = '0';
    do {
      const query = new URLSearchParams({ path: directory, limit: '2000', cursor });
      const page = await requestJson<{ files: ProjectEntry[]; truncated: boolean; nextCursor?: string }>(`/api/project-files?${query}`);
      files.push(...page.files);
      if (!page.truncated || !page.nextCursor) break;
      cursor = page.nextCursor;
    } while (true);
    setDirectories(current => ({ ...current, [directory]: files }));
  }

  useEffect(() => {
    loadDirectory('.')
      .then(() => setNotice('选择文件查看内容'))
      .catch(error => setNotice(error instanceof Error ? error.message : '无法读取项目文件'));
  }, []);

  async function toggleDirectory(entry: ProjectEntry) {
    const next = new Set(expanded);
    if (next.has(entry.path)) next.delete(entry.path);
    else {
      next.add(entry.path);
      try {
        await loadDirectory(entry.path);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '无法展开目录');
      }
    }
    setExpanded(next);
  }

  async function openFile(entry: ProjectEntry, force = false) {
    if (dirty && !force && selected?.path !== entry.path) {
      setNotice('当前文件有未保存修改，请先保存或放弃修改');
      return;
    }
    setSelected(entry);
    setLoading(true);
    setMenuOpen(false);
    setLastChangeId(null);
    try {
      const query = new URLSearchParams({ path: entry.path, maxBytes: String(4 * 1024 * 1024) });
      const next = await requestJson<FileDocument>(`/api/project-files/content?${query}`);
      setDocument(next);
      setDraft(next.content);
      setOriginal(next.content);
      if (next.truncated) setNotice('文件超过 4 MB，当前只预览前 4 MB');
      else if (looksBinary(next.content)) setNotice('二进制文件仅供预览，不能在文本编辑器中保存');
      else if (entry.type === 'symlink') setNotice('符号链接仅供查看，不能从浏览器编辑');
      else setNotice('已打开');
    } catch (error) {
      setDocument(null);
      setDraft('');
      setOriginal('');
      setNotice(error instanceof Error ? error.message : '无法读取文件');
    } finally {
      setLoading(false);
    }
  }

  async function saveFile() {
    if (!selected || !document || !editable || !dirty) return;
    setSaving(true);
    setNotice('正在保存…');
    try {
      const result = await requestJson<{ changeId?: string; status: string }>('/api/project-files/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: selected.path,
          content: draft,
          expectedHash: document.hash,
          reason: '用户在项目文件浏览器中编辑文件',
        }),
      });
      setLastChangeId(result.changeId || null);
      setOriginal(draft);
      const query = new URLSearchParams({ path: selected.path, maxBytes: String(4 * 1024 * 1024) });
      const refreshed = await requestJson<FileDocument>(`/api/project-files/content?${query}`);
      setDocument(refreshed);
      setDraft(refreshed.content);
      setOriginal(refreshed.content);
      setNotice(result.changeId ? '已保存，可恢复本次修改' : '已保存');
      const parent = selected.path.includes('/') ? selected.path.slice(0, selected.path.lastIndexOf('/')) : '.';
      await loadDirectory(parent, true);
    } catch (error) {
      const apiError = error as ApiError;
      setNotice(apiError.code === 'FILE_CHANGED' ? '文件已被其他操作修改；你的编辑仍保留，请重新打开后再合并' : apiError.message);
    } finally {
      setSaving(false);
    }
  }

  async function rollbackLastChange() {
    if (!lastChangeId || !selected) return;
    setSaving(true);
    try {
      await requestJson(`/api/project-files/changes/${lastChangeId}/rollback`, { method: 'POST' });
      setLastChangeId(null);
      setNotice('已恢复保存前的版本');
      await openFile(selected, true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '恢复失败');
    } finally {
      setSaving(false);
    }
  }

  async function copyAbsolutePath() {
    if (!document?.absolutePath) return;
    try {
      await navigator.clipboard.writeText(document.absolutePath);
      setNotice('已复制绝对地址');
      setMenuOpen(false);
    } catch {
      setNotice('浏览器未允许剪贴板访问');
    }
  }

  function discardChanges() {
    setDraft(original);
    setNotice('已放弃未保存修改');
  }

  function renderDirectory(directory: string, depth: number) {
    const entries = directories[directory] || [];
    return entries.map(entry => {
      const isDirectory = entry.type === 'directory';
      const isExpanded = expanded.has(entry.path);
      const isSelected = selected?.path === entry.path;
      return (
        <div key={entry.path}>
          <button
            className={`project-file-row${isSelected ? ' is-selected' : ''}`}
            style={{ paddingLeft: 12 + depth * 16 }}
            onClick={() => isDirectory ? toggleDirectory(entry) : openFile(entry)}
            title={entry.absolutePath}
          >
            {isDirectory ? <ChevronRight className={isExpanded ? 'is-rotated' : ''} size={13} /> : <span className="project-file-spacer" />}
            {isDirectory ? (isExpanded ? <FolderOpen size={15} /> : <Folder size={15} />) : entry.type === 'file' ? <FileCode2 size={14} /> : <FileQuestion size={14} />}
            <span>{displayName(entry.path)}</span>
          </button>
          {isDirectory && isExpanded ? renderDirectory(entry.path, depth + 1) : null}
        </div>
      );
    });
  }

  return (
    <>
      <button className="project-files-mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="打开项目文件">
        <PanelLeftOpen size={18} />
      </button>
      <aside className={`project-files${mobileOpen ? ' is-mobile-open' : ''}`} aria-label="项目文件">
        <div className="project-files-heading">
          <div>
            <strong>项目文件</strong>
            <span>本地工作区</span>
          </div>
          <div className="project-files-heading-actions">
            <button
              onClick={() => loadDirectory('.', true).then(() => setNotice('文件列表已刷新')).catch(error => setNotice(error.message))}
              aria-label="刷新文件"
            >
              <RefreshCw size={15} />
            </button>
            <button className="project-files-mobile-close" onClick={() => setMobileOpen(false)} aria-label="关闭项目文件">
              <PanelLeftClose size={16} />
            </button>
          </div>
        </div>
        <div className="project-file-tree">{renderDirectory('.', 0)}</div>
      </aside>

      <section className={`project-file-detail${document ? ' is-open' : ''}`} aria-label="文件详情">
        {document && selected ? (
          <>
            <header className="project-file-detail-header">
              <div className="project-file-title">
                <FileCode2 size={16} />
                <div>
                  <strong>{displayName(selected.path)}</strong>
                  <span>{selected.path} · {formatBytes(document.size)}</span>
                </div>
              </div>
              <div className="project-file-actions">
                {dirty ? <span className="project-file-unsaved">未保存</span> : null}
                {dirty ? <button onClick={discardChanges} title="放弃修改"><Undo2 size={15} /></button> : null}
                {lastChangeId ? <button onClick={rollbackLastChange} disabled={saving} title="恢复本次保存"><RotateCcw size={15} /></button> : null}
                <button className="project-file-save" onClick={saveFile} disabled={!dirty || !editable || saving}>
                  <Save size={15} />保存
                </button>
                <div className="project-file-menu">
                  <button onClick={() => setMenuOpen(value => !value)} aria-label="更多操作"><MoreHorizontal size={17} /></button>
                  {menuOpen ? (
                    <div className="project-file-menu-popover">
                      <button onClick={copyAbsolutePath}><Copy size={14} />复制绝对地址</button>
                    </div>
                  ) : null}
                </div>
                <button className="project-file-detail-close" onClick={() => {
                  if (dirty) {
                    setNotice('请先保存或放弃当前修改');
                    return;
                  }
                  setDocument(null);
                  setSelected(null);
                }} aria-label="关闭文件"><X size={17} /></button>
              </div>
            </header>
            <textarea
              className="project-file-editor"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              readOnly={!editable}
              spellCheck={false}
              aria-label={`${selected.path} 文件内容`}
            />
          </>
        ) : (
          <div className="project-file-placeholder">{loading ? '正在打开文件…' : '从左侧选择文件查看和编辑内容'}</div>
        )}
        <footer className="project-file-status">{notice}</footer>
      </section>
    </>
  );
}
