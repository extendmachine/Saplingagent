import { scanKernelFiles } from "../build-manifest.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isKernelPath, validateKernelManifest, kernelStatus, acquireKernelLock } from "../contracts/kernel.mjs";
import { prepareKernel, applyKernel, githubSource } from "../manager.mjs";
import { restoreKernel } from "../recover.mjs";
const exec = promisify(execFile), sha = (bytes) => createHash("sha256").update(bytes).digest("hex"), commit = "a".repeat(40);
const parent = fileURLToPath(new URL("../../.cache/kernel-tests/", import.meta.url));
const text = async (root, name, value) => {
	await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
	await fs.writeFile(path.join(root, name), value);
};
function manifest(files, version = "0.90") {
	return {
		schemaVersion: 3,
		version,
		appApi: 1,
		minNode: "24.11.0",
		notes: "Synthetic compatibility test",
		files: Object.entries(files).map(([name, bytes]) => ({
			path: name,
			sha256: sha(Buffer.from(bytes)),
			bytes: Buffer.byteLength(bytes),
			executable: name.endsWith(".sh")
		})).sort((a, b) => a.path.localeCompare(b.path))
	};
}
const applicationFiles = {
	"config/release.json": '{"schemaVersion":1,"version":"0.9.1"}',
	"front/chat/ChatPanel.tsx": "custom chat",
	"backend/workspace/server.mjs": "custom workspace/context",
	"backend/app-builder/server.mjs": "custom builder",
	"front/features/page-context/capture.ts": "custom page reader",
	"backend/mcp-runtime/server.mjs": "custom MCP",
	".agents/skills/seed-page-edit/SKILL.md": "custom default Skill",
	".agents/skills/seed-research/SKILL.md": "custom research Skill",
	".agents/skills/seed-skill-author/SKILL.md": "custom Skill author",
	".agents/.claude-plugin/plugin.json": "custom plugin registry",
	"front/main.tsx": "custom application entry",
	"front/styles.css": "custom application style",
	"front/package.json": "custom application dependencies",
	"front/package-lock.json": "custom application lock",
	"front/vite.config.ts": "custom application build",
	"backend/agent-runtime/server.mjs": "custom chat HTTP and page proxy",
	"backend/agent-runtime/tasks.mjs": "custom application context registration",
	"contracts/attachments.mjs": "custom attachment protocol",
	"contracts/agent-tools.mjs": "custom app tools"
};
async function fixture(t) {
	await fs.mkdir(parent, { recursive: true });
	const root = await fs.mkdtemp(path.join(parent, "app-"));
	t.after(() => fs.rm(root, {
		recursive: true,
		force: true
	}));
	const recovery = await fs.readFile(new URL("../recover.mjs", import.meta.url), "utf8");
	const old = {
		"kernel/manager.mjs": "old manager",
		"kernel/recover.mjs": recovery,
		"contracts/kernel.mjs": "old contract",
		"Saplingagent.sh": "old launcher",
		"scripts/dev.mjs": "old startup",
		"kernel/control-page.mjs": "old control"
	};
	for (const [name, value] of Object.entries(old)) await text(root, name, value);
	await fs.chmod(path.join(root, "Saplingagent.sh"), 0o755);
	for (const [name, value] of Object.entries({
		"front/App.tsx": "customer app",
		"front/features/invoices/Page.tsx": "customer feature",
		"backend/invoices/server.mjs": "customer service",
		"config/runtime.json": "customer ports",
		"config/services.json": "customer plan",
		"data/sessions/one.json": "private conversation",
		"data/attachments/one/payload.txt": "private upload",
		"local-secrets/key": "synthetic secret"
	})) await text(root, name, value);
	for (const [name, value] of Object.entries(applicationFiles)) await text(root, name, value);
	const local = manifest(old);
	await text(root, "kernel/manifest.json", JSON.stringify(local, null, 2) + "\n");
	const files = {
		...old,
		"kernel/manager.mjs": "new manager",
		"kernel/control-page.mjs": "new control",
		"kernel/new-tool.mjs": "new core"
	};
	const target = manifest(files, "0.91");
	const source = {
		resolve: async () => commit,
		read: async (revision, name) => {
			assert.equal(revision, commit);
			return Buffer.from(name === "kernel/manifest.json" ? JSON.stringify(target, null, 2) + "\n" : files[name]);
		}
	};
	return {
		root,
		old,
		files,
		target,
		source
	};
}
async function preserved(root) {
	for (const [name, value] of Object.entries({
		"front/App.tsx": "customer app",
		"front/features/invoices/Page.tsx": "customer feature",
		"backend/invoices/server.mjs": "customer service",
		"config/runtime.json": "customer ports",
		"config/services.json": "customer plan",
		"data/sessions/one.json": "private conversation",
		"data/attachments/one/payload.txt": "private upload",
		"local-secrets/key": "synthetic secret"
	})) assert.equal(await fs.readFile(path.join(root, name), "utf8"), value, name);
}
test("kernel ownership separates business/data/Git paths and validates complete package declarations", async () => {
	for (const file of [
		"kernel/control-page.mjs",
		"kernel/worker.mjs",
		"backend/runtime-manager/manager.mjs",
		"kernel/package-lock.json"
	]) assert.equal(isKernelPath(file), true, file);
	for (const file of [
		"front/App.tsx",
		"scripts/launcher/source-update.mjs",
		"scripts/launcher/git-storage.mjs",
		"backend/agent-runtime/package-lock.json",
		"backend/agent-runtime/git-versions.mjs",
		"front/features/git-version/GitVersionPanel.tsx",
		"front/features/runtime-control/RestartServices.tsx",
		"front/features/invoices/Page.tsx",
		"backend/invoices/server.mjs",
		"config/runtime.json",
		"config/services.json",
		"data/chat.json",
		".git/config",
		"../kernel/evil.mjs",
		"kernel/../../data/one",
		"kernel/node_modules/x",
		"backend/agent-runtime/ai-tasks/runtime/RUN.md"
	]) assert.equal(isKernelPath(file), false, file);
	assert.throws(() => validateKernelManifest(manifest({ "front/App.tsx": "bad" })), /entry/);
});
test("local/own Git kernel update retains history/remotes and personal business data; standalone helper restores source", async (t) => {
	const f = await fixture(t);
	await exec("git", [
		"init",
		"-b",
		"main",
		f.root
	]);
	await exec("git", [
		"-C",
		f.root,
		"config",
		"saplingagent.storageMode",
		"local"
	]);
	const before = await fs.readFile(path.join(f.root, ".git/HEAD"));
	const plan = await prepareKernel(f.root, { source: f.source });
	assert.equal(await fs.readFile(path.join(f.root, "kernel/manager.mjs"), "utf8"), "old manager");
	await assert.rejects(applyKernel(f.root, plan.id), { code: "KERNEL_RISK_ACK_REQUIRED" });
	const result = await applyKernel(f.root, plan.id, { acceptRisk: true });
	assert.ok(result.backupId);
	assert.equal(result.needsDependencyRepair, true);
	assert.equal(await fs.readFile(path.join(f.root, "kernel/manager.mjs"), "utf8"), "new manager");
	assert.equal((await kernelStatus(f.root)).version, "0.91");
	assert.deepEqual(await fs.readFile(path.join(f.root, ".git/HEAD")), before);
	assert.equal((await exec("git", [
		"-C",
		f.root,
		"remote"
	])).stdout, "");
	await preserved(f.root);
	const restored = await exec(process.execPath, [path.join(f.root, ".runtime/kernel/recover.mjs"), result.backupId], { cwd: f.root });
	assert.match(restored.stdout, /restored/);
	assert.equal((await kernelStatus(f.root)).version, "0.90");
	assert.equal(await fs.access(path.join(f.root, "kernel/new-tool.mjs")).then(() => true, () => false), false);
	await preserved(f.root);
});
test("locally changed kernel conflicts block writes; concurrent edits invalidate a checked plan", async (t) => {
	const f = await fixture(t);
	await text(f.root, "kernel/manager.mjs", "customer modified core");
	let plan = await prepareKernel(f.root, { source: f.source });
	assert.ok(plan.conflicts.includes("kernel/manager.mjs"));
	await assert.rejects(applyKernel(f.root, plan.id, { acceptRisk: true }), { code: "KERNEL_CONFLICT" });
	assert.equal(await fs.readFile(path.join(f.root, "Saplingagent.sh"), "utf8"), "old launcher");
	await text(f.root, "kernel/manager.mjs", "old manager");
	plan = await prepareKernel(f.root, { source: f.source });
	await text(f.root, "kernel/manager.mjs", "later edit");
	await assert.rejects(applyKernel(f.root, plan.id, { acceptRisk: true }), { code: "KERNEL_CONFLICT" });
	await preserved(f.root);
});
test("incompatible APIs, bad digests and missing release manifests cannot become a successful update", async (t) => {
	const f = await fixture(t);
	f.target.appApi = 2;
	await assert.rejects(prepareKernel(f.root, { source: f.source }), { code: "KERNEL_INCOMPATIBLE" });
	f.target.appApi = 1;
	f.files["kernel/manager.mjs"] = "corrupt source";
	let activeReads = 0;
	const delayedSource = {
		resolve: f.source.resolve,
		async read(revision, name) {
			activeReads++;
			try {
				if (name !== "kernel/manifest.json" && name !== "kernel/manager.mjs") await new Promise((resolve) => setTimeout(resolve, 25));
				return await f.source.read(revision, name);
			} finally {
				activeReads--;
			}
		}
	};
	await assert.rejects(prepareKernel(f.root, { source: delayedSource }), { code: "KERNEL_INTEGRITY" });
	assert.equal(activeReads, 0, "failed preview must settle all outstanding downloads before returning");
	const urls = [], source = githubSource({ fetchImpl: async (url) => {
		urls.push(url);
		return new Response(url.endsWith("/release") ? JSON.stringify({ sha: commit }) : "missing", { status: url.endsWith("/release") ? 200 : 404 });
	} });
	await assert.rejects(prepareKernel(f.root, { source }), { code: "KERNEL_UNAVAILABLE" });
	assert.ok(urls[1].includes("/" + commit + "/kernel/manifest.json"));
	assert.equal(await fs.readFile(path.join(f.root, "kernel/manager.mjs"), "utf8"), "old manager");
});
test("owned runtime, operation lock, symlinks and tampered staging block apply before source writes", async (t) => {
	const f = await fixture(t), plan = await prepareKernel(f.root, { source: f.source });
	await text(f.root, ".runtime/runtime-address.json", JSON.stringify({
		pid: process.pid,
		instanceId: "synthetic-active"
	}));
	await assert.rejects(applyKernel(f.root, plan.id, { acceptRisk: true }), { code: "KERNEL_BUSY" });
	await fs.unlink(path.join(f.root, ".runtime/runtime-address.json"));
	const release = await acquireKernelLock(f.root, "synthetic");
	await assert.rejects(applyKernel(f.root, plan.id, { acceptRisk: true }), { code: "KERNEL_BUSY" });
	await release();
	const e = plan.changes.find((x) => x.path === "kernel/manager.mjs");
	await text(f.root, ".runtime/kernel/plans/" + plan.id + "/files/" + e.index, "tampered");
	await assert.rejects(applyKernel(f.root, plan.id, { acceptRisk: true }), { code: "KERNEL_INTEGRITY" });
	await fs.unlink(path.join(f.root, "kernel/manager.mjs"));
	await fs.symlink(path.join(f.root, "front/App.tsx"), path.join(f.root, "kernel/manager.mjs"));
	await assert.rejects(prepareKernel(f.root, { source: f.source }), { code: "INVALID_PATH" });
	await preserved(f.root);
});
test("partial apply is reported and backed up without auto rollback; recovery refuses later edits", async (t) => {
	const f = await fixture(t), plan = await prepareKernel(f.root, { source: f.source });
	const originalRename = fs.rename;
	let writes = 0;
	fs.rename = async (a, b) => {
		if (b.startsWith(f.root + path.sep) && !b.includes(path.sep + ".runtime" + path.sep) && !b.includes(path.sep + "logs" + path.sep) && ++writes === 2) throw Object.assign(Error("synthetic disk failure"), { code: "EIO" });
		return originalRename(a, b);
	};
	try {
		await assert.rejects(applyKernel(f.root, plan.id, { acceptRisk: true }), { code: "KERNEL_APPLY_FAILED" });
	} finally {
		fs.rename = originalRename;
	}
	const backups = await fs.readdir(path.join(f.root, ".runtime/kernel/backups"));
	assert.equal(backups.length, 1);
	const id = backups[0], journal = JSON.parse(await fs.readFile(path.join(f.root, ".runtime/kernel/backups", id, "journal.json")));
	assert.equal(journal.phase, "partial");
	const changed = journal.files.find((e) => e.path === "kernel/control-page.mjs");
	assert.equal(await fs.readFile(path.join(f.root, changed.path), "utf8"), "new control");
	await text(f.root, changed.path, "later customer edit");
	await assert.rejects(restoreKernel(f.root, id), /conflict/);
	await text(f.root, changed.path, "new control");
	await restoreKernel(f.root, id);
	for (const [name, value] of Object.entries(f.old)) assert.equal(await fs.readFile(path.join(f.root, name), "utf8"), value);
	await preserved(f.root);
});
test("unchanged local core is preserved while removed core and mode changes can be restored", async (t) => {
	const f = await fixture(t);
	await text(f.root, "scripts/dev.mjs", "customer startup");
	delete f.files["kernel/control-page.mjs"];
	f.target.files = f.target.files.filter((x) => x.path !== "kernel/control-page.mjs");
	f.target.files.find((x) => x.path === "Saplingagent.sh").executable = false;
	const plan = await prepareKernel(f.root, { source: f.source });
	assert.ok(plan.preservedLocal.includes("scripts/dev.mjs"));
	assert.equal(plan.conflicts.length, 0);
	const result = await applyKernel(f.root, plan.id, { acceptRisk: true });
	assert.equal(await fs.access(path.join(f.root, "kernel/control-page.mjs")).then(() => true, () => false), false);
	assert.equal(await fs.readFile(path.join(f.root, "scripts/dev.mjs"), "utf8"), "customer startup");
	if (process.platform !== "win32") assert.equal((await fs.stat(path.join(f.root, "Saplingagent.sh"))).mode & 0o111, 0);
	await restoreKernel(f.root, result.backupId);
	assert.equal(await fs.readFile(path.join(f.root, "kernel/control-page.mjs"), "utf8"), "old control");
	if (process.platform !== "win32") assert.ok((await fs.stat(path.join(f.root, "Saplingagent.sh"))).mode & 0o111);
	await preserved(f.root);
});
test("accidental downgrades refuse source changes", async (t) => {
	const f = await fixture(t);
	f.target.version = "0.89";
	await assert.rejects(prepareKernel(f.root, { source: f.source }), { code: "KERNEL_INCOMPATIBLE" });
	await preserved(f.root);
});
test("maintainer scanning excludes installed Python, caches and private files without deleting them", async (t) => {
	const f = await fixture(t);
	for (const directory of [
		"contracts",
		"scripts",
		"backend",
		"front",
		"config",
		".agents"
	]) await fs.mkdir(path.join(f.root, directory), { recursive: true });
	await text(f.root, "install.sh", "installer");
	const names = [
		"backend/mcp-runtime/.venv/bin/python",
		"backend/agent-runtime/__pycache__/temp.pyc",
		"kernel/.DS_Store",
		"kernel/auth.json",
		"kernel/testdata.p12",
		"kernel/build/generated.mjs"
	];
	for (const name of names) await text(f.root, name, "synthetic local artifact");
	await fs.unlink(path.join(f.root, names[0]));
	await fs.symlink(process.execPath, path.join(f.root, names[0]));
	const files = await scanKernelFiles(f.root);
	for (const name of names) {
		assert.equal(isKernelPath(name), false, name);
		assert.equal(files.some((file) => file.path === name), false, name);
		assert.ok(await fs.lstat(path.join(f.root, name)));
	}
	assert.ok(files.some((file) => file.path === "kernel/manager.mjs"));
	await preserved(f.root);
});
test("chat, workspace/context, builder/page reading, MCP and all Skills remain editable through update and restore", async (t) => {
	const f = await fixture(t);
	for (const name of Object.keys(applicationFiles)) assert.equal(isKernelPath(name), false, name);
	const plan = await prepareKernel(f.root, { source: f.source });
	assert.equal(plan.changes.some((e) => e.path in applicationFiles), false);
	const result = await applyKernel(f.root, plan.id, { acceptRisk: true });
	for (const name of Object.keys(applicationFiles)) assert.equal(await fs.readFile(path.join(f.root, name), "utf8"), applicationFiles[name]);
	for (const name of Object.keys(applicationFiles)) await text(f.root, name, "owner edits after kernel update");
	await restoreKernel(f.root, result.backupId);
	for (const name of Object.keys(applicationFiles)) assert.equal(await fs.readFile(path.join(f.root, name), "utf8"), "owner edits after kernel update", name);
	f.target.files.push({
		path: "front/chat/ChatPanel.tsx",
		sha256: sha(Buffer.from("upstream chat")),
		bytes: 13,
		executable: false
	});
	await assert.rejects(prepareKernel(f.root, { source: f.source }), { code: "INVALID_KERNEL" });
	for (const name of Object.keys(applicationFiles)) assert.equal(await fs.readFile(path.join(f.root, name), "utf8"), "owner edits after kernel update", name);
});
test("obsolete broad manifests and saved plans refuse automatic migration before source writes", async (t) => {
	const f = await fixture(t), plan = await prepareKernel(f.root, { source: f.source });
	const legacy = manifest({
		...f.old,
		...applicationFiles
	});
	legacy.schemaVersion = 2;
	await text(f.root, "kernel/manifest.json", JSON.stringify(legacy));
	await assert.rejects(prepareKernel(f.root, { source: f.source }), { code: "INVALID_KERNEL" });
	await assert.rejects(applyKernel(f.root, plan.id, { acceptRisk: true }), { code: "INVALID_KERNEL" });
	assert.equal((await kernelStatus(f.root)).state, "invalid");
	assert.equal(await fs.readFile(path.join(f.root, "kernel/manager.mjs"), "utf8"), "old manager");
	await text(f.root, "kernel/manifest.json", JSON.stringify(manifest(f.old)));
	f.target.schemaVersion = 2;
	await assert.rejects(prepareKernel(f.root, { source: f.source }), { code: "INVALID_KERNEL" });
	for (const [name, value] of Object.entries(applicationFiles)) assert.equal(await fs.readFile(path.join(f.root, name), "utf8"), value);
});
test("old broad backup entries and schema1 baseline restores cannot overwrite released application modules", async (t) => {
	const f = await fixture(t), plan = await prepareKernel(f.root, { source: f.source }), result = await applyKernel(f.root, plan.id, { acceptRisk: true });
	const prefix = path.join(f.root, ".runtime/kernel/backups", result.backupId), journalFile = path.join(prefix, "journal.json"), journal = JSON.parse(await fs.readFile(journalFile));
	const malicious = {
		...journal.files[0],
		path: "backend/app-builder/server.mjs"
	};
	await fs.writeFile(journalFile, JSON.stringify({
		...journal,
		files: [...journal.files, malicious]
	}));
	await assert.rejects(restoreKernel(f.root, result.backupId), /Invalid recovery entry/);
	const entry = journal.files.find((e) => e.path === "kernel/manifest.json"), original = path.join(prefix, "original", String(entry.originalIndex));
	const legacy = JSON.parse(await fs.readFile(original));
	legacy.schemaVersion = 2;
	const bytes = Buffer.from(JSON.stringify(legacy));
	entry.beforeHash = sha(bytes);
	await fs.writeFile(original, bytes);
	await fs.writeFile(journalFile, JSON.stringify(journal));
	await assert.rejects(restoreKernel(f.root, result.backupId), /obsolete broad kernel ownership/);
	assert.equal(await fs.readFile(path.join(f.root, "kernel/manager.mjs"), "utf8"), "new manager");
	for (const [name, value] of Object.entries(applicationFiles)) assert.equal(await fs.readFile(path.join(f.root, name), "utf8"), value);
});

test('explicit recovery restores the historical0.92 public facade after relocation',async t=>{
 const {root,old,files,target,source}=await fixture(t);
 const previous={...old,'contracts/project-launcher.mjs':'historical facade'};
 await text(root,'contracts/project-launcher.mjs',previous['contracts/project-launcher.mjs']);
 await text(root,'kernel/manifest.json',JSON.stringify(manifest(previous)));
 files['kernel/launcher/public.mjs']='relocated public facade';
 target.files=manifest(files,target.version).files;
 const plan=await prepareKernel(root,{source});assert.deepEqual(plan.conflicts,[]);
 assert.ok(plan.changes.some(file=>file.path==='contracts/project-launcher.mjs'&&file.afterHash===null));
 const result=await applyKernel(root,plan.id,{acceptRisk:true});
 await assert.rejects(fs.access(path.join(root,'contracts/project-launcher.mjs')));
 await restoreKernel(root,result.backupId);
 assert.equal(await fs.readFile(path.join(root,'contracts/project-launcher.mjs'),'utf8'),'historical facade');
 await assert.rejects(fs.access(path.join(root,'kernel/launcher/public.mjs')));
 await preserved(root);
});


test('live external MCP prevents source upgrade and standalone recovery without deleting ownership',async t=>{
 const {root,source}=await fixture(t),plan=await prepareKernel(root,{source});
 const id='01234567-1234-4321-8234-123456789abc',file=path.join(root,'.runtime/mcp-access/clients',id+'.json');
 const original=await fs.readFile(path.join(root,'kernel/manifest.json'),'utf8');
 await text(root,'.runtime/mcp-access/clients/'+id+'.json',JSON.stringify({schemaVersion:1,id,root:await fs.realpath(root),pid:process.pid}));
 await assert.rejects(applyKernel(root,plan.id,{acceptRisk:true}),{code:'MCP_CLIENTS_ACTIVE'});
 assert.equal(await fs.readFile(path.join(root,'kernel/manifest.json'),'utf8'),original);
 await fs.unlink(file);
 const applied=await applyKernel(root,plan.id,{acceptRisk:true});
 await text(root,'.runtime/mcp-access/clients/'+id+'.json',JSON.stringify({schemaVersion:1,id,root:await fs.realpath(root),pid:process.pid}));
 await assert.rejects(restoreKernel(root,applied.backupId),{code:'MCP_CLIENTS_ACTIVE'});
 assert.equal(await fs.access(file).then(()=>true,()=>false),true);
 assert.equal(await fs.access(path.join(root,'.runtime/kernel-operation.lock')).then(()=>true,()=>false),false);
 await fs.unlink(file);await restoreKernel(root,applied.backupId);await preserved(root);
});
