import {ErrorNotice, Notice, msg, setupError, type Language, type Translation, type Message} from './localization';
import React, { useEffect, useRef, useState } from "react";
import { acceptedConfigurationJob, restartedFinalization, setupAvailability, type SetupReadiness } from "./setup-flow";
export type ProjectSetupState = { ready: boolean; busy: boolean; external: boolean; finishReady: boolean; artifact?: string };
type T = Translation;
type Project = {
  name: string;
  folderName: string;
  projectId?: string;
  icon?: string | null;
};
type Snapshot = SetupReadiness & {
  kernelVersion?: string;
  root: string;
  canRename: boolean;
  directoryReady: boolean;
  project: Project;
  device: { platform: string; arch: string };
  job?: {
    id: string;
    kind: string;
    phase: string;
    message: string;
    lines: string[];
    result?: { artifact?: string; url?: string };
    error?: { code?: string; message: string };
  };
  launcher?: { artifact: string; compiledAt: string };
  runtime: { phase: string; url?: string; error?: { message: string } };
};
export function ProjectSetup({
  request,
  t,
  language,
  aiReady,
  aiBusy = false,
  onDirectoryState,
  onPrepared,
  onSaveSettings,
  onValidateSettings,
  onFinish,
  aiDirty = false,
  configurationRevision,
  onLocationChanged,
  children,
}: {
  children?: React.ReactNode;
  request: (route: string, body?: unknown) => Promise<any>;
  t: T;
  language: Language;
  aiReady: boolean;
  aiBusy?: boolean;
  onDirectoryState?: (state: ProjectSetupState) => void;
  onPrepared?: () => Promise<void> | void;
  onSaveSettings?: () => Promise<void>;
  onValidateSettings?: () => void;
  onFinish?: () => void;
  aiDirty?: boolean;
  configurationRevision?: number | string;
  onLocationChanged?: (key: string) => void;
}) {
  const [state, setState] = useState<Snapshot | null>(null),
    [name, setName] = useState(""),
    [folder, setFolder] = useState(""),
    [icon, setIcon] = useState<string | null | undefined>(),
    [rename, setRename] = useState(true),
    [confirmedRename, setConfirmedRename] = useState(true),
    [handoff, setHandoff] = useState<{ id: string; started: number } | null>(null),
    [waitingLong, setWaitingLong] = useState(false),
    [syncingRevision, setSyncingRevision] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [notice, setNotice] = useState<Message|null>(null);
  const initialized = useRef(false),
    localOperation = useRef(false),
    previousRevision = useRef(configurationRevision),
    picker = useRef<HTMLInputElement>(null);
  const running = state?.job?.phase === "running";
  const external = state?.configurationHost === "external";
  useEffect(() => {
    if (state?.root) onLocationChanged?.(JSON.stringify([state.root, state.launcher?.artifact, state.launcher?.compiledAt]));
  }, [state?.root, state?.launcher?.artifact, state?.launcher?.compiledAt, onLocationChanged]);
  async function refresh() {
    const value: Snapshot = await request("project");
    setState(value);
    if (value.configurationHost !== "external" && ["waiting-release", "restarting"].includes(value.finalization?.phase || "")) {
      setHandoff((current) => current || { id: value.finalization!.id, started: Date.now() });
    }
    if (!initialized.current) {
      setName(value.project.name);
      setFolder(value.project.folderName);
      const renameFolder = value.canRename;
      setRename(renameFolder);
      setConfirmedRename(renameFolder);
      initialized.current = true;
    }
    return value;
  }
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        if (!stopped && !localOperation.current && !handoff) await refresh();
      } catch (e) {
        if (!stopped && !localOperation.current && !handoff) setError(e);
      }
      if (!stopped) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [handoff]);
  useEffect(() => {
    if (!handoff) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function pollRestart() {
      try {
        const response = await fetch("/health/project-launcher", { cache: "no-store", signal: AbortSignal.timeout(3000) });
        if (response.ok && restartedFinalization(await response.json(), handoff!.id)) {
          if (!stopped) window.location.reload();
          return;
        }
      } catch {
        // The old management process must exit. Connection loss is expected
        // until the external helper starts the new management instance.
      }
      if (!stopped) {
        if (Date.now() - handoff!.started > 120_000) setWaitingLong(true);
        timer = setTimeout(pollRestart, 1000);
      }
    }
    void pollRestart();
    return () => { stopped = true; clearTimeout(timer); };
  }, [handoff]);
  useEffect(() => {
    if (previousRevision.current === configurationRevision) return;
    previousRevision.current = configurationRevision;
    if (handoff || localOperation.current) return;
    let stopped = false;
    setSyncingRevision(true);
    void refresh().catch((e) => { if (!stopped) setError(e); }).finally(() => { if (!stopped) setSyncingRevision(false); });
    return () => { stopped = true; };
  }, [configurationRevision, handoff]);
  async function action(work: () => Promise<void>) {
    localOperation.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      if (!localOperation.current) return;
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      localOperation.current = false;
      setBusy(false);
    }
  }
  async function saveIdentity() {
    await request("project/save", {
      name,
      folderName: folder,
      renameFolder: rename && !!state?.canRename,
      ...(icon === undefined ? {} : { iconData: icon }),
    });
    setIcon(undefined);
    const value = await refresh();
    setName(value.project.name);
    setFolder(value.project.folderName);
    setConfirmedRename(rename);
    await onPrepared?.();
  }
  function beginFinalization() {
    // Validate while inputs are still enabled. HTML validation deliberately
    // ignores controls inside the disabled fieldset used during the handoff.
    try { onValidateSettings?.(); }
    catch (e) { setError(e); return; }
    void action(finalize);
  }
  async function finalize() {
    await saveIdentity();
    await onSaveSettings?.();
    const result = await request("project/finalize", {});
    if (external) {
      const job = acceptedConfigurationJob(result);
      if (!job) throw setupError("project.the.build.was.not.accepted.refresh.status");
      // B remains alive at the same URL and token. Continue normal project
      // polling; only the returned project state can confirm the final root.
      setState((current) => current && { ...current, exportReady: false, job: { ...result.job, ...job } });
      return;
    }
    if (!result.finalization?.id)
      throw setupError("project.restart.was.not.accepted.reload.status.before");
    setHandoff({ id: result.finalization.id, started: Date.now() });
    // The accepted handoff closes this server. Do not refresh with its expiring
    // configuration token; only the unauthenticated readiness check is valid.
    localOperation.current = false;
  }
  async function choose(file?: File) {
    if (!file) return;
    await action(async () => {
      if (
        file.size > 4 * 1024 * 1024 ||
        !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      )
        throw setupError("project.choose.a.png.jpeg.or.webp.image");
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw setupError('project.image.unavailable');
        const size = Math.min(bitmap.width, bitmap.height);
        ctx.drawImage(
          bitmap,
          (bitmap.width - size) / 2,
          (bitmap.height - size) / 2,
          size,
          size,
          0,
          0,
          256,
          256,
        );
        setIcon(canvas.toDataURL("image/png"));
      } finally {
        bitmap.close();
      }
    });
  }
  const dirty = !!state && (name !== state.project.name || folder !== state.project.folderName || icon !== undefined || rename !== confirmedRename);
  const availability = setupAvailability(state, dirty, aiDirty || syncingRevision, aiReady);
  const disabled = busy || running || aiBusy || !!handoff || !state;
  useEffect(() => {
    onDirectoryState?.({ ready: availability.configureAI, busy: busy || !!running || !!handoff, external, finishReady: availability.finishSetup, artifact: state?.launcher?.artifact });
  }, [availability.configureAI, availability.finishSetup, busy, running, handoff, external, state?.launcher?.artifact, onDirectoryState]);
  const preview =
    icon === undefined
      ? state?.project.icon
        ? "/project-icon.png"
        : null
      : icon;
  return (
    <>
      <section
        className="card project-setup"
        aria-label={t("project.project.setup.and.launcher")}
      >
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              {t("project.1.name.your.project")}
            </div>
            <h2>{t("project.your.app.starts.here")}</h2>
          </div>
          {state && (
            <span className="badge">
              {state.device.platform === "darwin" ? "macOS" : "Windows"} ·{" "}
              {state.device.arch}
            </span>
          )}
        </div>
        <p className="hint">
          {t('project.kernel.version')}{" "}
          {state?.kernelVersion || "—"}
        </p>
        <div className="project-fields">
          <button
            className="project-icon"
            type="button"
            disabled={disabled}
            onClick={() => picker.current?.click()}
            aria-label={t("project.choose.project.icon")}
          >
            {preview ? (
              <img src={preview} alt="" />
            ) : (
              <span>{name.slice(0, 1).toUpperCase() || "S"}</span>
            )}
          </button>
          <div className="project-names">
            <label>
              {t("project.project.and.launcher.name")}
              <input
                maxLength={60}
                value={name}
                disabled={disabled}
                placeholder={t('project.my.project')}
                onChange={(e) => {
                  if (folder === name) setFolder(e.target.value);
                  setName(e.target.value);
                }}
              />
            </label>
            <label>
              {t("project.project.folder.name")}
              <input
                maxLength={60}
                value={folder}
                disabled={disabled}
                onChange={(e) => setFolder(e.target.value)}
              />
            </label>
          </div>
        </div>
        <input
          ref={picker}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            void choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <p className="hint">
          {t("project.click.the.icon.to.upload.an.image")}
        </p>
        <p className="project-path">{state?.root}</p>
        <label className="check">
          <input
            type="checkbox"
            disabled={
              disabled || !state?.canRename
            }
            checked={rename}
            onChange={(e) => setRename(e.target.checked)}
          />
          {(external ? t("project.apply.this.folder.name.when.saving.and") : t("project.apply.this.folder.name.when.saving.and.2"))}
        </label>
        {state && !state.canRename && (
          <p className="hint">
            {t("project.development.worktrees.remain.in.place.a.complete")}
          </p>
        )}
        <button
          className="quiet"
          disabled={disabled || !name}
          onClick={() =>
            void action(async () => {
              await saveIdentity();
              setNotice(
                (external ? msg("project.project.settings.saved.configure.ai.below.then") : msg("project.project.settings.saved.configure.ai.below.then.2")),
              );
            })
          }
        >
          {t("project.save.project.settings")}
        </button>
        {availability.configureAI && <p className="hint" role="status">{(external ? t("project.settings.are.saved.at.the.current.location") : t("project.settings.are.saved.at.the.current.location.2"))}</p>}
        {dirty && <p className="note">{t("project.you.have.unsaved.project.changes.save.them")}</p>}
      </section>
      {!availability.configureAI && <p className="message progress" role="status">{t("project.save.the.project.settings.above.to.enable")}</p>}
      <fieldset className="ai-setup-fields" disabled={!availability.configureAI || busy || !!handoff || running || !state} aria-label={t("project.ai.connection.setup")}>
        {children}
      </fieldset>
      <section className="card project-finalize" aria-label={(external ? t("project.save.and.build.app") : t("project.save.settings.and.restart"))}>
        <div className="eyebrow">{(external ? t("project.3.save.build") : t("project.3.save.restart"))}</div>
        <h3>{(external ? t("project.finish.your.changes.then.build") : t("project.finish.your.changes.then.restart"))}</h3>
        <p className="hint">{(external ? t("project.finish.project.and.ai.changes.first.save") : t("project.finish.project.and.ai.changes.first.save.2"))}</p>
        <ol className="setup-sequence"><li>{t("project.finish.changes")}</li><li>{(external ? t("project.save.build.app") : t("project.save.settings.restart"))}</li><li>{(external ? t("project.wait.for.the.build") : t("project.wait.for.restart"))}</li><li>{(external ? t("setup.finish.setup") : t("project.export.app"))}</li></ol>
        <button disabled={disabled || !name || (!aiReady && !aiDirty)} onClick={beginFinalization}>{(external ? t("project.save.build.app") : t("project.save.settings.restart"))}</button>
        {handoff && <div className="message progress restart-wait" role="status" aria-live="polite"><strong>{t("project.settings.saved.waiting.for.restart")}</strong><p>{t("project.the.connection.may.briefly.disappear.this.page")}</p>{waitingLong && <p>{t("project.restart.is.taking.longer.than.expected.keep")}</p>}</div>}
        {!external && !handoff && state?.finalization?.phase === "failed" && <ErrorNotice issue={state.finalization.error || state.finalization} language={language}/>}
        {!handoff && (external ? availability.finishSetup : availability.exportApp) && <p className="message success" role="status">{(external ? t("project.app.built.and.settings.saved.choose.finish") : t("project.restart.verified.you.can.now.export.your"))}</p>}
      </section>
      <section className="card project-setup">
        <div className="project-build">
          <div className="eyebrow">
            {(external ? t("project.4.finish.open") : t("project.4.export.on.this.device"))}
          </div>
          <h3>
            {t("project.a.small.launcher.editable.source")}
          </h3>
          <p className="hint">
            {(external ? t("project.your.app.is.a.small.launcher.beside") : t("project.export.only.after.saving.and.verified.restart"))}
          </p>
          {!aiReady && (
            <p className="note">
              {t("project.step.2.save.an.ai.scheme.or")}
            </p>
          )}
          {!availability.exportApp && <p className="note">{(external ? t("project.save.build.app.above.before.finishing.setup") : t("project.finish.your.changes.save.settings.and.wait"))}</p>}
          <div className="buttons">
            {external && <button disabled={disabled || !availability.finishSetup} onClick={onFinish}>{t("setup.finish.setup")}</button>}
            {(!external || state?.launcher) && <button
              className={external ? "quiet" : undefined}
              disabled={
                disabled ||
                !availability.exportApp ||
                !name
              }
              onClick={() =>
                void action(async () => {
                  await request("project/build", {});
                })
              }
            >
              {external ? t("project.rebuild.app") : state?.launcher
                ? t("project.export.app.again")
                : t("project.export.app")}
            </button>}
            {state?.launcher && (
              <button
                className="quiet"
                disabled={disabled}
                onClick={() =>
                  void action(async () => {
                    await request("project/reveal", {});
                  })
                }
              >
                {t("project.show.launcher.in.folder")}
              </button>
            )}
          </div>
          {state?.job && (
            <div
              className={"build-progress " + state.job.phase}
              role="status"
              aria-live="polite"
            >
              <strong>
                {state.job.phase === "running"
                  ? t("project.working")
                  : state.job.phase === "completed"
                    ? t("project.completed")
                    : t("project.operation.failed")}
              </strong>
              {state.job.phase==='failed'?<ErrorNotice issue={state.job.error || state.job} language={language}/>:<p>{t(state.job.phase==='running'?'project.working.details':'project.completed.details')}</p>}
              {state.job.message&&<details><summary>{t('project.status.details')}</summary><pre>{state.job.message}</pre></details>}
              {state.job.lines?.length > 0 && (
                <details open={state.job.phase === "failed"}>
                  <summary>{t("project.build.details")}</summary>
                  <pre>{state.job.lines.join("\n")}</pre>
                </details>
              )}
            </div>
          )}
          {state?.launcher && (
            <p className="note">
              {t("project.launcher")}{" "}
              <strong>{state.launcher.artifact}</strong> ·{" "}
              {(external ? t("project.keep.this.launcher.with.the.complete.project") : t("project.double.click.it.next.time.unchanged.native"))}
            </p>
          )}
        </div>
        {(!external || (state?.runtime.phase && state.runtime.phase !== "stopped")) && <div className="project-runtime">
          <h3>{t("project.open.and.manage.this.project")}</h3>
          <p className="hint">
            {t("project.status")} {state?.runtime.phase ? t(['idle','ready','starting','stopping','stopped','failed','restarting'].includes(state.runtime.phase)?'phase.'+state.runtime.phase:'phase.unknown') : '—'}
          </p>
          <div className="buttons">
            {!external && <button
              disabled={disabled || !state?.launcher}
              onClick={() =>
                void action(async () => {
                  await request("project/open", {});
                })
              }
            >
              {t("project.open.app")}
            </button>}
            {!external && <button
              className="quiet"
              disabled={disabled || state?.runtime.phase === "stopped"}
              onClick={() =>
                void action(async () => {
                  await request("project/restart", {});
                })
              }
            >
              {t("project.restart.app")}
            </button>}
            <button
              className="quiet"
              disabled={disabled || state?.runtime.phase === "stopped"}
              onClick={() =>
                void action(async () => {
                  await request("project/stop", {});
                })
              }
            >
              {t("project.stop.app")}
            </button>
          </div>
          {state?.runtime.error && (
            <ErrorNotice issue={state.runtime.error} language={language}/>
          )}
        </div>}
        <ErrorNotice issue={error} language={language}/>
        <Notice value={notice} language={language}/>
      </section>
    </>
  );
}
