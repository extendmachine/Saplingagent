import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
export const issue = (code, message, status = 409) =>
  Object.assign(new Error(message), { code, status });
export const exists = (file) =>
  fs.access(file).then(
    () => true,
    () => false,
  );
export async function json(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw issue(
      "PROJECT_METADATA_INVALID",
      "Project metadata is invalid. Preserve it and inspect the local file.",
    );
  }
}
export async function atomic(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(temp, bytes, { mode: 0o600 });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
export const writeJSON = (file, value) =>
  atomic(file, JSON.stringify(value, null, 2) + "\n");
export function cleanOutput(text) {
  return text
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
    .replace(/\b(?:sk-[\w-]{12,}|Bearer\s+[\w.\-/+=]{8,})/gi, "[redacted]")
    .slice(-12000);
}
export async function dailyLog(root, event, fields = {}) {
  const dir = path.join(root, "logs/project-launcher");
  await fs.mkdir(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  for (const f of await fs.readdir(dir))
    if (
      /^project-launcher-\d{4}-\d\d-\d\d\.log$/.test(f) &&
      (await fs.stat(path.join(dir, f))).mtimeMs < Date.now() - 30 * 86400000
    )
      await fs.rm(path.join(dir, f));
  await fs.appendFile(
    path.join(dir, `project-launcher-${date}.log`),
    JSON.stringify({ time: new Date().toISOString(), event, ...fields }) + "\n",
  );
}

export async function managementFingerprint(root) {
  const hash = createHash("sha256");
  for (const file of [
    "kernel/manifest.json",
    "kernel/launcher/entry.mjs",
    "kernel/launcher/manager.mjs",
    "kernel/launcher/build.mjs",
    "kernel/launcher/io.mjs",
    "kernel/launcher/setup-ui.mjs",
    "kernel/services/ai-config/server.mjs",
  ])
    hash.update(await fs.readFile(path.join(root, file)));
  for(const directory of ['kernel/configuration','kernel/ui/setup']) {
    async function scan(relative){
      for(const item of (await fs.readdir(path.join(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
        if(item.name.startsWith('.')||['node_modules','test','ai-tasks'].includes(item.name))continue;
        const name=relative+'/'+item.name;
        if(item.isDirectory())await scan(name);
        else if(item.isFile()&&/\.(mjs|tsx?|css|html)$/.test(name))hash.update(name).update(await fs.readFile(path.join(root,name)));
      }
    }
    await scan(directory);
  }
  return hash.digest("hex");
}
