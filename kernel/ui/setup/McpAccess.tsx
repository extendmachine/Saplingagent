import {ErrorNotice, Notice, msg, setupError, type Language, type Translation, type Message} from './localization';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { exportMcpConfiguration, mcpSettingsChanged, saveMcpSettings, type ConfigRequest, type McpSettings, type McpState } from './mcp-access';

export type McpAccessHandle = { save: () => Promise<void>; refresh: () => Promise<void> };
export type McpAccessStatus = { dirty: boolean; busy: boolean };
type Props = {
  request: ConfigRequest;
  t: Translation;
  language: Language;
  disabled: boolean;
  refreshKey: string;
  onSaved: (state: McpState) => void;
  onStatus: (status: McpAccessStatus) => void;
};

export const McpAccess = forwardRef<McpAccessHandle, Props>(function McpAccess({ request, t, language, disabled, refreshKey, onSaved, onStatus }, ref) {
  const [state, setState] = useState<McpState | null>(null);
  const [draft, setDraft] = useState<McpSettings | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null), [notice, setNotice] = useState<Message|null>(null);
  const lock = useRef(false), dirtyRef = useRef(false), refreshSequence = useRef(0);
  const dirty = mcpSettingsChanged(state, draft);
  dirtyRef.current = dirty;
  useEffect(() => { onStatus({ dirty, busy }); }, [dirty, busy, onStatus]);
  function accept(value: McpState, replaceDraft = false) {
    setState(value);
    if (replaceDraft || !dirtyRef.current) setDraft({ revision: value.revision, enabled: value.enabled, externalOnly: value.externalOnly });
    onSaved(value);
  }
  async function refresh() {
    const sequence = ++refreshSequence.current;
    try {
      const value: McpState = await request('mcp');
      if (sequence === refreshSequence.current && !lock.current) { accept(value); setError(null); }
    } catch (issue) { if (sequence === refreshSequence.current) setError(issue); }
  }
  useEffect(() => { void refresh(); return () => { refreshSequence.current++; }; }, [refreshKey, request]);
  async function operation(work: () => Promise<void>) {
    if (lock.current) throw setupError("mcp.wait.for.the.current.mcp.operation");
    lock.current = true; refreshSequence.current++; setBusy(true); setError(null); setNotice(null);
    try { await work(); }
    catch (issue) { setError(issue); throw issue; }
    finally { lock.current = false; setBusy(false); }
  }
  async function save() {
    if (!dirty) return;
    if (!draft) throw setupError("mcp.read.mcp.settings.before.saving");
    await operation(async () => {
      accept(await saveMcpSettings(request, draft), true);
      setNotice(msg("mcp.mcp.settings.saved.choose.save.build.app"));
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
          } catch { throw setupError("mcp.could.not.copy.download.the.json.or"); }
        } else {
          const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
          const link = document.createElement('a');
          try { link.href = url; link.download = 'saplingagent-mcp.json'; document.body.append(link); link.click(); }
          finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
        }
      });
      accept(value, true);
      setNotice(kind === 'copy' ? msg("mcp.current.mcp.configuration.copied.add.it.to") : msg("mcp.json.download.requested.add.this.configuration.to"));
    });
  }
  const blocked = disabled || busy;
  return <div className="mcp-access">
    <h2>{t("mcp.connect.your.own.ai.client")}</h2>
    <p>{t("mcp.let.an.external.ai.client.use.this")}</p>
    <p className="note mcp-permissions">{t("mcp.full.access.read.and.write.files.run")}</p>
    {!draft ? <p role="status">{t("mcp.reading.mcp.settings")}</p> : <>
      <label className="check"><input type="checkbox" checked={draft.enabled} disabled={blocked} onChange={event => setDraft({ ...draft, enabled: event.target.checked, externalOnly: event.target.checked && draft.externalOnly })}/>{t("mcp.enable.external.ai.mcp.access")}</label>
      <label className="check"><input type="checkbox" checked={draft.externalOnly} disabled={blocked || !draft.enabled} onChange={event => setDraft({ ...draft, externalOnly: event.target.checked })}/>{t("mcp.use.only.my.external.ai.client.skip")}</label>
      {draft.externalOnly && <p className="message progress">{t("mcp.mcp.does.not.supply.a.model.for")}</p>}
      <div className="buttons"><button type="button" disabled={blocked || !dirty} onClick={() => void save().catch(() => {})}>{t("mcp.save.mcp.settings")}</button><button type="button" className="quiet" disabled={blocked} onClick={() => { dirtyRef.current = false; void refresh(); }}>{t("mcp.reload.saved.mcp.settings")}</button></div>
    </>}
    <ErrorNotice issue={error} language={language}/>
    <Notice value={notice} language={language}/>
    {state?.warnings.map((warning, index) => <div className="note" key={index}>{warning.code === 'PROJECT_LOCAL_NODE_REQUIRED' ? t("mcp.install.or.repair.this.project.to.prepare") : warning.code === 'MCP_DEPENDENCIES_REQUIRED' ? t("mcp.install.or.repair.the.kernel.to.prepare") : <ErrorNotice issue={warning} language={language}/>}</div>)}
    <h3>{t("mcp.client.configuration")}</h3>
    <p className="hint">{t("mcp.save.and.build.first.after.renaming.or")}</p>
    {state?.enabled && state.available && <pre className="mcp-json" tabIndex={0} aria-label={t("mcp.mcp.client.json")}>{JSON.stringify(state.configuration, null, 2)}</pre>}
    {state && !state.enabled && <p className="muted">{t("mcp.mcp.access.is.disabled")}</p>}
    {state?.enabled && !state.available && <p className="muted">{t("mcp.repair.the.kernel.dependencies.before.connecting")}</p>}
    <div className="buttons"><button type="button" className="quiet" disabled={blocked || dirty || !state?.enabled || !state.available} onClick={() => void exportConfiguration('copy').catch(() => {})}>{t("mcp.copy.json")}</button><button type="button" className="quiet" disabled={blocked || dirty || !state?.enabled || !state.available} onClick={() => void exportConfiguration('download').catch(() => {})}>{t("mcp.download.json")}</button></div>
    <p className="note">{t("mcp.disconnect.this.mcp.server.in.your.ai")}</p>
  </div>;
});
