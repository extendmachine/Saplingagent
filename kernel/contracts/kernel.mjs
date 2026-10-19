import fs from "node:fs/promises";
import {ensureManagedDirectory} from "./local-storage.mjs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PUBLIC_BRIDGE_FILES } from "../compat/paths.mjs";
export { PUBLIC_BRIDGE_FILES };
export const isContainedKernelPath = file => isKernelPath(file) && (file.startsWith("kernel/") || PUBLIC_BRIDGE_FILES.includes(file));
// Historical display numbers are mapped only for comparison, never rewritten in backups.
export function comparableKernelVersion(version) {
 const legacy = {"0.90":"0.9.0", "0.91":"0.9.2", "0.92":"0.9.3"};
 return (legacy[version] || version).split(".").map(Number);
}
export const KERNEL_BASELINE = "0.90";
export const KERNEL_MANIFEST = "kernel/manifest.json";
export class KernelError extends Error {
	constructor(code, message, status = 409) {
		super(message);
		Object.assign(this, {
			code,
			status
		});
	}
}
export const KERNEL_FILE_PATHS = [
	"Saplingagent.sh",
	"install.sh",
	"config/macos.json",
	"config/windows.json",
	"contracts/kernel.mjs",
	"contracts/release.mjs",
	"contracts/project-launcher.mjs", // Historical0.92 baseline; new public entry lives under kernel/.
	"contracts/local-process.mjs",
	"contracts/runtime-drain.mjs",
	"contracts/engine-dependencies.mjs",
	"contracts/ai-configuration.mjs",
	"contracts/codex-rpc.mjs",
	"backend/agent-runtime/rpc.mjs",
	"backend/agent-runtime/approval.mjs",
	"backend/agent-runtime/permissions.mjs",
	"backend/agent-runtime/turn-progress.mjs",
	"backend/agent-runtime/test/approval.test.mjs",
	"backend/agent-runtime/test/claude.test.mjs",
	"backend/agent-runtime/test/configured-engine.test.mjs",
	"backend/agent-runtime/test/kernel-http.test.mjs",
	"backend/agent-runtime/test/opencode-messages.test.mjs",
	"backend/agent-runtime/test/permissions.test.mjs",
	"backend/agent-runtime/test/provider-contract.test.mjs",
	"backend/agent-runtime/test/rpc.test.mjs",
	"backend/agent-runtime/test/progress-clock.mjs",
	"backend/agent-runtime/test/turn-progress.test.mjs",
	"backend/agent-runtime/test/turn-progress-integration.test.mjs"
];
export const KERNEL_DIRECTORY_PATHS = [
	"kernel/",
	"scripts/",
	"backend/runtime-manager/",
	"backend/ai-config/",
	"backend/agent-runtime/providers/",
	"front/ai-config/"
];
export function isKernelPath(file) {
	if (["scripts/launcher/git-storage.mjs", "scripts/launcher/source-update.mjs", "scripts/test/git-storage.test.mjs", "scripts/test/source-update.test.mjs"].includes(file)) return false;
	if (typeof file !== "string" || /[\x00-\x1f\x7f:]/.test(file) || /(?:^|\/)(?:\.DS_Store|selfdata\.json|auth\.json|service-token)$/.test(file) || file.includes("\\") || file.startsWith("/") || file.split("/").some((p) => !p || p === "." || p === ".." || p.startsWith(".test-")) || /(^|\/)(?:node_modules|data|logs|local-secrets|secrets|\.secrets|snapshots|\.runtime|\.cache|\.git|\.worktrees|\.venv|__pycache__|dist|build|ai-tasks)(\/|$)/.test(file)) return false;
	return (KERNEL_FILE_PATHS.includes(file) || KERNEL_DIRECTORY_PATHS.some((prefix) => file.startsWith(prefix))) && !/(?:\.tsbuildinfo|\.py[co]|\.log|\.env(?:\..*)?|\.key|\.pem|\.p12|\.pfx)$/.test(file);
}
export function validateKernelManifest(value) {
	if (!value || value.schemaVersion !== 3 || typeof value.version !== "string" || !/^\d+\.\d+(?:\.\d+)?$/.test(value.version) || !Number.isInteger(value.appApi) || value.appApi < 1 || typeof value.minNode !== "string" || !/^\d+\.\d+\.\d+$/.test(value.minNode) || !Array.isArray(value.files) || !value.files.length || value.files.length > 512) throw new KernelError("INVALID_KERNEL", "Unsupported kernel manifest. Schema3 is required to preserve application-owned modules.", 400);
	if(value.layoutVersion!==undefined&&value.layoutVersion!==1)throw new KernelError("INVALID_KERNEL","Unsupported kernel directory layout.",400);
	const seen = new Set();
	let total = 0;
	for (const file of value.files) {
		if (!file || value.layoutVersion===1&&!isContainedKernelPath(file.path) || !isKernelPath(file.path) || file.path === KERNEL_MANIFEST || seen.has(file.path) || !Number.isInteger(file.bytes) || file.bytes < 0 || file.bytes > 8 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(file.sha256) || typeof file.executable !== "boolean") throw new KernelError("INVALID_KERNEL", "Invalid kernel file entry.", 400);
		seen.add(file.path);
		total += file.bytes;
	}
	if (total > 64 * 1024 * 1024) throw new KernelError("INVALID_KERNEL", "Kernel package exceeds its size budget.", 400);
	for (const required of [
		"kernel/manager.mjs",
		"kernel/recover.mjs",
		"contracts/kernel.mjs",
		"Saplingagent.sh",
		"scripts/dev.mjs"
	]) if (!seen.has(required)) throw new KernelError("INVALID_KERNEL", "Kernel package is missing " + required, 400);
	return value;
}
async function readMetadata(root, file, limit) {
	const target = path.join(root, file), stat = await fs.lstat(target);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw new Error("Invalid kernel metadata.");
	return JSON.parse(await fs.readFile(target, "utf8"));
}
export async function kernelStatus(root) {
	try {
		const manifest = validateKernelManifest(await readMetadata(root, KERNEL_MANIFEST, 512 * 1024));
		let receipt = {};
		try {
			receipt = await readMetadata(root, ".runtime/kernel/state.json", 65536);
		} catch (error) {
			if (error.code !== "ENOENT") return {
				baselineVersion: KERNEL_BASELINE,
				version: manifest.version,
				appApi: manifest.appApi,
				state: "invalid",
				warning: "Installed kernel receipt requires inspection."
			};
		}
		return {
			baselineVersion: KERNEL_BASELINE,
			version: manifest.version,
			appApi: manifest.appApi,
			state: "managed",
			...typeof receipt.sourceCommit === "string" && /^[a-f0-9]{40}$/.test(receipt.sourceCommit) ? { sourceCommit: receipt.sourceCommit } : {},
			...typeof receipt.installedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receipt.installedAt) ? { installedAt: receipt.installedAt } : {},
			...typeof receipt.lastBackupId === "string" && /^[a-f0-9-]{36}$/.test(receipt.lastBackupId) ? { lastBackupId: receipt.lastBackupId } : {}
		};
	} catch (error) {
		return {
			baselineVersion: KERNEL_BASELINE,
			version: KERNEL_BASELINE,
			appApi: 1,
			state: error.code === "ENOENT" ? "legacy" : "invalid",
			...error.code === "ENOENT" ? {} : { warning: "Kernel manifest requires inspection; baseline is shown." }
		};
	}
}
export async function assertSetupAvailable(root) {
  let job;
  try { job=JSON.parse(await fs.readFile(path.join(root,'.runtime/project-finalization.json'),'utf8')); }
  catch(error) { if(error.code==='ENOENT')return;throw new KernelError('PROJECT_BUSY','Inspect the setup restart lease before starting or installing.'); }
  if(job?.schemaVersion!==1||typeof job.id!=='string'||!/^[a-f0-9-]{36}$/i.test(job.id)||process.env.SAPLING_SETUP_JOB!==job.id)
    throw new KernelError('PROJECT_BUSY','Saved setup is restarting. Wait for it to finish; inspect .runtime/project-finalization.json if interrupted.');
}
export async function acquireKernelLock(root, purpose) {
  await assertSetupAvailable(root);
	let job;
	try { job = JSON.parse(await fs.readFile(path.join(root, ".runtime/kernel/active-job.json"), "utf8")); }
	catch (error) { if (error.code !== "ENOENT") throw new KernelError("KERNEL_BUSY", "Inspect the maintenance lease before starting."); }
	if (job && (!job.jobId || process.env.SAPLING_MAINTENANCE_JOB !== job.jobId)) throw new KernelError("KERNEL_BUSY", "Kernel maintenance is active. Use its recovery page; inspect .runtime/kernel/active-job.json if its worker exited.");
	const directory = path.join(root, ".runtime");
	await ensureManagedDirectory(root, ".runtime");
	const file = path.join(directory, "kernel-operation.lock"), id = randomUUID();
	let handle, identity;
	try {
		handle = await fs.open(file, "wx", 0o600);
		identity = await handle.stat();
		await handle.writeFile(JSON.stringify({
			id,
			pid: process.pid,
			purpose,
			createdAt: new Date().toISOString()
		}));
		await handle.sync();
	} catch (error) {
		await handle?.close().catch(()=>{});
		const current = await fs.lstat(file).catch(()=>null);
		if (identity && current?.isFile() && current.dev===identity.dev && current.ino===identity.ino) await fs.rm(file).catch(()=>{});
		if (error.code === "EEXIST") throw new KernelError("KERNEL_BUSY", "A kernel/start operation lock exists. Wait; if its owner exited, inspect and remove .runtime/kernel-operation.lock manually.");
		throw error;
	}
	return async ({preserve=false}={}) => {
		await handle.close();
		if(preserve)return; // Keep an inspection receipt when child ownership could not be recorded.
		try {
			if (JSON.parse(await fs.readFile(file, "utf8")).id === id) await fs.unlink(file);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	};
}
export async function assertKernelOffline(root) {
	let address;
	try {
		address = JSON.parse(await fs.readFile(path.join(root, ".runtime/runtime-address.json"), "utf8"));
	} catch (error) {
		if (error.code !== "ENOENT") throw new KernelError("KERNEL_BUSY", "Runtime discovery is invalid. Inspect it before updating or starting.");
	}
	if(address?.root && path.resolve(address.root)!==path.resolve(root))address=null;
	if (address) {
		if (!Number.isSafeInteger(address.pid) || address.pid <= 0 || typeof address.instanceId !== "string") throw new KernelError("KERNEL_BUSY", "Runtime ownership could not be verified.");
		let active = true;
		try {
			process.kill(address.pid, 0);
		} catch (error) {
			if (error.code === "ESRCH") active = false;
		}
		if (active) throw new KernelError("KERNEL_BUSY", "Stop this application before kernel maintenance or starting another instance.");
	}
	for (const name of [
		"macos-install.lock",
		"windows-install.lock",
		"node-install.lock",
		"windows-node.lock"
	]) {
		try {
			await fs.lstat(path.join(root, ".runtime", name));
			throw new KernelError("KERNEL_BUSY", "Finish the active dependency installation first.");
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
}
