// Demand-started management infrastructure; runtime-manager owns business services.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, randomBytes } from "node:crypto";
import { createConfigurationServer } from "../services/ai-config/server.mjs";
import {assertSetupAvailable} from "../contracts/kernel.mjs";
import { ProjectLauncher, openExternal } from "./manager.mjs";
import {prepareSetupUI} from './setup-ui.mjs';
import {
  json,
  writeJSON,
  issue,
  dailyLog,
  managementFingerprint,
} from "./io.mjs";
let root = await fs.realpath(
  process.env.SEED_ROOT || fileURLToPath(new URL("../../", import.meta.url)),
);
await assertSetupAvailable(root);
await prepareSetupUI(root);
let fingerprint = await managementFingerprint(root);
let file = path.join(root, ".runtime/management-address.json"),
  lock = path.join(root, ".runtime/management.lock");
await fs.mkdir(path.dirname(file), { recursive: true });
async function existing() {
  const value = await json(file);
  if (!value || value.root !== root || !Number.isInteger(value.port))
    return null;
  try {
    const r = await fetch(
      `http://127.0.0.1:${value.port}/health/project-launcher`,
      { signal: AbortSignal.timeout(1000) },
    ).then((r) => r.json());
    return r.instanceId === value.instanceId && r.root === root ? value : null;
  } catch {
    return null;
  }
}
async function visit(value) {
  const base = `http://127.0.0.1:${value.port}/`;
  if (process.argv.includes("--launch")) {
    try {
      const token = (
        await fs.readFile(
          path.join(root, "local-secrets/runtime/launcher-token"),
          "utf8",
        )
      ).trim();
      await fetch(base + "api/config/project/open", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: base.slice(0, -1),
          "X-Sapling-Config": token,
        },
        body: "{}",
        signal: AbortSignal.timeout(5000),
      });
    } catch {}
  }
  if (
    !process.argv.includes("--no-open") &&
    process.env.SAPLING_NO_OPEN !== "1"
  )
    await openExternal(base);
  console.log("Project setup: " + base);
}
let value = await existing();
if (value && value.fingerprint !== fingerprint) {
  try {
    const base = `http://127.0.0.1:${value.port}`;
    const previousToken = (
      await fs.readFile(
        path.join(root, "local-secrets/runtime/launcher-token"),
        "utf8",
      )
    ).trim();
    const closed = await fetch(base + "/api/config/close", {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        "X-Sapling-Config": previousToken,
      },
      body: "{}",
      signal: AbortSignal.timeout(5000),
    });
    if (closed.ok) {
      for (let i = 0; i < 30 && (await existing()); i++)
        await new Promise((r) => setTimeout(r, 100));
      value = await existing();
    }
  } catch {}
}
if (value) {
  await visit(value);
  process.exit(0);
}
let owns = false;
for (let i = 0; i < 30; i++) {
  try {
    await fs.mkdir(lock);
    await writeJSON(path.join(lock, "owner.json"), {
      pid: process.pid,
      root,
      id: randomUUID(),
    });
    owns = true;
    break;
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    value = await existing();
    if (value) {
      await visit(value);
      process.exit(0);
    }
    const lease = await json(path.join(lock, "owner.json")).catch(() => null);
    if (!lease) {
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }
    let alive = true;
    try {
      process.kill(lease?.pid, 0);
    } catch {
      alive = false;
    }
    if (lease?.root !== root || !alive) {
      await fs.rm(lock, { recursive: true, force: true });
      continue;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}
if (!owns)
  throw issue(
    "PROJECT_BUSY",
    "Another management launcher is still starting. Retry shortly.",
  );
const token = randomBytes(32).toString("hex");
await fs.mkdir(path.join(root, "local-secrets/runtime"), {
  recursive: true,
  mode: 0o700,
});
await fs.writeFile(
  path.join(root, "local-secrets/runtime/launcher-token"),
  token,
  { mode: 0o600 },
);
const controller = new ProjectLauncher(root);
const instanceId = randomUUID();
let server;
async function publish() {
  root = controller.root;
  file = path.join(root, '.runtime/management-address.json');
  lock = path.join(root, '.runtime/management.lock');
  fingerprint = await managementFingerprint(root);
  const owner = await json(path.join(lock, 'owner.json'));
  if (owner?.pid === process.pid)
    await writeJSON(path.join(lock, 'owner.json'), {...owner, root});
  await writeJSON(
    path.join(controller.root, ".runtime/management-address.json"),
    {
      root: controller.root,
      fingerprint,
      pid: process.pid,
      instanceId,
      port: server.address().port,
    },
  );
}
server = createConfigurationServer({
  root,
  language: process.env.SAPLING_LANG,
  token,
  projectController: controller,
  instanceId,
  onProjectRename: publish,
  onClose: async () => {
    for (const f of ["management-address.json", "management.lock"]) {
      const target = path.join(controller.root, ".runtime", f);
      const meta = await json(
        f === "management.lock" ? path.join(target, "owner.json") : target,
      );
      if (meta?.pid === process.pid)
        await fs.rm(target, { recursive: true, force: true });
    }
    process.exit(0);
  },
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(signal, () => void server.shutdown());
const requestedPort = process.env.SAPLING_MANAGEMENT_PORT;
if (requestedPort && (!/^\d+$/.test(requestedPort) || Number(requestedPort) < 1024 || Number(requestedPort) > 65535))
  throw issue("PROJECT_MANAGEMENT_PORT", "The setup restart port is invalid.");
server.on("error", async error => {
  await dailyLog(root, "management_bind_failed", {code:error.code}).catch(()=>{});
  await server.shutdown();
});
server.listen(requestedPort ? Number(requestedPort) : 0, "127.0.0.1", async () => {
  await publish();
  await dailyLog(root, "management_started", { pid: process.pid });
  const current = await existing();
  await visit(current);
});
