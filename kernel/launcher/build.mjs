import { launcherMessages } from '../localization/launcher-messages.mjs';
import { formatMessage } from '../localization/public.mjs';
import { readLanguage } from '../localization/store.mjs';
import fs from "node:fs/promises";
import {readFileSync,existsSync} from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import { terminateOwned } from "../contracts/local-process.mjs";
export const buildContext = new AsyncLocalStorage();
const originalRoot = path.resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
);
export const nodeForRoot = (root) => {
  if(process.env.SAPLING_CONFIGURATION_DIR){
    const platform=process.platform==='win32'?'windows':'macos';
    const config=JSON.parse(readFileSync(path.join(root,`kernel/config/${platform}.json`),'utf8'));
    const directory=`node-v${config.nodeVersion}-${process.platform==='win32'?'win':'darwin'}-${process.arch}`;
    const node=path.join(root,'.runtime',directory,...(process.platform==='win32'?['node.exe']:['bin','node']));
    if(!existsSync(node))throw issue('PROJECT_LOCAL_NODE_REQUIRED','The project Node runtime is missing. Run Saplingagent.sh to repair it.');
    return node;
  }
  return process.execPath.startsWith(originalRoot + path.sep)
    ? path.join(root, path.relative(originalRoot, process.execPath))
    : process.execPath;
};
import { exists, json, writeJSON, atomic, issue, cleanOutput } from "./io.mjs";
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
    NODE_COMPILE_CACHE: path.join(root, ".cache/node-compile"),
    TEST_TELEMETRY_DIR: path.join(root, ".cache/go-telemetry"),
    XDG_CONFIG_HOME: path.join(root, "local-secrets/runtime/config"),
    XDG_CACHE_HOME: path.join(root, ".cache/runtime"),
    XDG_DATA_HOME: path.join(root, "data/runtime"),
    XDG_STATE_HOME: path.join(root, "data/runtime-state"),
    CGO_ENABLED: "0",
    GO111MODULE: "off",
    GOMAXPROCS: "2",
    TMPDIR: path.join(root, ".runtime/launcher-tmp"),
    TMP: path.join(root, ".runtime/launcher-tmp"),
    TEMP: path.join(root, ".runtime/launcher-tmp"),
    GOTMPDIR: path.join(root, ".runtime/launcher-tmp"),
  };
  for (const k of Object.keys(env))
    if (
      /(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|SECRET|^CODEX_HOME$|^GOFLAGS$|^GOENV$|^GOWORK$|^NODE_OPTIONS$|^SEED_CODEX_BIN$)/i.test(
        k,
      )
    )
      delete env[k];
  delete env.SAPLING_CONFIGURATION_DIR;delete env.SAPLING_CONFIG_PARENT_PID;
  return { ...env, GOENV: "off", GOWORK: "off" };
}
// Only launcher-managed output directories are checked; this is not an Agent sandbox.
async function managedDirectory(root,relative) {
  let current=root;
  if(!relative)return current;
  for(const name of relative.split(path.sep)){
    if(!name||name==='.'||name==='..')throw issue('PROJECT_STORAGE_LOCATION','Invalid launcher output folder.');
    current=path.join(current,name);
    await fs.mkdir(current,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
    const stat=await fs.lstat(current);
    if(!stat.isDirectory()||stat.isSymbolicLink())throw issue('PROJECT_STORAGE_LOCATION','Launcher output directories must be ordinary project-local directories.');
  }
  return current;
}
export async function prepareBuildStorage(root) {
  root=await fs.realpath(root);
  for(const relative of ['kernel/.cache','.runtime/launcher-tmp','.runtime/go-path','.runtime/launcher-build','.cache/npm','.cache/node-compile','.cache/go-build','.cache/go-mod','.cache/go-telemetry','.cache/runtime','local-secrets/runtime/config','data/runtime','data/runtime-state'])await managedDirectory(root,path.normalize(relative));
  // Go1.27's compiler telemetry honors this directory for every build subprocess.
  // A private off marker prevents both counters and uploader subprocesses.
  const mode=path.join(root,'.cache/go-telemetry/mode');
  const stat=await fs.lstat(mode).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(stat && (!stat.isFile()||stat.isSymbolicLink()))throw issue('PROJECT_STORAGE_LOCATION','The project-local telemetry marker must be a regular file.');
  if(!stat||await fs.readFile(mode,'utf8')!=='off\n')await atomic(mode,'off\n');
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
  root=await fs.realpath(root);
  const relative=path.relative(root,path.resolve(cwd));
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw issue('PROJECT_STORAGE_LOCATION','Launcher commands must run from the project folder.');
  await prepareBuildStorage(root);
  await managedDirectory(root,relative);
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
export function toolchainForDevice(
  pin,
  platform = process.platform,
  architecture = process.arch,
) {
  const os = platform === "win32" ? "windows" : platform;
  const arch = architecture === "x64" ? "amd64" : architecture;
  const file = pin.files.find((x) => x.os === os && x.arch === arch);
  if (!file)
    throw issue(
      "UNSUPPORTED_DEVICE",
      "Local launcher compilation supports macOS and Windows x64/ARM64.",
      400,
    );
  return file;
}
export async function ensureGo(root, onProgress = () => {}) {
  root=await fs.realpath(root);await prepareBuildStorage(root);
  const pin = await json(path.join(root, "kernel/launcher/toolchain.json"));
  const file = toolchainForDevice(pin),
    arch = file.arch;
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
export async function publishArtifact(
  root,
  stage,
  relative,
  { oldRelative, onProgress = () => {} } = {},
) {
  if (
    !relative || path.basename(relative) !== relative || !/\.(app|exe)$/i.test(relative) ||
    (oldRelative &&
      (path.basename(oldRelative) !== oldRelative ||
        !/\.(app|exe)$/i.test(oldRelative)))
  )
    throw issue("INVALID_LAUNCHER_PATH", "Invalid launcher artifact metadata.");
  root=await fs.realpath(root);
  await prepareBuildStorage(root);
  const staged=await fs.realpath(stage).catch(error=>{if(error.code==='ENOENT')return path.resolve(stage);throw error;});
  if(!staged.startsWith(root+path.sep))throw issue("PROJECT_STORAGE_LOCATION","Launcher staging must stay inside its project.");
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
async function compileLauncherUnlocked(
  root,
  project,
  { onProgress = () => {}, force = false } = {},
) {
  const sourceDir = path.join(root, "kernel/launcher/native");
  const language=await readLanguage(root,process.env.SAPLING_LANG);
  const report=onProgress;onProgress=value=>report(formatMessage(launcherMessages,language,value));
  const sources = (await fs.readdir(sourceDir))
    .filter((f) => f.endsWith(".go"))
    .sort();
  const source = Buffer.concat(
    await Promise.all(sources.map((f) => fs.readFile(path.join(sourceDir, f)))),
  );
  const macShell = path.join(sourceDir, "macos.applescript");
  const icon = project.icon
    ? await fs.readFile(path.join(root, project.icon))
    : Buffer.alloc(0);
  const identity = createHash("sha256")
    .update(source)
    .update(JSON.stringify(launcherMessages))
    .update(await fs.readFile(macShell))
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
  await fs.writeFile(path.join(base,"localization_generated.go"),"package main\nfunc init() { launcherMessagesJSON = "+JSON.stringify(JSON.stringify(launcherMessages))+" }\n");
  const relative =
    project.name + (process.platform === "darwin" ? ".app" : ".exe");
  let artifact = path.join(base, relative),
    binary = artifact;
  if (process.platform === "darwin") {
    // The system applet owns the Dock lifetime; the Go executable is its small
    // cancellable dependency/bootstrap helper. No Xcode/CLT download is required.
    await command(root, "/usr/bin/osacompile", ["-s", "-o", artifact, macShell]);
    binary = path.join(artifact, "Contents/MacOS/launcher");
    await fs.mkdir(path.dirname(binary), { recursive: true });
    await fs.mkdir(path.join(artifact, "Contents/Resources"), {
      recursive: true,
    });
    await writeJSON(path.join(artifact,"Contents/Resources/launcher-messages.json"),launcherMessages);
    const info = path.join(artifact, "Contents/Info.plist");
    const plist = JSON.parse(await command(root, "/usr/bin/plutil", ["-convert", "json", "-o", "-", info]));
    Object.assign(plist, {
      CFBundleName: project.name,
      CFBundleDisplayName: project.name,
      CFBundleIdentifier: `local.saplingagent.p${project.projectId.replaceAll("-", "")}`,
      CFBundleVersion: "1",
      LSUIElement: false,
      OSAAppletStayOpen: true,
    });
    // osacompile emits generic permissions for every scripting capability.
    // This app only runs its own helper and never controls another application.
    for (const key of Object.keys(plist))
      if (key.endsWith("UsageDescription")) delete plist[key];
    if (icon.length) {
      plist.CFBundleIconFile = "project.icns";
      delete plist.CFBundleIconName;
    }
    await writeJSON(info, plist);
    await command(root, "/usr/bin/plutil", ["-convert", "xml1", info]);
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

async function removeCreatedLease(file,identity) {
  if(!identity||identity.ino===0n)return;
  const current=await fs.lstat(file,{bigint:true}).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(current?.isFile()&&!current.isSymbolicLink()&&current.ino===identity.ino&&current.dev===identity.dev)await fs.rm(file,{force:true});
}
async function compilationLease(file,owner,message) {
  const handle=await fs.open(file,'wx',0o600).catch(error=>{if(error.code==='EEXIST')throw issue('LAUNCHER_BUILD_BUSY',message);throw error;});
  let identity, failure;
  try {identity=await handle.stat({bigint:true});await handle.writeFile(JSON.stringify(owner)+'\n');}
  catch(error){failure=error;}
  try {await handle.close();}catch(error){failure ||= error;}
  if(failure){await removeCreatedLease(file,identity).catch(()=>{});throw failure;}
  return ()=>removeCreatedLease(file,identity);
}

// Separate cross-process lease: two setup instances must not replace one artifact.
export async function compileLauncher(root,project,options={}) {
  root=await fs.realpath(root);
  const {closeDockForMaintenance}=await import('./dock.mjs');
  await closeDockForMaintenance(root);
  const runtime=path.join(root,'.runtime');await fs.mkdir(runtime,{recursive:true});
  if((await fs.lstat(runtime)).isSymbolicLink())throw issue('PROJECT_STORAGE_LOCATION','Launcher runtime must be an ordinary project-local directory.');
  const file=path.join(runtime,'launcher-compile.lock'),operation=path.join(runtime,'kernel-operation.lock'),id=randomUUID();
  const releaseCompile=await compilationLease(file,{id,pid:process.pid},'Another launcher compilation is active or interrupted. Inspect .runtime/launcher-compile.lock before retrying.');
  let releaseOperation, failure;
  try{
    releaseOperation=await compilationLease(operation,{id,pid:process.pid,purpose:'launcher-compile'},'A project start, move or maintenance operation is active. Wait before compiling.');
    const setup=await json(path.join(runtime,'project-finalization.json'));
    if(setup && (!options.setupId||setup.id!==options.setupId||setup.pid!==process.pid))throw issue('LAUNCHER_BUILD_BUSY','A different setup operation owns this project. Wait before compiling.');
    if(await exists(path.join(runtime,'kernel/active-job.json')))throw issue('LAUNCHER_BUILD_BUSY','Kernel maintenance is active. Wait before compiling.');
    // Recheck after claiming the operation lease: a reopen may have raced the
    // first close, but no new startup can now register against this project.
    await closeDockForMaintenance(root);
    for(const name of ['macos-install.lock','windows-install.lock','node-install.lock','windows-node.lock'])if(await exists(path.join(runtime,name)))throw issue('LAUNCHER_BUILD_BUSY','Dependency installation is active. Wait before compiling.');
    await prepareBuildStorage(root);
    return await compileLauncherUnlocked(root,project,options);
  }catch(error){failure=error;throw error;}
  finally {
    // Release both even if one unlink fails; retain the original operation error.
    const cleanup=await Promise.allSettled([releaseOperation?.(),releaseCompile()]);
    if(!failure){const rejected=cleanup.find(result=>result.status==='rejected');if(rejected)throw rejected.reason;}
  }
}
