import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { exportMcpConfiguration, mcpSettingsChanged, saveMcpSettings, type ConfigRequest, type McpSettings, type McpState } from './mcp-access';

export type McpAccessHandle = { save: () => Promise<void>; refresh: () => Promise<void> };
export type McpAccessStatus = { dirty: boolean; busy: boolean };
type Props = {
  request: ConfigRequest;
  t: (en: string, zh: string) => string;
  disabled: boolean;
  refreshKey: string;
  onSaved: (state: McpState) => void;
  onStatus: (status: McpAccessStatus) => void;
};

export const McpAccess = forwardRef<McpAccessHandle, Props>(function McpAccess({ request, t, disabled, refreshKey, onSaved, onStatus }, ref) {
  const [state, setState] = useState<McpState | null>(null);
  const [draft, setDraft] = useState<McpSettings | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const lock = useRef(false), dirtyRef = useRef(false), refreshSequence = useRef(0);
  const dirty = mcpSettingsChanged(state, draft);
  dirtyRef.current = dirty;
  useEffect(() => { onStatus({ dirty, busy }); }, [dirty, busy, onStatus]);
  function accept(value: McpState, replaceDraft = false) {
    setState(value);
    if (replaceDraft || !dirtyRef.current) setDraft({ revision: value.revision, enabled: value.enabled, externalOnly: value.externalOnly });
    onSaved(value);
  }
  function message(issue: unknown) {
    const value = issue as Error & { code?: string };
    if (value.code === 'CONFIG_CHANGED') return t('MCP settings changed elsewhere. Refresh, review your choices and save again.', 'MCP 设置已在其他位置更改，请刷新、核对选项后重新保存。');
    if (value.code === 'MCP_DISABLED') return t('Enable and save MCP access first.', '请先启用并保存 MCP 接入。');
    if (value.code === 'MCP_UNAVAILABLE') return t('MCP dependencies are unavailable. Repair the kernel before connecting.', 'MCP 依赖尚不可用，请先修复内核，再连接。');
    return value.message || t('MCP configuration failed. Retry after checking the local service.', 'MCP 配置失败，请检查本地服务后重试。');
  }
  async function refresh() {
    const sequence = ++refreshSequence.current;
    try {
      const value: McpState = await request('mcp');
      if (sequence === refreshSequence.current && !lock.current) { accept(value); setError(''); }
    } catch (issue) { if (sequence === refreshSequence.current) setError(message(issue)); }
  }
  useEffect(() => { void refresh(); return () => { refreshSequence.current++; }; }, [refreshKey, request]);
  async function operation(work: () => Promise<void>) {
    if (lock.current) throw Error(t('Wait for the current MCP operation.', '请等待当前 MCP 操作完成。'));
    lock.current = true; refreshSequence.current++; setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (issue) { setError(message(issue)); throw issue; }
    finally { lock.current = false; setBusy(false); }
  }
  async function save() {
    if (!dirty) return;
    if (!draft) throw Error(t('Read MCP settings before saving.', '请先读取 MCP 设置。'));
    await operation(async () => {
      accept(await saveMcpSettings(request, draft), true);
      setNotice(t('MCP settings saved. Choose Save & build app to apply this configuration.', 'MCP 设置已保存。请点击“保存并构建应用”应用本次配置。'));
    });
  }
  useImperativeHandle(ref, () => ({ save, refresh }));
  async function exportConfiguration(kind: 'copy' | 'download') {
    await operation(async () => {
      const value = await exportMcpConfiguration(request, async json => {
        if (kind === 'copy') {
          try {
            if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable');
            await navigator.clipboard.writeText(json);
          } catch { throw Error(t('Could not copy. Download the JSON or select the configuration text manually.', '复制失败，请下载 JSON，或手动选择并复制配置文本。')); }
        } else {
          const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
          const link = document.createElement('a');
          try { link.href = url; link.download = 'saplingagent-mcp.json'; document.body.append(link); link.click(); }
          finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
        }
      });
      accept(value, true);
      setNotice(kind === 'copy' ? t('Current MCP configuration copied. Add it to your AI client.', '已复制当前 MCP 配置，请添加到你的 AI 客户端。') : t('JSON download requested. Add this configuration to your AI client.', '已请求下载 JSON，请将此配置添加到你的 AI 客户端。'));
    });
  }
  const blocked = disabled || busy;
  return <div className="mcp-access">
    <h2>{t('Connect your own AI client', '连接你自己的 AI 客户端')}</h2>
    <p>{t('Let an external AI client use this project through MCP. No built-in model account is needed; the stdio service works without opening the app.', '通过 MCP 让外部 AI 客户端使用此项目。无需内置模型账号；不打开应用也能使用 stdio 服务。')}</p>
    <p className="note mcp-permissions">{t('Full Access: read and write files, run shell commands, and read project context and Skills with your current OS user permissions, including accessible paths outside this project. This does not grant root or administrator rights. Your AI client still controls its own approvals.', 'Full Access：以当前系统用户权限读写文件、执行 shell 命令、读取项目上下文和 Skills，包括可访问的项目外路径；不会获得 root 或管理员权限。AI 客户端仍自行管理审批。')}</p>
    {!draft ? <p role="status">{t('Reading MCP settings…', '正在读取 MCP 设置…')}</p> : <>
      <label className="check"><input type="checkbox" checked={draft.enabled} disabled={blocked} onChange={event => setDraft({ ...draft, enabled: event.target.checked, externalOnly: event.target.checked && draft.externalOnly })}/>{t('Enable external AI / MCP access', '启用外部 AI / MCP 接入')}</label>
      <label className="check"><input type="checkbox" checked={draft.externalOnly} disabled={blocked || !draft.enabled} onChange={event => setDraft({ ...draft, externalOnly: event.target.checked })}/>{t('Use only my external AI client — skip built-in model login', '仅使用自己的外部 AI 客户端 — 跳过内置模型登录')}</label>
      {draft.externalOnly && <p className="message progress">{t('MCP does not supply a model for web chat. Without a configured built-in provider, converse in your own AI client. Saved account/API schemes can still power web chat; saving one does not change your MCP choices.', 'MCP 不为网页聊天提供模型。未配置内置服务商时，请在自己的 AI 客户端中对话。已有账号/API 方案仍可用于网页聊天，保存方案不会改变 MCP 选项。')}</p>}
      <div className="buttons"><button type="button" disabled={blocked || !dirty} onClick={() => void save().catch(() => {})}>{t('Save MCP settings', '保存 MCP 设置')}</button><button type="button" className="quiet" disabled={blocked} onClick={() => { dirtyRef.current = false; void refresh(); }}>{t('Reload saved MCP settings', '重新读取已保存 MCP 设置')}</button></div>
    </>}
    {error && <div className="message error" role="alert">{error}</div>}
    {notice && <div className="message success" role="status">{notice}</div>}
    {state?.warnings.map((warning, index) => <p className="note" key={index}>{warning.code === 'PROJECT_LOCAL_NODE_REQUIRED' ? t('Install or repair this project to prepare its local Node runtime.', '请安装或修复此项目，准备项目本地 Node 运行环境。') : warning.code === 'MCP_DEPENDENCIES_REQUIRED' ? t('Install or repair the kernel to prepare MCP source and dependencies.', '请安装或修复内核，准备 MCP 源码与依赖。') : warning.message}</p>)}
    <h3>{t('Client configuration', '客户端配置')}</h3>
    <p className="hint">{t('Save and build first. After renaming or exporting the app, this configuration refreshes for the final folder. Copy or download it again and replace old paths in your external client. Nothing is written to global client settings.', '请先保存并构建。重命名或导出应用后，配置会刷新为最终文件夹路径。请重新复制或下载，并更新外部客户端中的旧路径；此页面不会写入全局客户端设置。')}</p>
    {state?.enabled && state.available && <pre className="mcp-json" tabIndex={0} aria-label={t('MCP client JSON', 'MCP 客户端 JSON')}>{JSON.stringify(state.configuration, null, 2)}</pre>}
    {state && !state.enabled && <p className="muted">{t('MCP access is disabled.', 'MCP 接入已关闭。')}</p>}
    {state?.enabled && !state.available && <p className="muted">{t('Repair the kernel dependencies before connecting.', '连接前请先修复内核依赖。')}</p>}
    <div className="buttons"><button type="button" className="quiet" disabled={blocked || dirty || !state?.enabled || !state.available} onClick={() => void exportConfiguration('copy').catch(() => {})}>{t('Copy JSON', '复制 JSON')}</button><button type="button" className="quiet" disabled={blocked || dirty || !state?.enabled || !state.available} onClick={() => void exportConfiguration('download').catch(() => {})}>{t('Download JSON', '下载 JSON')}</button></div>
    <p className="note">{t('Disconnect this MCP server in your AI client before kernel maintenance, renaming or moving the folder, especially on Windows where running processes may hold files open. Reconnect using the refreshed configuration afterward.', '内核维护、重命名或移动文件夹前，请先在 AI 客户端断开此 MCP 服务，尤其是 Windows 上运行进程可能占用文件。完成后使用刷新后的配置重新连接。')}</p>
  </div>;
});
