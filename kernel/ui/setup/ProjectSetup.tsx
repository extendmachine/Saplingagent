import React, { useEffect, useRef, useState } from "react";
import { acceptedConfigurationJob, restartedFinalization, setupAvailability, type SetupReadiness } from "./setup-flow";
export type ProjectSetupState = { ready: boolean; busy: boolean; external: boolean; finishReady: boolean; artifact?: string };
type T = (en: string, zh: string) => string;
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
    error?: { message: string };
  };
  launcher?: { artifact: string; compiledAt: string };
  runtime: { phase: string; url?: string; error?: { message: string } };
};
export function ProjectSetup({
  request,
  t,
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
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
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
        if (!stopped && !localOperation.current && !handoff) setError((e as Error).message);
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
    void refresh().catch((e) => { if (!stopped) setError((e as Error).message); }).finally(() => { if (!stopped) setSyncingRevision(false); });
    return () => { stopped = true; };
  }, [configurationRevision, handoff]);
  async function action(work: () => Promise<void>) {
    localOperation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      if (!localOperation.current) return;
      await refresh();
    } catch (e) {
      setError((e as Error).message);
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
    catch (e) { setError((e as Error).message); return; }
    void action(finalize);
  }
  async function finalize() {
    await saveIdentity();
    await onSaveSettings?.();
    const result = await request("project/finalize", {});
    if (external) {
      const job = acceptedConfigurationJob(result);
      if (!job) throw Error(t("The build was not accepted. Refresh status before retrying.", "构建未被确认接收，请刷新状态后重试。"));
      // B remains alive at the same URL and token. Continue normal project
      // polling; only the returned project state can confirm the final root.
      setState((current) => current && { ...current, exportReady: false, job: { ...result.job, ...job } });
      return;
    }
    if (!result.finalization?.id)
      throw Error(t("Restart was not accepted. Reload status before retrying.", "重启未被确认接收，请刷新状态后重试。"));
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
        throw Error(
          t(
            "Choose a PNG, JPEG or WebP image up to 4 MiB.",
            "请选择最大 4 MiB 的 PNG、JPEG 或 WebP 图像。",
          ),
        );
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw Error("Image processing unavailable.");
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
        aria-label={t("Project setup and launcher", "项目配置与启动器")}
      >
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              {t("1 · NAME YOUR PROJECT", "1 · 设置项目名称")}
            </div>
            <h2>{t("Your app starts here", "从这里创建你的应用")}</h2>
          </div>
          {state && (
            <span className="badge">
              {state.device.platform === "darwin" ? "macOS" : "Windows"} ·{" "}
              {state.device.arch}
            </span>
          )}
        </div>
        <p className="hint">
          Kernel{" "}
          {state?.kernelVersion || "—"}
        </p>
        <div className="project-fields">
          <button
            className="project-icon"
            type="button"
            disabled={disabled}
            onClick={() => picker.current?.click()}
            aria-label={t("Choose project icon", "选择项目图标")}
          >
            {preview ? (
              <img src={preview} alt="" />
            ) : (
              <span>{name.slice(0, 1).toUpperCase() || "S"}</span>
            )}
          </button>
          <div className="project-names">
            <label>
              {t("Project and launcher name", "项目与启动器名称")}
              <input
                maxLength={60}
                value={name}
                disabled={disabled}
                placeholder="My project"
                onChange={(e) => {
                  if (folder === name) setFolder(e.target.value);
                  setName(e.target.value);
                }}
              />
            </label>
            <label>
              {t("Project folder name", "项目文件夹名称")}
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
          {t(
            "Click the icon to upload an image. It will be cropped to a square. All source, tools and data stay in the project folder.",
            "点击图标上传图片，自动裁剪为正方形。源码、工具和数据均保存在项目文件夹内。",
          )}
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
          {t(
            external ? "Apply this folder name when saving and building (never replaces an existing folder)" : "Apply this folder name when saving and restarting (never replaces an existing folder)",
            external ? "保存并构建时应用此文件夹名称（不会覆盖已有文件夹）" : "保存并重启时应用此文件夹名称（不会覆盖已有文件夹）",
          )}
        </label>
        {state && !state.canRename && (
          <p className="hint">
            {t(
              "Development worktrees remain in place. A complete customer folder can be renamed.",
              "开发工作树保留原位置，独立的客户文件夹可以重命名。",
            )}
          </p>
        )}
        <button
          className="quiet"
          disabled={disabled || !name}
          onClick={() =>
            void action(async () => {
              await saveIdentity();
              setNotice(
                t(
                  external ? "Project settings saved. Configure AI below, then choose Save & build app." : "Project settings saved. Configure AI below, then save settings and wait for restart before exporting your app.",
                  external ? "项目设置已保存。请在下方完成 AI 配置，再点击“保存并构建应用”。" : "项目设置已保存。请在下方完成 AI 配置，再保存设置并等待重启，最后导出应用。",
                ),
              );
            })
          }
        >
          {t("Save project settings", "保存项目设置")}
        </button>
        {availability.configureAI && <p className="hint" role="status">{t(external ? "Settings are saved at the current location. Save & build app applies the folder name." : "Settings are saved at the current location. The folder will move only during Save settings & restart.", external ? "设置已保存到当前位置，点击“保存并构建应用”时才会应用文件夹名称。" : "设置已保存到当前位置，文件夹仅在“保存设置并重启”时移动。")}</p>}
        {dirty && <p className="note">{t("You have unsaved project changes. Save them before leaving this page.", "项目有未保存的修改，离开页面前请保存。")}</p>}
      </section>
      {!availability.configureAI && <p className="message progress" role="status">{t("Save the project settings above to enable AI setup. No folder is moved yet.", "先保存上方项目设置，再配置 AI；此时不会移动文件夹。")}</p>}
      <fieldset className="ai-setup-fields" disabled={!availability.configureAI || busy || !!handoff || running || !state} aria-label={t("AI connection setup", "AI 接入配置")}>
        {children}
      </fieldset>
      <section className="card project-finalize" aria-label={t(external ? "Save and build app" : "Save settings and restart", external ? "保存并构建应用" : "保存设置并重启")}>
        <div className="eyebrow">{t(external ? "3 · SAVE & BUILD" : "3 · SAVE & RESTART", external ? "3 · 保存并构建" : "3 · 保存并重启")}</div>
        <h3>{t(external ? "Finish your changes, then build" : "Finish your changes, then restart", external ? "完成修改，保存后构建应用" : "完成修改，保存后等待重启")}</h3>
        <p className="hint">{t(external ? "Finish project and AI changes first. Save & build app saves the settings, applies the folder name and creates the launcher in your project. Keep this page open until the build completes, then choose Finish setup. The configuration page stays available while the project changes." : "Finish project and AI changes first. Save settings, wait for the app to restart, then export the app below. Keep this page open while the external helper closes project processes, applies the folder name and starts services again.", external ? "请先完成项目和 AI 配置修改。“保存并构建应用”会保存设置、应用文件夹名称，并在项目内生成启动器。请保持页面打开，等待构建完成后点击“完成配置”。项目修改期间，此配置页面持续可用。" : "请先完成项目和 AI 配置修改，保存设置后等待应用重启，再在下方导出应用。临时辅助进程将在文件夹外运行，关闭项目进程、应用文件夹名称并重新启动服务，请保持此页面打开。")}</p>
        <ol className="setup-sequence"><li>{t("Finish changes", "完成修改")}</li><li>{t(external ? "Save & build app" : "Save settings & restart", external ? "保存并构建应用" : "保存设置并重启")}</li><li>{t(external ? "Wait for the build" : "Wait for restart", external ? "等待构建完成" : "等待重启")}</li><li>{t(external ? "Finish setup" : "Export app", external ? "完成配置" : "导出应用")}</li></ol>
        <button disabled={disabled || !name || (!aiReady && !aiDirty)} onClick={beginFinalization}>{t(external ? "Save & build app" : "Save settings & restart", external ? "保存并构建应用" : "保存设置并重启")}</button>
        {handoff && <div className="message progress restart-wait" role="status" aria-live="polite"><strong>{t("Settings saved. Waiting for restart…", "设置已保存，正在等待重启…")}</strong><p>{t("The connection may briefly disappear. This page will reload after the new service reports its result. Do not repeat Save or export the app yet.", "连接会短暂中断；新服务返回结果后，页面将自动刷新。请勿重复保存，暂时不要导出应用。")}</p>{waitingLong && <p>{t("Restart is taking longer than expected. Keep waiting, or use the project script / launcher diagnostics if the page does not return. The settings have not been discarded; a failed rename does not replace an existing folder.", "重启耗时较长，请继续等待；若页面始终未恢复，可使用项目脚本／启动器进行诊断。已保存设置不会丢弃，改名失败不会覆盖已有文件夹。")}</p>}</div>}
        {!external && !handoff && state?.finalization?.phase === "failed" && <div className="message error" role="alert">{state.finalization.error?.message || state.finalization.message || t("Setup restart failed. Review the current folder and retry after resolving the reported issue.", "配置重启失败，请核对当前文件夹，处理错误后重试。")}</div>}
        {!handoff && (external ? availability.finishSetup : availability.exportApp) && <p className="message success" role="status">{t(external ? "App built and settings saved. Choose Finish setup, then open your app." : "Restart verified. You can now export your app.", external ? "应用已构建，设置已保存。请点击“完成配置”，然后打开应用。" : "重启已验证，现在可以导出应用。")}</p>}
      </section>
      <section className="card project-setup">
        <div className="project-build">
          <div className="eyebrow">
            {t(external ? "4 · FINISH & OPEN" : "4 · EXPORT ON THIS DEVICE", external ? "4 · 完成并打开" : "4 · 在本机导出")}
          </div>
          <h3>
            {t("A small launcher, editable source", "小型启动器，可编辑源码")}
          </h3>
          <p className="hint">
            {t(
              external ? "Your app is a small launcher beside the editable source. Double-click it after finishing setup: it checks and installs missing dependencies, then opens your project. Rebuilding replaces the previous output only after a successful build." : "Export only after saving and verified restart. Export installs application dependencies and a verified local Go compiler, then builds the native launcher. It does not send a model prompt. Failed builds retain the previous launcher.",
              external ? "应用是与可编辑源码放在一起的小型启动器。完成配置后双击应用，它会检查并安装缺少的依赖，然后打开项目。重新构建仅在成功后替换上次的成果。" : "保存设置并验证重启后再导出。导出时安装应用依赖和经过校验的本地 Go 编译器，并生成原生启动器；不发送模型请求，构建失败保留原启动器。",
            )}
          </p>
          {!aiReady && (
            <p className="note">
              {t(
                "Step 2: save an AI scheme or enable external-only MCP access above.",
                "第 2 步：请在上方保存 AI 方案，或启用仅使用外部 AI 的 MCP 接入。",
              )}
            </p>
          )}
          {!availability.exportApp && <p className="note">{t(external ? "Save & build app above before finishing setup. New changes must be saved and built again." : "Finish your changes, save settings and wait for a verified restart before exporting.", external ? "请先点击上方“保存并构建应用”，完成后再结束配置；新修改需要再次保存并构建。" : "请先完成修改、保存设置并等待重启验证，再导出应用。")}</p>}
          <div className="buttons">
            {external && <button disabled={disabled || !availability.finishSetup} onClick={onFinish}>{t("Finish setup", "完成配置")}</button>}
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
              {external ? t("Rebuild app", "重新构建应用") : state?.launcher
                ? t("Export app again", "重新导出应用")
                : t("Export app", "导出应用")}
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
                {t("Show launcher in folder", "在文件夹中显示启动器")}
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
                  ? t("Working…", "正在处理…")
                  : state.job.phase === "completed"
                    ? t("Completed", "已完成")
                    : t("Operation failed", "操作失败")}
              </strong>
              <p>{state.job.error?.message || state.job.message}</p>
              {state.job.lines?.length > 0 && (
                <details open={state.job.phase === "failed"}>
                  <summary>{t("Build details", "构建详情")}</summary>
                  <pre>{state.job.lines.join("\n")}</pre>
                </details>
              )}
            </div>
          )}
          {state?.launcher && (
            <p className="note">
              {t("Launcher:", "启动器：")}{" "}
              <strong>{state.launcher.artifact}</strong> ·{" "}
              {t(
                external ? "Keep this launcher with the complete project folder. It checks dependencies each time it opens." : "Double-click it next time. Unchanged native launchers are reused during app rebuilds.",
                external ? "请将启动器与完整项目文件夹一起保留，每次打开时都会检查依赖。" : "下次双击即可打开；应用重构建时复用未变化的原生启动器。",
              )}
            </p>
          )}
        </div>
        {(!external || (state?.runtime.phase && state.runtime.phase !== "stopped")) && <div className="project-runtime">
          <h3>{t("Open and manage this project", "打开与管理当前项目")}</h3>
          <p className="hint">
            {t("Status:", "状态：")} {state?.runtime.phase || "—"}
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
              {t("Open app", "打开应用")}
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
              {t("Restart app", "重启应用")}
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
              {t("Stop app", "停止应用")}
            </button>
          </div>
          {state?.runtime.error && (
            <p className="message error">{state.runtime.error.message}</p>
          )}
        </div>}
        {error && (
          <div className="message error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="message success" role="status">
            {notice}
          </div>
        )}
      </section>
    </>
  );
}
