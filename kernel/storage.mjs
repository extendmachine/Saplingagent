import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { KernelError, isKernelPath, KERNEL_MANIFEST, assertKernelOffline } from "./contracts/kernel.mjs";
export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const validId = (id) => typeof id === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
export async function safeFile(root, file, { internal = false } = {}) {
	if (!(internal ? /^(?:\.runtime\/kernel|logs\/kernel-manager)(?:\/|$)/.test(file) && !file.includes("\\") && !file.split("/").some((x) => x === ".." || x === "." || !x) : isKernelPath(file) || file === KERNEL_MANIFEST)) throw new KernelError("INVALID_PATH", "Invalid kernel-owned path.", 400);
	const parts = file.split("/");
	let current = await fs.realpath(root);
	for (const part of parts) {
		current = path.join(current, part);
		try {
			const stat = await fs.lstat(current);
			if (stat.isSymbolicLink()) throw new KernelError("INVALID_PATH", "Kernel updater refuses a symbolic link: " + file, 400);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	return current;
}
export async function readOwned(root, file) {
	const target = await safeFile(root, file);
	try {
		const handle = await fs.open(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
		try {
			const stat = await handle.stat();
			if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new KernelError("INVALID_PATH", "Kernel source is not a bounded regular file: " + file, 400);
			const bytes = await handle.readFile();
			return {
				bytes,
				hash: digest(bytes),
				mode: stat.mode & 0o777
			};
		} finally {
			await handle.close();
		}
	} catch (error) {
		if (error.code === "ENOENT") return {
			bytes: null,
			hash: null,
			mode: 0o644
		};
		throw error;
	}
}
export async function writeAtomic(root, file, bytes, mode = 0o644, { internal = false } = {}) {
	const target = await safeFile(root, file, { internal });
	await fs.mkdir(path.dirname(target), { recursive: true });
	await safeFile(root, file, { internal });
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
export async function jsonRead(root, file) {
	const target = await safeFile(root, file, { internal: true });
	const stat = await fs.stat(target);
	if (stat.size > 4 * 1024 * 1024) throw new KernelError("INVALID_PLAN", "Kernel record exceeds its budget.", 400);
	return JSON.parse(await fs.readFile(target, "utf8"));
}
export const jsonWrite = (root, file, value) => writeAtomic(root, file, Buffer.from(JSON.stringify(value, null, 2) + "\n"), 0o600, { internal: true });
export const assertOffline = assertKernelOffline;
export async function record(root, event, fields = {}) {
	try {
		const day = new Date().toISOString().slice(0, 10), dir = await safeFile(root, "logs/kernel-manager", { internal: true });
		await fs.mkdir(dir, { recursive: true });
		for (const e of await fs.readdir(dir, { withFileTypes: true })) {
			if (e.isFile() && /^kernel-manager-\d{4}-\d{2}-\d{2}\.log$/.test(e.name)) {
				const f = path.join(dir, e.name);
				if ((await fs.stat(f)).mtimeMs < Date.now() - 30 * 864e5) await fs.unlink(f);
			}
		}
		await fs.appendFile(path.join(dir, "kernel-manager-" + day + ".log"), JSON.stringify({
			time: new Date().toISOString(),
			event,
			...fields
		}) + "\n", { mode: 0o600 });
	} catch {}
}
