import React, { useEffect, useRef, useState } from "react";
type T = (en: string, zh: string) => string;
type Project = {
  name: string;
  folderName: string;
  projectId?: string;
  icon?: string | null;
};
type Snapshot = {
  kernelVersion?: string;
  root: string;
  canRename: boolean;
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
  children,
}: {
  children?: React.ReactNode;
  request: (route: string, body?: unknown) => Promise<any>;
  t: T;
  aiReady: boolean;
}) {
  const [state, setState] = useState<Snapshot | null>(null),
    [name, setName] = useState(""),
    [folder, setFolder] = useState(""),
    [icon, setIcon] = useState<string | null | undefined>(),
    [rename, setRename] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const initialized = useRef(false),
    picker = useRef<HTMLInputElement>(null);
  const running = state?.job?.phase === "running";
  async function refresh() {
    const value: Snapshot = await request("project");
    setState(value);
    if (!initialized.current) {
      setName(value.project.name);
      setFolder(value.project.folderName);
      setRename(value.canRename);
      initialized.current = true;
    }
  }
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        if (!stopped) await refresh();
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
      if (!stopped) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    await request("project/save", {
      name,
      folderName: folder,
      ...(icon === undefined ? {} : { iconData: icon }),
    });
    setIcon(undefined);
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
  const disabled = busy || running;
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
              disabled || !state?.canRename || state.runtime.phase !== "stopped"
            }
            checked={rename}
            onChange={(e) => setRename(e.target.checked)}
          />
          {t(
            "Rename this folder before building (never replaces an existing folder)",
            "编译前重命名此文件夹（不会覆盖已有文件夹）",
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
              await save();
              setNotice(
                t(
                  "Project settings saved. Configure AI below, then compile the launcher.",
                  "项目配置已保存。请在下方配置 AI，再编译启动器。",
                ),
              );
            })
          }
        >
          {t("Save project settings", "保存项目配置")}
        </button>
      </section>
      {children}
      <section className="card project-setup">
        <div className="project-build">
          <div className="eyebrow">
            {t("3 · BUILD ON THIS DEVICE", "3 · 在本机编译")}
          </div>
          <h3>
            {t("A small launcher, editable source", "小型启动器，可编辑源码")}
          </h3>
          <p className="hint">
            {t(
              "First connect your AI above. Building installs application dependencies and a verified local Go compiler. It does not send a model prompt. Failed builds retain the previous launcher.",
              "请先在上方配置 AI。构建时安装应用依赖和经过校验的本地 Go 编译器，不发送模型请求；构建失败保留原启动器。",
            )}
          </p>
          {!aiReady && (
            <p className="note">
              {t(
                "Step 2: save and select an AI scheme above before compiling.",
                "第 2 步：请先在上方保存并选择一个 AI 方案。",
              )}
            </p>
          )}
          <div className="buttons">
            <button
              disabled={
                disabled ||
                !aiReady ||
                !name ||
                state?.runtime.phase !== "stopped"
              }
              onClick={() =>
                void action(async () => {
                  await save();
                  if (rename && state?.canRename)
                    await request("project/rename", { folderName: folder });
                  await request("project/build", {});
                })
              }
            >
              {state?.launcher
                ? t("Rebuild app & launcher", "重新构建应用与启动器")
                : t("Install app & compile launcher", "安装应用并编译启动器")}
            </button>
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
              {state.job.lines.length > 0 && (
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
                "Double-click it next time. Unchanged native launchers are reused during app rebuilds.",
                "下次双击即可打开；应用重构建时复用未变化的原生启动器。",
              )}
            </p>
          )}
        </div>
        <div className="project-runtime">
          <h3>{t("Open and manage this project", "打开与管理当前项目")}</h3>
          <p className="hint">
            {t("Status:", "状态：")} {state?.runtime.phase || "—"}
          </p>
          <div className="buttons">
            <button
              disabled={disabled || !state?.launcher}
              onClick={() =>
                void action(async () => {
                  await request("project/open", {});
                })
              }
            >
              {t("Open app", "打开应用")}
            </button>
            <button
              className="quiet"
              disabled={disabled || state?.runtime.phase === "stopped"}
              onClick={() =>
                void action(async () => {
                  await request("project/restart", {});
                })
              }
            >
              {t("Restart app", "重启应用")}
            </button>
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
        </div>
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
