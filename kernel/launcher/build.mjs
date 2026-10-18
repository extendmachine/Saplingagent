import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import { terminateOwned } from "../../contracts/local-process.mjs";
export const buildContext = new AsyncLocalStorage();
const originalRoot = path.resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
);
export const nodeForRoot = (root) =>
  process.execPath.startsWith(originalRoot + path.sep)
    ? path.join(root, path.relative(originalRoot, process.execPath))
    : process.execPath;
import { exists, json, writeJSON, issue, cleanOutput } from "./io.mjs";
export function buildEnv(root) {
  const env = {
    ...process.env,
    PATH:
      path.dirname(nodeForRoot(root)) +
      path.delimiter +
      (process.env.PATH || ""),
    SEED_ROOT: root,
    npm_config_cache: path.join(root, ".cache/npm"),
    GOCACHE: path.join(root, ".cache/go-build"),
    GOMODCACHE: path.join(root, ".cache/go-mod"),
    GOPATH: path.join(root, ".runtime/go-path"),
    GOTOOLCHAIN: "local",
    CGO_ENABLED: "0",
    GO111MODULE: "off",
    GOMAXPROCS: "2",
  };
  for (const k of Object.keys(env))
    if (
      /(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|SECRET|^CODEX_HOME$|^GOFLAGS$|^GOENV$|^GOWORK$|^NODE_OPTIONS$|^SEED_CODEX_BIN$)/i.test(
        k,
      )
    )
      delete env[k];
  return { ...env, GOENV: "off", GOWORK: "off" };
}
export async function command(
  root,
  exe,
  args,
  {
    cwd = root,
    env = buildEnv(root),
    onOutput = () => {},
    timeout = 20 * 60000,
    signal = buildContext.getStore()?.signal,
  } = {},
) {
  await fs.mkdir(cwd, { recursive: true });
  return new Promise((resolve, reject) => {
    let output = "",
      finished = false,
      terminating = false;
    const child = spawn(exe, args, {
      cwd,
      env,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const end = (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      err ? reject(err) : resolve(output);
    };
    const abort = () => {
      if (terminating) return;
      terminating = true;
      void terminateOwned(child, { graceMs: 1000, killMs: 2000 })
        .catch(() => {})
        .finally(() =>
          end(
            issue(
              "BUILD_CANCELLED",
              "Build cancelled. The previous launcher was retained.",
            ),
          ),
        );
    };
    const timer = setTimeout(() => {
      if (terminating) return;
      terminating = true;
      void terminateOwned(child, { graceMs: 1000, killMs: 2000 })
        .catch(() => {})
        .finally(() =>
          end(
            issue(
              "BUILD_TIMEOUT",
              "A build step exceeded its deadline. Retry after inspecting the local log.",
            ),
          ),
        );
    }, timeout);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (b) => {
        output = cleanOutput(output + b.toString());
        onOutput(cleanOutput(b.toString()));
      });
    child.once("error", () =>
      end(
        issue(
          "BUILD_COMMAND_FAILED",
          "A required local tool could not start. Retry installation.",
        ),
      ),
    );
    child.once("exit", (code) => {
      if (terminating) return;
      end(
        code === 0
          ? null
          : issue(
              "BUILD_COMMAND_FAILED",
              `Build step failed (exit ${code}). ${output.slice(-1500)}`,
              500,
            ),
      );
    });
  });
}
export async function ensureGo(root, onProgress = () => {}) {
  const pin = await json(path.join(root, "kernel/launcher/toolchain.json"));
  const arch = process.arch === "x64" ? "amd64" : process.arch;
  const file = pin.files.find(
    (x) => x.os === process.platform && x.arch === arch,
  );
  if (!file)
    throw issue(
      "UNSUPPORTED_DEVICE",
      "Local launcher compilation supports macOS and Windows x64/ARM64.",
      400,
    );
  const destination = path.join(
      root,
      ".runtime",
      pin.version + "-" + file.os + "-" + arch,
    ),
    go = path.join(
      destination,
      "go/bin",
      process.platform === "win32" ? "go.exe" : "go",
    );
  if (await exists(go)) {
    if (
      (await command(root, go, ["version"], { timeout: 15000 })).includes(
        pin.version,
      )
    )
      return go;
    throw issue(
      "TOOLCHAIN_INVALID",
      "The project-local Go toolchain is damaged. Remove its version directory after stopping builds and retry.",
    );
  }
  const stage = path.join(root, ".runtime", "go-download-" + randomUUID());
  await fs.mkdir(stage, { recursive: true });
  try {
    onProgress("Downloading verified project-local Go compiler…");
    const response = await fetch("https://go.dev/dl/" + file.filename, {
      signal: AbortSignal.any([
        AbortSignal.timeout(600000),
        ...(buildContext.getStore()?.signal
          ? [buildContext.getStore().signal]
          : []),
      ]),
    });
    if (!response.ok)
      throw issue(
        "TOOLCHAIN_DOWNLOAD_FAILED",
        "Go compiler download failed. Check network access and retry.",
        502,
      );
    const archive = path.join(stage, file.filename),
      handle = await fs.open(archive, "wx"),
      hash = createHash("sha256");
    let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > file.size)
          throw issue("TOOLCHAIN_INVALID", "Go archive size mismatch.");
        hash.update(chunk);
        await handle.write(chunk);
      }
    } finally {
      await handle.close();
    }
    if (size !== file.size || hash.digest("hex") !== file.sha256)
      throw issue(
        "TOOLCHAIN_INVALID",
        "Go archive checksum mismatch. Nothing was installed.",
      );
    if (process.platform === "win32")
      await command(
        root,
        "powershell.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Expand-Archive -LiteralPath $env.SAPLING_ARCHIVE -DestinationPath $env.SAPLING_STAGE",
        ],
        {
          env: {
            ...buildEnv(root),
            SAPLING_ARCHIVE: archive,
            SAPLING_STAGE: stage,
          },
        },
      );
    else await command(root, "/usr/bin/tar", ["-xzf", archive, "-C", stage]);
    await fs.rm(archive);
    await fs.rename(stage, destination);
    return go;
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}
const xml = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
export async function publishArtifact(
  root,
  stage,
  relative,
  { oldRelative, onProgress = () => {} } = {},
) {
  if (
    path.basename(relative) !== relative ||
    (oldRelative &&
      (path.basename(oldRelative) !== oldRelative ||
        !/\.(app|exe)$/i.test(oldRelative)))
  )
    throw issue("INVALID_LAUNCHER_PATH", "Invalid launcher artifact metadata.");
  const destination = path.join(root, relative);
  const samePrevious =
    oldRelative &&
    (await fs.stat(destination, { bigint: true }).then(
      async (stat) => {
        const previous = await fs
          .stat(path.join(root, oldRelative), { bigint: true })
          .catch(() => null);
        return (
          previous &&
          stat.ino !== 0n &&
          stat.dev === previous.dev &&
          stat.ino === previous.ino
        );
      },
      () => false,
    ));
  if ((await exists(destination)) && oldRelative !== relative && !samePrevious)
    throw issue(
      "LAUNCHER_DESTINATION_EXISTS",
      "A file with this launcher name already exists. Choose another project name.",
    );
  const backup = path.join(
    root,
    ".runtime/launcher-build/previous-" + randomUUID(),
  );
  await fs.mkdir(path.dirname(backup), { recursive: true });
  let moved = false;
  try {
    if (await exists(destination)) {
      await fs.rename(destination, backup);
      moved = true;
    }
    try {
      await fs.rename(stage, destination);
    } catch (e) {
      if (moved) await fs.rename(backup, destination);
      throw e;
    }
    if (moved) await fs.rm(backup, { recursive: true, force: true });
    if (oldRelative && oldRelative !== relative && !samePrevious)
      await fs.rm(path.join(root, oldRelative), {
        recursive: true,
        force: true,
      });
    onProgress("Launcher replaced successfully.");
  } catch (e) {
    throw issue(
      "LAUNCHER_REPLACE_FAILED",
      "The previous launcher was retained where possible. Close running launcher windows and retry. New output remains in the local build folder.",
    );
  }
  return destination;
}
export async function compileLauncher(
  root,
  project,
  { onProgress = () => {}, force = false } = {},
) {
  const sourceDir = path.join(root, "kernel/launcher/native");
  const sources = (await fs.readdir(sourceDir))
    .filter((f) => f.endsWith(".go"))
    .sort();
  const source = Buffer.concat(
    await Promise.all(sources.map((f) => fs.readFile(path.join(sourceDir, f)))),
  );
  const icon = project.icon
    ? await fs.readFile(path.join(root, project.icon))
    : Buffer.alloc(0);
  const identity = createHash("sha256")
    .update(source)
    .update(
      await fs.readFile(path.join(root, "kernel/launcher/toolchain.json")),
    )
    .update(await fs.readFile(path.join(root, "kernel/launcher/build.mjs")))
    .update(
      await fs.readFile(path.join(root, "kernel/launcher/windows-icon.ps1")),
    )
    .update(icon)
    .update(
      JSON.stringify({
        name: project.name,
        projectId: project.projectId,
        platform: process.platform,
        arch: process.arch,
      }),
    )
    .digest("hex");
  const old = await json(path.join(root, ".runtime/launcher.json"));
  if (
    !force &&
    old?.signature === identity &&
    (await exists(path.join(root, old.artifact)))
  ) {
    onProgress(
      "Native launcher is unchanged; retaining the existing executable.",
    );
    return old;
  }
  const go = await ensureGo(root, onProgress);
  const base = path.join(root, ".runtime/launcher-build", randomUUID());
  await fs.mkdir(base, { recursive: true });
  for (const f of sources)
    await fs.copyFile(path.join(sourceDir, f), path.join(base, f));
  const relative =
    project.name + (process.platform === "darwin" ? ".app" : ".exe");
  let artifact = path.join(base, relative),
    binary = artifact;
  if (process.platform === "darwin") {
    binary = path.join(artifact, "Contents/MacOS/launcher");
    await fs.mkdir(path.dirname(binary), { recursive: true });
    await fs.mkdir(path.join(artifact, "Contents/Resources"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(artifact, "Contents/Info.plist"),
      `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>launcher</string><key>CFBundleName</key><string>${xml(project.name)}</string><key>CFBundleDisplayName</key><string>${xml(project.name)}</string><key>CFBundleIdentifier</key><string>local.saplingagent.p${project.projectId.replaceAll("-", "")}</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string><key>LSUIElement</key><true/><key>CFBundleIconFile</key><string>project.icns</string></dict></plist>`,
    );
    if (icon.length) {
      const set = path.join(base, "project.iconset");
      await fs.mkdir(set);
      for (const size of [16, 32, 128, 256, 512])
        for (const scale of [1, 2])
          await command(root, "/usr/bin/sips", [
            "-z",
            String(size * scale),
            String(size * scale),
            path.join(root, project.icon),
            "--out",
            path.join(
              set,
              `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`,
            ),
          ]);
      await command(root, "/usr/bin/iconutil", [
        "-c",
        "icns",
        set,
        "-o",
        path.join(artifact, "Contents/Resources/project.icns"),
      ]);
    }
  }
  onProgress("Compiling the native launcher on this device…");
  await command(
    root,
    go,
    [
      "build",
      "-p",
      "2",
      "-trimpath",
      "-buildvcs=false",
      "-ldflags",
      process.platform === "win32" ? "-s -w -H=windowsgui" : "-s -w",
      "-o",
      binary,
      ".",
    ],
    { cwd: base, onOutput: onProgress },
  );
  if (process.platform === "win32" && icon.length)
    await command(
      root,
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(root, "kernel/launcher/windows-icon.ps1"),
        "-Executable",
        artifact,
        "-Png",
        path.join(root, project.icon),
      ],
      { onOutput: onProgress },
    );
  if (process.platform === "darwin") {
    await fs.chmod(binary, 0o755);
    await command(root, "/usr/bin/codesign", [
      "--force",
      "--sign",
      "-",
      artifact,
    ]);
    await command(root, "/usr/bin/codesign", ["--verify", artifact]);
  }
  await command(root, binary, ["--verify"], { timeout: 15000 });
  await publishArtifact(root, artifact, relative, {
    oldRelative: old?.artifact,
    onProgress,
  });
  const receipt = {
    schemaVersion: 1,
    signature: identity,
    artifact: relative,
    projectId: project.projectId,
    platform: process.platform,
    arch: process.arch,
    compiledAt: new Date().toISOString(),
  };
  await writeJSON(path.join(root, ".runtime/launcher.json"), receipt);
  await fs.rm(base, { recursive: true, force: true });
  return receipt;
}
