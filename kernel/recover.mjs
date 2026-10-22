// Self-contained source recovery, also copied into .runtime/kernel before updates.
// Keep this free of project imports so a broken new kernel can be recovered.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const idOk = (id) => typeof id === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
const KERNEL_FILE_PATHS = [
	"Saplingagent.sh",
	"install.sh",
	"config/macos.json",
	"config/windows.json",
	"contracts/kernel.mjs",
	"contracts/release.mjs",
	"contracts/project-launcher.mjs",
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
const KERNEL_DIRECTORY_PATHS = [
	"kernel/",
	"scripts/",
	"backend/runtime-manager/",
	"backend/ai-config/",
	"backend/agent-runtime/providers/",
	"front/ai-config/"
];
function owned(file) {
	if (["scripts/launcher/git-storage.mjs", "scripts/launcher/source-update.mjs", "scripts/test/git-storage.test.mjs", "scripts/test/source-update.test.mjs"].includes(file)) return false;
	if (typeof file !== "string" || /[\x00-\x1f\x7f:]/.test(file) || /(?:^|\/)(?:\.DS_Store|selfdata\.json|auth\.json|service-token)$/.test(file) || file.includes("\\") || file.startsWith("/") || file.split("/").some((p) => !p || p === "." || p === ".." || p.startsWith(".test-")) || /(^|\/)(?:node_modules|data|logs|local-secrets|secrets|\.secrets|snapshots|\.runtime|\.cache|\.git|\.worktrees|\.venv|__pycache__|dist|build|ai-tasks)(\/|$)/.test(file)) return false;
	return (KERNEL_FILE_PATHS.includes(file) || KERNEL_DIRECTORY_PATHS.some((prefix) => file.startsWith(prefix))) && !/(?:\.tsbuildinfo|\.py[co]|\.log|\.env(?:\..*)?|\.key|\.pem|\.p12|\.pfx)$/.test(file);
}
async function safe(root, file) {
	if (/[\x00-\x1f\x7f:]/.test(file) || file.includes("\\") || file.startsWith("/") || file.split("/").some((x) => !x || x === "." || x === "..")) throw Error("Invalid recovery path.");
	let target = root;
	for (const part of file.split("/")) {
		target = path.join(target, part);
		try {
			if ((await fs.lstat(target)).isSymbolicLink()) throw Error("Recovery refuses symbolic links: " + file);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	return target;
}
async function bytesAt(root, file) {
	try {
		const filePath = await safe(root, file), handle = await fs.open(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
		try {
			const stat = await handle.stat();
			if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw Error("Invalid recovery file size.");
			return await handle.readFile();
		} finally {
			await handle.close();
		}
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw error;
	}
}
async function atomic(root, file, bytes, mode = 0o600) {
	const target = await safe(root, file);
	await fs.mkdir(path.dirname(target), { recursive: true });
	const temp = target + "." + randomUUID() + ".tmp";
	try {
		const handle = await fs.open(temp, "wx", mode);
		try {
			await handle.writeFile(bytes);
			await handle.sync();
		} finally {
			await handle.close();
		}
		await fs.rename(temp, target);
		await fs.chmod(target, mode);
	} finally {
		await fs.rm(temp, { force: true });
	}
}
// Recovery must also work when the newly installed kernel cannot be imported.
// This intentionally duplicates only the conservative ownership-file check.
async function assertRecoveryMcpStopped(root) {
 const fail=()=>Object.assign(new Error('Close this project\'s MCP connections before restoring. Inspect .runtime/mcp-access/clients if a client crashed.'),{code:'MCP_CLIENTS_ACTIVE'});
 let directory=root;
 for(const part of ['.runtime','mcp-access','clients']) {
  directory=path.join(directory,part);
  const stat=await fs.lstat(directory).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(!stat)return;
  if(!stat.isDirectory()||stat.isSymbolicLink())throw fail();
 }
 for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
  if(!entry.isFile()||!idOk(entry.name.replace(/\.json$/,''))||!entry.name.endsWith('.json'))throw fail();
  let value;try{value=JSON.parse(await fs.readFile(path.join(directory,entry.name),'utf8'));}catch{throw fail();}
  if(value.schemaVersion!==1||value.id+'.json'!==entry.name||value.root!==root||!Number.isSafeInteger(value.pid)||value.pid<=0)throw fail();
  try{process.kill(value.pid,0);throw fail();}catch(error){if(error.code!=='ESRCH')throw fail();}
 }
}
export async function restoreKernel(root, id) {
	root = await fs.realpath(root);
	if (!idOk(id)) throw Error("Invalid kernel backup ID.");
 let lease;
 try {lease=JSON.parse(await fs.readFile(path.join(root,'.runtime/kernel/active-job.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Invalid maintenance lease. Inspect it before recovery.');}
 if(lease&&process.env.SAPLING_MAINTENANCE_JOB!==lease.jobId)throw Error('Maintenance is active. Use its explicit recovery page or inspect the exited worker first.');
	await fs.mkdir(path.join(root, ".runtime"), { recursive: true });
	const lock = path.join(root, ".runtime/kernel-operation.lock"), lockId = randomUUID();
	let handle;
	try {
		handle = await fs.open(lock, "wx", 0o600);
		await handle.writeFile(JSON.stringify({
			id: lockId,
			pid: process.pid,
			purpose: "kernel-restore"
		}));
	} catch (error) {
		await handle?.close();
		throw Error(error.code === "EEXIST" ? "An app/kernel operation lock exists. Verify its owner before manual recovery." : error.message);
	}
	try {
		await assertRecoveryMcpStopped(root);
		let address;
		try {
			address = JSON.parse(await fs.readFile(path.join(root, ".runtime/runtime-address.json"), "utf8"));
		} catch (error) {
			if (error.code !== "ENOENT") throw Error("Inspect invalid runtime discovery before recovery.");
		}
		if (address) {
			if (!Number.isSafeInteger(address.pid) || address.pid <= 0) throw Error("Invalid runtime owner.");
			let active = true;
			try {
				process.kill(address.pid, 0);
			} catch (error) {
				if (error.code === "ESRCH") active = false;
			}
			if (active) throw Error("Stop this application before restoring the kernel.");
		}
		for (const name of [
			"macos-install.lock",
			"windows-install.lock",
			"node-install.lock",
			"windows-node.lock"
		]) {
			try {
				await fs.lstat(path.join(root, ".runtime", name));
				throw Error("Finish dependency installation before recovery.");
			} catch (error) {
				if (error.code !== "ENOENT") throw error;
			}
		}
		const prefix = ".runtime/kernel/backups/" + id, journalBytes = await bytesAt(root, prefix + "/journal.json");
		if (!journalBytes) throw Error("Kernel backup is unavailable.");
		const journal = JSON.parse(journalBytes);
		if (journal.schemaVersion !== 1 || journal.id !== id || !Array.isArray(journal.files) || journal.files.length > 1025 || journal.previousState !== null && (typeof journal.previousState !== "string" || journal.previousState.length > 65536)) throw Error("Invalid recovery journal.");
		const entries = [], seen = new Set();
		for (const e of journal.files) {
			if (!e || !owned(e.path) || seen.has(e.path) || !Number.isInteger(e.originalIndex) || e.originalIndex < 0 || e.originalIndex > 1024 || e.beforeHash !== null && !/^[a-f0-9]{64}$/.test(e.beforeHash) || e.afterHash !== null && !/^[a-f0-9]{64}$/.test(e.afterHash) || ![0o644, 0o755].includes(e.mode) || !Number.isInteger(e.beforeMode) || e.beforeMode < 0 || e.beforeMode > 0o777) throw Error("Invalid recovery entry.");
			seen.add(e.path);
			const current = await bytesAt(root, e.path), currentHash = current === null ? null : hash(current);
			const currentMode = current === null ? null : (await fs.stat(await safe(root, e.path))).mode & 0o777;
			if (process.platform !== "win32" && current !== null && !(currentHash === e.beforeHash && currentMode === e.beforeMode || currentHash === e.afterHash && currentMode === e.mode)) throw Error("Recovery mode conflict; preserve later permission edits: " + e.path);
			if (currentHash !== e.beforeHash && currentHash !== e.afterHash) throw Error("Recovery conflict; keep later edits and merge deliberately: " + e.path);
			const original = e.beforeHash === null ? null : await bytesAt(root, prefix + "/original/" + e.originalIndex);
			if (e.beforeHash !== null && (original === null || hash(original) !== e.beforeHash)) throw Error("Original backup digest mismatch.");
			if (e.path === "kernel/manifest.json" && original !== null && JSON.parse(original.toString()).schemaVersion !== 3) throw Error("Backup uses obsolete broad kernel ownership. Reconcile it manually while retaining application modules.");
			entries.push({
				e,
				original
			});
		}
		// Inspect every target before writing any; explicit recovery can be retried after interruption.
		journal.phase = "restoring";
		await atomic(root, prefix + "/journal.json", Buffer.from(JSON.stringify(journal, null, 2) + "\n"));
		for (const { e, original } of entries) {
			if (original === null) await fs.rm(await safe(root, e.path), { force: true });
			else await atomic(root, e.path, original, e.beforeMode);
		}
		if (journal.previousState === null) await fs.rm(await safe(root, ".runtime/kernel/state.json"), { force: true });
		else await atomic(root, ".runtime/kernel/state.json", Buffer.from(journal.previousState));
		journal.phase = "restored";
		await atomic(root, prefix + "/journal.json", Buffer.from(JSON.stringify(journal, null, 2) + "\n"));
		return {
			restored: true,
			backupId: id,
			needsDependencyRepair: true
		};
	} finally {
		await handle.close();
		try {
			if (JSON.parse(await fs.readFile(lock, "utf8")).id === lockId) await fs.unlink(lock);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const directory = path.dirname(fileURLToPath(import.meta.url));
	const root = path.resolve(directory, directory.endsWith(path.join(".runtime", "kernel")) ? "../.." : "..");
	try {
		const result = await restoreKernel(root, process.argv[2]);
		console.log(JSON.stringify(result));
		console.log("Kernel source restored. Repair dependencies, then restart and verify the application.");
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
