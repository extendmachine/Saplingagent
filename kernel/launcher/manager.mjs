import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { codexBinary } from "../contracts/local-process.mjs";
import {
  exists,
  json,
  writeJSON,
  atomic,
  issue,
  dailyLog,
  cleanOutput,
} from "./io.mjs";
import {
  compileLauncher,
  command,
  buildEnv,
  nodeForRoot,
  buildContext,
} from "./build.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function validateProjectName(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value !== value.trim() ||
    [...value].length > 60 ||
    /[\x00-\x1f\x7f<>:"/\\|?*]/.test(value) ||
    /[. ]$/.test(value) ||
    value === "." ||
    value === ".." ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)
  )
    throw issue(
      "INVALID_PROJECT_NAME",
      "Use 1–60 characters without path separators, reserved filename characters or Windows device names.",
      400,
    );
  return value;
}
export async function readProject(root) {
  const v = await json(path.join(root, "config/project.json"));
  if (!v)
    return {
      schemaVersion: 1,
      projectId: null,
      name: path.basename(root),
      folderName: path.basename(root),
      icon: null,
    };
  if (
    v.schemaVersion !== 1 ||
    typeof v.projectId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(v.projectId)
  )
    throw issue(
      "PROJECT_METADATA_INVALID",
      "Project identity is invalid. Preserve config/project.json and repair it.",
    );
  validateProjectName(v.name);
  validateProjectName(v.folderName);
  if (v.icon && v.icon !== "config/project-icon.png")
    throw issue(
      "PROJECT_METADATA_INVALID",
      "Project icon reference is invalid.",
    );
  return {
    schemaVersion: 1,
    projectId: v.projectId,
    name: v.name,
    folderName: v.folderName,
    icon: v.icon || null,
  };
}
export async function saveProject(root, input) {
  const previous = await readProject(root);
  const name = validateProjectName(input.name),
    folderName = validateProjectName(input.folderName || name);
  let icon = previous.icon || null;
  if (input.iconData !== undefined) {
    if (input.iconData === null) icon = null;
    else {
      if (
        typeof input.iconData !== "string" ||
        !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input.iconData) ||
        input.iconData.length > 1400000
      )
        throw issue(
          "INVALID_PROJECT_ICON",
          "Choose a PNG image (up to 1 MiB).",
          400,
        );
      const bytes = Buffer.from(input.iconData.split(",")[1], "base64");
      if (
        bytes.length < 33 ||
        bytes.length > 1048576 ||
        !bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        bytes.readUInt32BE(16) !== 256 ||
        bytes.readUInt32BE(20) !== 256
      )
        throw issue(
          "INVALID_PROJECT_ICON",
          "The project icon must be a 256×256 PNG. The setup page resizes uploaded images automatically.",
          400,
        );
      await atomic(path.join(root, "config/project-icon.png"), bytes);
      icon = "config/project-icon.png";
    }
  }
  const project = {
    schemaVersion: 1,
    projectId: previous.projectId || randomUUID(),
    name,
    folderName,
    icon,
  };
  await writeJSON(path.join(root, "config/project.json"), project);
  return project;
}
export async function openExternal(target) {
  const command =
    process.platform === "win32" ? "powershell.exe" : "/usr/bin/open";
  const args =
    process.platform === "win32"
      ? [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Start-Process -FilePath $env.SAPLING_OPEN_TARGET",
        ]
      : [target];
  await new Promise((resolve, reject) => {
    const c = spawn(command, args, {
      cwd:
        process.platform === "win32"
          ? process.env.SystemRoot || "C:/Windows"
          : "/",
      env: { ...process.env, SAPLING_OPEN_TARGET: target },
      stdio: "ignore",
      windowsHide: true,
    });
    c.once("error", () =>
      reject(
        issue(
          "OPEN_FAILED",
          "Open the displayed local address or project folder manually.",
        ),
      ),
    );
    c.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            issue(
              "OPEN_FAILED",
              "Open the displayed local address or project folder manually.",
            ),
          ),
    );
  });
}
export class ProjectLauncher {
  constructor(
    root,
    {
      compiler = compileLauncher,
      run = command,
      open = (target) =>
        process.env.SAPLING_NO_OPEN === "1"
          ? Promise.resolve()
          : openExternal(target),
    } = {},
  ) {
    Object.assign(this, {
      root: path.resolve(root),
      compiler,
      run,
      open,
      job: null,
      busy: false,
    });
  }
  async state() {
    const git = path.join(this.root, ".git");
    const linked = await fs.lstat(git).then(
      (x) => x.isFile(),
      () => false,
    );
    const maintainer = await exists(path.join(git, "worktrees"));
    const release = await json(path.join(this.root, "config/release.json"));
    const kernel = await json(path.join(this.root, "kernel/manifest.json"));
    return {
      productVersion: release?.version || null,
      kernelVersion: kernel?.version || null,
      canRename: !linked && !maintainer,
      project: await readProject(this.root),
      root: this.root,
      device: { platform: process.platform, arch: process.arch },
      job: this.job,
      launcher: await json(path.join(this.root, ".runtime/launcher.json")),
      runtime: await this.runtime(),
    };
  }
  progress(message) {
    if (!this.job) return;
    this.job.message = cleanOutput(message);
    this.job.lines = [...this.job.lines, cleanOutput(message)].slice(-60);
  }
  async runtime() {
    const record = await json(
      path.join(this.root, ".runtime/runtime-address.json"),
    );
    if (!record) return { phase: "stopped" };
    if (record.root && path.resolve(record.root) !== this.root)
      return { phase: "stopped", stale: true };
    const port = record.ports?.runtimeManagerPort;
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      return { phase: "stopped", stale: true };
    try {
      const state = await fetch(`http://127.0.0.1:${port}/api/runtime/status`, {
        signal: AbortSignal.timeout(1500),
      }).then((r) => r.json());
      if (
        state.instanceId !== record.instanceId ||
        state.applicationRoot !== this.root
      )
        return { phase: "stopped", stale: true, unverified: true };
      return { ...state, url: record.url, controlPort: port, pid: record.pid };
    } catch {
      return { phase: "stopped", stale: true };
    }
  }
  assertIdle() {
    if (this.busy)
      throw issue(
        "PROJECT_BUSY",
        "A project operation is already running. Wait for its result.",
      );
  }
  async save(input) {
    this.assertIdle();
    this.busy = true;
    try {
      return await saveProject(this.root, input);
    } finally {
      this.busy = false;
    }
  }
  startJob(kind, work) {
    this.assertIdle();
    this.busy = true;
    this.job = {
      id: randomUUID(),
      kind,
      phase: "running",
      message: "Starting…",
      lines: [],
      startedAt: new Date().toISOString(),
    };
    const job = this.job;
    this.abortController = new AbortController();
    this.completion = Promise.resolve()
      .then(() =>
        buildContext.run({ signal: this.abortController.signal }, work),
      )
      .then((result) => {
        job.phase = "completed";
        job.result = result;
        job.message = "Completed.";
      })
      .catch(async (e) => {
        job.phase = "failed";
        job.error = {
          code: e.code || "PROJECT_OPERATION_FAILED",
          message: e.status
            ? cleanOutput(e.message)
            : "Project operation failed. Inspect the local project log and retry.",
        };
        job.message = job.error.message;
        await dailyLog(this.root, "operation_failed", {
          kind,
          code: job.error.code,
        }).catch(() => {});
      })
      .finally(() => {
        job.finishedAt = new Date().toISOString();
        this.busy = false;
      });
    return job;
  }
  async cancel() {
    if (this.busy) {
      this.abortController?.abort();
      await this.completion;
    }
  }
  async rename(folderName) {
    this.assertIdle();
    this.busy = true;
    try {
      validateProjectName(folderName);
      const current = this.root;
      if (path.basename(current) === folderName)
        return { root: current, renamed: false };
      if ((await this.runtime()).phase !== "stopped")
        throw issue(
          "PROJECT_RUNNING",
          "Stop this project before changing its folder name.",
        );
      const git = path.join(current, ".git");
      if (
        (await fs.lstat(git).then(
          (x) => x.isFile(),
          () => false,
        )) ||
        (await exists(path.join(git, "worktrees")))
      )
        throw issue(
          "PROJECT_GIT_RENAME",
          "Development worktrees are not renamed automatically. Use a complete independent customer folder.",
        );
      const target = path.join(path.dirname(current), folderName);
      if (
        (await exists(target)) &&
        (await fs.realpath(target)) !== (await fs.realpath(current))
      )
        throw issue(
          "PROJECT_FOLDER_EXISTS",
          "The requested folder already exists. Choose another name.",
        );
      for (const f of [
        ".runtime/kernel-operation.lock",
        ".runtime/macos-install.lock",
        ".runtime/windows-install.lock",
        ".runtime/kernel/active-job.json",
      ])
        if (await exists(path.join(current, f)))
          throw issue(
            "PROJECT_BUSY",
            "Finish installation or kernel maintenance before renaming.",
          );
      try {
        await fs.rename(current, target);
      } catch {
        throw issue(
          "PROJECT_RENAME_FAILED",
          "The folder could not be renamed. Close terminals or other programs using it and retry. The original folder is retained.",
        );
      }
      this.root = await fs.realpath(target);
      return { root: this.root, renamed: true };
    } finally {
      this.busy = false;
    }
  }
  async build() {
    return this.startJob("build", async () => {
      const project = await readProject(this.root);
      if (!project.projectId)
        throw issue(
          "PROJECT_NOT_CONFIGURED",
          "Save the project name and icon first.",
        );
      if ((await this.runtime()).phase !== "stopped")
        throw issue(
          "PROJECT_RUNNING",
          "Stop this project before rebuilding dependencies.",
        );
      this.progress("Installing application dependencies…");
      await this.run(
        this.root,
        nodeForRoot(this.root),
        [
          path.join(this.root, "kernel/scripts/launcher/cli.mjs"),
          "install",
          "--app-only",
        ],
        { onOutput: (s) => this.progress(s) },
      );
      this.progress("Building application pages…");
      const vite = path.join(this.root, "front/node_modules/vite/bin/vite.js");
      await this.run(this.root, nodeForRoot(this.root), [vite, "build"], {
        cwd: path.join(this.root, "front"),
        onOutput: (s) => this.progress(s),
      });
      const receipt = await this.compiler(this.root, project, {
        onProgress: (s) => this.progress(s),
      });
      return { artifact: receipt.artifact, root: this.root };
    });
  }
  async openProject() {
    return this.startJob("open", async () => {
      let state = await this.runtime();
      if (state.phase === "stopped") {
        if (!(await exists(path.join(this.root, ".runtime/launcher.json"))))
          throw issue(
            "LAUNCHER_NOT_BUILT",
            "Finish project setup and compile the launcher first.",
          );
        this.progress("Starting this project…");
        await fs.mkdir(path.join(this.root, ".runtime/launcher-tmp"), {
          recursive: true,
        });
        await dailyLog(this.root, "app_start");
        const logDir = path.join(this.root, "logs/project-launcher");
        const handle = await fs.open(
          path.join(
            logDir,
            `project-launcher-${new Date().toISOString().slice(0, 10)}.log`,
          ),
          "a",
        );
        const child = spawn(
          nodeForRoot(this.root),
          [path.join(this.root, "scripts/dev.mjs")],
          {
            cwd: this.root,
            env: {
              ...buildEnv(this.root),
              SEED_ROOT: this.root,
              SEED_IMPORT_EXISTING_AUTH: "0",
              CODEX_HOME: path.join(this.root, "local-secrets/codex"),
              SEED_CODEX_BIN:
                process.platform === "win32"
                  ? codexBinary(this.root)
                  : path.join(this.root, "kernel/scripts/macos/codex.sh"),
            },
            stdio: ["ignore", handle.fd, handle.fd],
            detached: process.platform !== "win32",
            windowsHide: true,
          },
        );
        await handle.close();
        this.appChild = child;
        child.once("error", () => {
          child.spawnFailed = true;
        });
        child.unref();
        const deadline = Date.now() + 150000;
        while (Date.now() < deadline) {
          if (this.abortController?.signal.aborted)
            throw issue(
              "PROJECT_CANCELLED",
              "Management operation interrupted. Reopen the launcher to inspect this project.",
            );
          if (child.spawnFailed || child.exitCode !== null || child.signalCode)
            throw issue(
              "APP_START_FAILED",
              "The app stopped during startup. Check its logs or repair dependencies.",
            );
          state = await this.runtime();
          if (state.phase === "ready") break;
          if (state.phase === "failed")
            throw issue(
              "APP_START_FAILED",
              state.error?.message ||
                "App initialization failed. Open runtime recovery or check the saved AI scheme.",
            );
          await sleep(400);
        }
        if (state.phase !== "ready")
          throw issue(
            "APP_NOT_READY",
            "The app has not become ready. Check AI configuration and runtime recovery.",
          );
      } else if (state.phase !== "ready")
        throw issue(
          "APP_NOT_READY",
          "This project is already starting or recovering. Inspect its runtime page.",
        );
      await this.open(state.url);
      return { url: state.url };
    });
  }
  async restart() {
    this.assertIdle();
    const state = await this.runtime();
    if (state.phase === "stopped") return this.openProject();
    const token = (
      await fs.readFile(
        path.join(this.root, "local-secrets/runtime/service-token"),
        "utf8",
      )
    ).trim();
    const response = await fetch(
      `http://127.0.0.1:${state.controlPort}/api/runtime/restart`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scope: "all" }),
        signal: AbortSignal.timeout(5000),
      },
    );
    const value = await response.json();
    if (!response.ok)
      throw issue(
        value.error?.code || "RESTART_FAILED",
        value.error?.message || "App restart was refused.",
      );
    return value;
  }
  async stop() {
    this.assertIdle();
    const state = await this.runtime();
    if (state.phase === "stopped") return { stopped: true };
    const token = (
      await fs.readFile(
        path.join(this.root, "local-secrets/runtime/service-token"),
        "utf8",
      )
    ).trim();
    const response = await fetch(
      `http://127.0.0.1:${state.controlPort}/api/runtime/stop`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) {
      const value = await response.json();
      throw issue(
        value.error?.code || "STOP_FAILED",
        value.error?.message || "App stop was refused.",
      );
    }
    for (let i = 0; i < 40; i++) {
      if ((await this.runtime()).phase === "stopped") return { stopped: true };
      await sleep(250);
    }
    throw issue(
      "STOP_PENDING",
      "The runtime is still shutting down. Wait and refresh.",
    );
  }
  async reveal() {
    const p = await json(path.join(this.root, ".runtime/launcher.json"));
    if (!p) throw issue("LAUNCHER_NOT_BUILT", "Compile the launcher first.");
    await this.open(this.root);
    return { artifact: p.artifact };
  }
}
