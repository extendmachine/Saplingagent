import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { isKernelPath, validateKernelManifest, KERNEL_FILE_PATHS, KERNEL_DIRECTORY_PATHS } from "../contracts/kernel.mjs";
export async function scanKernelFiles(root) {
	const files = [];
	async function walk(directory) {
		for (const entry of await fs.readdir(path.join(root, directory), { withFileTypes: true })) {
			const name = directory ? directory + "/" + entry.name : entry.name;
			if ([
				"node_modules",
				".venv",
				"__pycache__",
				".git",
				".runtime",
				".worktrees",
				".cache",
				"data",
				"logs",
				"snapshots",
				"local-secrets",
				"secrets",
				".secrets",
				"dist",
				"build",
				"ai-tasks"
			].includes(entry.name) || entry.name.startsWith(".test-")) continue;
			if (entry.isDirectory()) await walk(name);
			else if (isKernelPath(name) && name !== "kernel/manifest.json") {
				if (entry.isSymbolicLink()) throw Error("Kernel source cannot contain symlinks: " + name);
				const bytes = await fs.readFile(path.join(root, name)), stat = await fs.stat(path.join(root, name));
				files.push({
					path: name,
					sha256: createHash("sha256").update(bytes).digest("hex"),
					bytes: bytes.length,
					executable: !!(stat.mode & 0o111)
				});
			}
		}
	}
	for (const prefix of KERNEL_DIRECTORY_PATHS) {
		const directory = prefix.slice(0, -1);
		try {
			await walk(directory);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	for (const name of KERNEL_FILE_PATHS) {
		try {
			const file = path.join(root, name), stat = await fs.lstat(file);
			if (!stat.isFile() || stat.isSymbolicLink()) throw Error("Kernel source must be a regular file: " + name);
			const bytes = await fs.readFile(file);
			files.push({
				path: name,
				sha256: createHash("sha256").update(bytes).digest("hex"),
				bytes: bytes.length,
				executable: !!(stat.mode & 0o111)
			});
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	files.sort((a, b) => a.path.localeCompare(b.path));
	return files;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), file = path.join(root, "kernel/manifest.json");
	const check = process.argv.includes("--check");
	if (!check && !process.argv.includes("--maintainer")) throw Error("Manifest generation is maintainer-only; use --maintainer deliberately. Do not erase a customer source baseline.");
	let previous = {};
	try {
		previous = JSON.parse(await fs.readFile(file, "utf8"));
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	const files = await scanKernelFiles(root);
	const manifest = validateKernelManifest({
		schemaVersion: 3,
		version: previous.version || "0.91",
		appApi: previous.appApi || 1,
		minNode: previous.minNode || "24.11.0",
		notes: "Independent platform kernel. Updates may invalidate custom applications; back up, inspect conflicts and verify after dependency repair.",
		files
	});
	if (check) {
		if (JSON.stringify(previous) !== JSON.stringify(manifest)) throw Error("Kernel manifest is stale. Maintainer must regenerate and review before publishing.");
		console.log("Kernel manifest verified: " + files.length + " owned source files.");
	} else {
		await fs.writeFile(file, JSON.stringify(manifest, null, 2) + "\n");
		console.log("Generated kernel manifest for " + files.length + " source files.");
	}
}
