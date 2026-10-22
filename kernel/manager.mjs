import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { KernelError, KERNEL_MANIFEST, validateKernelManifest, kernelStatus, acquireKernelLock, isKernelPath, comparableKernelVersion } from "./contracts/kernel.mjs";
import { digest, readOwned, writeAtomic, safeFile, jsonRead, jsonWrite, validId, assertOffline, record } from "./storage.mjs";
import { assertMcpClientsStopped } from "./contracts/mcp-access.mjs";
export { kernelStatus };
const warning = "A kernel update can break custom applications, dependencies or integrations. Source backup does not back up business data or guarantee compatibility. Stop the app, review conflicts, and repair dependencies before restarting. Restore is manual.";
async function bounded(response, limit) {
	if (!response.ok) throw new KernelError(response.status === 404 ? "KERNEL_UNAVAILABLE" : "KERNEL_NETWORK", "The public release kernel is unavailable (HTTP " + response.status + "). No source was applied.", 502);
	const chunks = [];
	let size = 0;
	for await (const part of response.body) {
		size += part.length;
		if (size > limit) throw new KernelError("KERNEL_INTEGRITY", "Downloaded kernel file exceeds its budget.", 500);
		chunks.push(part);
	}
	return Buffer.concat(chunks);
}
export function githubSource({ fetchImpl = fetch } = {}) {
	const request = (url, limit) => fetchImpl(url, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "Saplingagent-Kernel/1"
		},
		redirect: "error",
		signal: AbortSignal.timeout(2e4)
	}).then((r) => bounded(r, limit)).catch((error) => {
		if (error instanceof KernelError) throw error;
		throw new KernelError("KERNEL_NETWORK", "Kernel download failed. Check the network and retry; no source was applied.", 502);
	});
	return {
		async resolve() {
			const info = JSON.parse((await request("https://api.github.com/repos/extendmachine/Saplingagent/commits/release", 1024 * 1024)).toString());
			if (!/^[a-f0-9]{40}$/.test(info.sha)) throw new KernelError("KERNEL_INTEGRITY", "Release revision was invalid.", 500);
			return info.sha;
		},
		async read(commit, file) {
			if (!/^[a-f0-9]{40}$/.test(commit) || !isKernelPath(file)) throw new KernelError("INVALID_PATH", "Invalid release source path.", 400);
			return request("https://raw.githubusercontent.com/extendmachine/Saplingagent/" + commit + "/" + file.split("/").map(encodeURIComponent).join("/"), file === KERNEL_MANIFEST ? 512 * 1024 : 8 * 1024 * 1024);
		}
	};
}
function compatible(local, target) {
 if(local.layoutVersion===1&&target.layoutVersion!==1)throw new KernelError("KERNEL_INCOMPATIBLE","A contained kernel cannot downgrade to distributed source paths. Restore explicitly instead.");
	const historical = /^0\.\d{2}$/.test(local.version) && /^0\.\d{2}$/.test(target.version);
	const tuple = value => historical ? value.split(".").map(Number) : comparableKernelVersion(value);
	const old = tuple(local.version), next = tuple(target.version);
	for (let i = 0; i < 3; i++) {
		const delta = (next[i] || 0) - (old[i] || 0);
		if (delta > 0) break;
		if (delta < 0) throw new KernelError("KERNEL_INCOMPATIBLE", "Release kernel is older than the installed version. Restore a known backup explicitly instead.");
	}
	if (local.appApi !== target.appApi) throw new KernelError("KERNEL_INCOMPATIBLE", "Kernel/application API changed. Use an explicit application migration; no files were changed.");
	const a = process.versions.node.split(".").map(Number), b = target.minNode.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if (a[i] > b[i]) return;
		if (a[i] < b[i]) throw new KernelError("KERNEL_INCOMPATIBLE", "This kernel requires project Node " + target.minNode + " or newer.");
	}
}
export async function checkKernel(root, { source = githubSource() } = {}) {
	let local, localManifestHash;
	try {
		const installed = await readOwned(root, KERNEL_MANIFEST);
		local = validateKernelManifest(JSON.parse(installed.bytes.toString()));
		localManifestHash = installed.hash;
	} catch {
		throw new KernelError("INVALID_KERNEL", "Install the current schema3 management tooling and reviewed baseline once. Obsolete broad manifests cannot be updated automatically; application files are unchanged.", 400);
	}
	const commit = await source.resolve();
	if (!/^[a-f0-9]{40}$/.test(commit)) throw new KernelError("KERNEL_INTEGRITY", "Invalid source revision.", 500);
	const bytes = await source.read(commit, KERNEL_MANIFEST);
	let target;
	try {
		target = validateKernelManifest(JSON.parse(bytes.toString()));
	} catch (error) {
		if (error instanceof KernelError) throw error;
		throw new KernelError("INVALID_KERNEL", "Release kernel manifest is invalid.", 400);
	}
	compatible(local, target);
	return {
		local,
		localManifestHash,
		target,
		manifestBytes: bytes,
		sourceCommit: commit,
		warning
	};
}
export async function prepareKernel(root, { source = githubSource() } = {}) {
	const checked = await checkKernel(root, { source }), id = randomUUID(), prefix = ".runtime/kernel/plans/" + id, old = new Map(checked.local.files.map((f) => [f.path, f])), next = new Map(checked.target.files.map((f) => [f.path, f])), changes = [], conflicts = [], preservedLocal = [];
	let index = 0;
	for (const file of new Set([...old.keys(), ...next.keys()])) {
		const before = await readOwned(root, file), previous = old.get(file), target = next.get(file), desired = target?.sha256 || null;
		const executable = !!(before.mode & 0o111);
		if (before.hash === desired && (!target || process.platform === "win32" || executable === target.executable)) continue;
		if (previous?.sha256 === desired && previous?.executable === target?.executable) {
			if (before.hash !== desired) preservedLocal.push(file);
			continue;
		}
		if (before.hash !== (previous?.sha256 || null) || previous && process.platform !== "win32" && executable !== previous.executable) {
			conflicts.push(file);
			continue;
		}
		const entry = {
			path: file,
			beforeHash: before.hash,
			beforeMode: before.mode,
			afterHash: desired,
			mode: target?.executable ? 0o755 : 0o644,
			index: index++
		};
		changes.push(entry);
	}
	const payloads = changes.filter((entry) => entry.afterHash !== null);
	for (let i = 0; i < payloads.length; i += 4) {
		const results = await Promise.allSettled(payloads.slice(i, i + 4).map(async (entry) => {
			const expected = next.get(entry.path), bytes = await source.read(checked.sourceCommit, entry.path);
			if (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256) throw new KernelError("KERNEL_INTEGRITY", "Release digest/size mismatch: " + entry.path, 500);
			await writeAtomic(root, prefix + "/files/" + entry.index, bytes, 0o600, { internal: true });
		}));
		// Wait for all staged writes before returning a download failure.
		const failed = results.find((result) => result.status === "rejected");
		if (failed) throw failed.reason;
	}
	const beforeManifest = await readOwned(root, KERNEL_MANIFEST);
	if (beforeManifest.hash !== checked.localManifestHash) throw new KernelError("KERNEL_CONFLICT", "Kernel baseline changed during preview. Check again.");
	if (beforeManifest.hash !== digest(checked.manifestBytes)) {
		const entry = {
			path: KERNEL_MANIFEST,
			beforeHash: beforeManifest.hash,
			beforeMode: beforeManifest.mode,
			afterHash: digest(checked.manifestBytes),
			mode: 0o644,
			index: index++
		};
		changes.push(entry);
		await writeAtomic(root, prefix + "/files/" + entry.index, checked.manifestBytes, 0o600, { internal: true });
	}
	const plan = {
		schemaVersion: 1,
		id,
		createdAt: new Date().toISOString(),
		sourceCommit: checked.sourceCommit,
		version: checked.target.version,
		appApi: checked.target.appApi,
		baselineManifestHash: beforeManifest.hash,
		changes,
		conflicts,
		preservedLocal,
		warning
	};
	await jsonWrite(root, prefix + "/plan.json", plan);
	await record(root, "kernel_plan", {
		id,
		changes: changes.length,
		conflicts: conflicts.length
	});
	return plan;
}
function validPlan(plan, id) {
	if (plan?.schemaVersion !== 1 || plan.id !== id || !/^[a-f0-9]{40}$/.test(plan.sourceCommit) || !/^[a-f0-9]{64}$/.test(plan.baselineManifestHash) || !Array.isArray(plan.changes) || plan.changes.length > 1025 || !Array.isArray(plan.conflicts) || !Array.isArray(plan.preservedLocal)) throw new KernelError("INVALID_PLAN", "Invalid kernel plan.", 400);
	const seen = new Set(), indexes = new Set();
	if (!/^\d+\.\d+(?:\.\d+)?$/.test(plan.version) || !Number.isInteger(plan.appApi)) throw new KernelError("INVALID_PLAN", "Invalid kernel version.", 400);
	for (const e of plan.changes) {
		if (!e || !isKernelPath(e.path) || seen.has(e.path) || indexes.has(e.index) || !Number.isInteger(e.beforeMode) || e.beforeMode < 0 || e.beforeMode > 0o777 || !Number.isSafeInteger(e.index) || e.index < 0 || e.index > 1024 || e.beforeHash !== null && !/^[a-f0-9]{64}$/.test(e.beforeHash) || e.afterHash !== null && !/^[a-f0-9]{64}$/.test(e.afterHash) || ![0o644, 0o755].includes(e.mode)) throw new KernelError("INVALID_PLAN", "Invalid planned file.", 400);
		seen.add(e.path);
		indexes.add(e.index);
	}
	return plan;
}
export async function inspectKernelPlan(root,id) {
 if(!validId(id))throw new KernelError('INVALID_PLAN','Invalid plan ID.',400);
 let plan;
 try {plan=validPlan(await jsonRead(root,'.runtime/kernel/plans/'+id+'/plan.json'),id);}
 catch(error){if(error.code==='ENOENT')throw new KernelError('INVALID_PLAN','Check for an update before applying.',400);throw error;}
 if(plan.conflicts.length)throw new KernelError('KERNEL_CONFLICT','Resolve locally changed kernel files before upgrading.');
 const current=await readOwned(root,KERNEL_MANIFEST);validateKernelManifest(JSON.parse(current.bytes.toString()));
 if(current.hash!==plan.baselineManifestHash)throw new KernelError('KERNEL_CONFLICT','Baseline changed. Check again.');
 return plan;
}
export async function applyKernel(root, id, { acceptRisk = false } = {}) {
	if (!validId(id)) throw new KernelError("INVALID_PLAN", "Invalid kernel plan ID.", 400);
	if (!acceptRisk) throw new KernelError("KERNEL_RISK_ACK_REQUIRED", warning);
	const release = await acquireKernelLock(root, "kernel-update");
	let backupId;
	try {
		await assertOffline(root);
		await assertMcpClientsStopped(root);
		const prefix = ".runtime/kernel/plans/" + id, plan = validPlan(await jsonRead(root, prefix + "/plan.json"), id);
		if (plan.conflicts.length) throw new KernelError("KERNEL_CONFLICT", "Locally changed kernel files require deliberate merging: " + plan.conflicts.join(", "));
		const installed = await readOwned(root, KERNEL_MANIFEST);
		validateKernelManifest(JSON.parse(installed.bytes.toString()));
		if (installed.hash !== plan.baselineManifestHash) throw new KernelError("KERNEL_CONFLICT", "Kernel baseline changed after preview. Check again.");
		const current = [];
		for (const entry of plan.changes) {
			const before = await readOwned(root, entry.path);
			if (before.hash !== entry.beforeHash || process.platform !== "win32" && before.mode !== entry.beforeMode) throw new KernelError("KERNEL_CONFLICT", "Source changed after preview: " + entry.path);
			let bytes = null;
			if (entry.afterHash !== null) {
				const file = await safeFile(root, prefix + "/files/" + entry.index, { internal: true });
				const stat = await fs.stat(file);
				if (stat.size > 8 * 1024 * 1024) throw new KernelError("INVALID_PLAN", "Staged source is too large.", 400);
				bytes = await fs.readFile(file);
				if (digest(bytes) !== entry.afterHash) throw new KernelError("KERNEL_INTEGRITY", "Staged file integrity mismatch.", 500);
				if (entry.path === KERNEL_MANIFEST) {
					const target = validateKernelManifest(JSON.parse(bytes.toString()));
					if (target.version !== plan.version || target.appApi !== plan.appApi) throw new KernelError("INVALID_PLAN", "Staged manifest does not match the preview.", 400);
				}
			}
			current.push({
				entry,
				before,
				bytes
			});
		}
		if (!current.length) return {
			changed: false,
			version: plan.version,
			sourceCommit: plan.sourceCommit,
			warning
		};
		backupId = randomUUID();
		const backup = ".runtime/kernel/backups/" + backupId;
		let previousState = null;
		try {
			const statePath = await safeFile(root, ".runtime/kernel/state.json", { internal: true });
			if ((await fs.stat(statePath)).size > 65536) throw new KernelError("INVALID_PLAN", "Installed receipt is too large; inspect before updating.", 400);
			previousState = await fs.readFile(statePath, "utf8");
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
		const journal = {
			schemaVersion: 1,
			id: backupId,
			planId: id,
			createdAt: new Date().toISOString(),
			phase: "prepared",
			sourceCommit: plan.sourceCommit,
			previousState,
			files: []
		};
		for (let i = 0; i < current.length; i++) {
			const { entry, before } = current[i];
			journal.files.push({
				...entry,
				originalIndex: i,
				beforeMode: before.mode
			});
			if (before.bytes !== null) await writeAtomic(root, backup + "/original/" + i, before.bytes, 0o600, { internal: true });
		}
		await jsonWrite(root, backup + "/journal.json", journal);
		await writeAtomic(root, ".runtime/kernel/recover.mjs", await fs.readFile(path.join(root, "kernel/recover.mjs")), 0o600, { internal: true });
		journal.phase = "applying";
		await jsonWrite(root, backup + "/journal.json", journal);
		try {
			for (const { entry, bytes } of current) {
				if (bytes === null) await fs.unlink(await safeFile(root, entry.path));
				else await writeAtomic(root, entry.path, bytes, entry.mode);
			}
			await jsonWrite(root, ".runtime/kernel/state.json", {
				schemaVersion: 1,
				version: plan.version,
				appApi: plan.appApi,
				sourceCommit: plan.sourceCommit,
				installedAt: new Date().toISOString(),
				lastBackupId: backupId
			});
			journal.phase = "applied";
			await jsonWrite(root, backup + "/journal.json", journal);
		} catch (error) {
			journal.phase = "partial";
			await jsonWrite(root, backup + "/journal.json", journal).catch(() => {});
			throw new KernelError("KERNEL_APPLY_FAILED", "Kernel source apply was interrupted. Backup " + backupId + " is retained; use the saved recovery helper before starting.", 500);
		}
		await record(root, "kernel_applied", {
			id,
			backupId,
			version: plan.version
		});
		return {
			changed: true,
			version: plan.version,
			sourceCommit: plan.sourceCommit,
			backupId,
			needsDependencyRepair: true,
			warning
		};
	} finally {
		await release();
	}
}
export async function kernelBackups(root) {
	let entries;
	try {
		entries = await fs.readdir(await safeFile(root, ".runtime/kernel/backups", { internal: true }));
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
	const result = [];
	for (const id of entries.filter(validId)) {
		try {
			const j = await jsonRead(root, ".runtime/kernel/backups/" + id + "/journal.json");
			result.push({
				id,
				createdAt: j.createdAt,
				phase: j.phase
			});
		} catch {
			result.push({
				id,
				phase: "invalid"
			});
		}
	}
	return result.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}
