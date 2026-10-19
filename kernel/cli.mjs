import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { kernelStatus, prepareKernel, applyKernel, kernelBackups } from "./manager.mjs";
import { restoreKernel } from "./recover.mjs";
const cliArgs = process.argv.slice(2);
let targetRoot;
if (cliArgs[0] === "--root") {
 if (!cliArgs[1] || cliArgs[1].startsWith("--")) throw Error("--root requires an explicit application directory.");
 targetRoot = cliArgs[1]; cliArgs.splice(0,2);
}
const root = path.resolve(targetRoot || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const t = (en, zh) => process.env.SAPLING_LANG === "zh" ? zh : en;
async function question(text) {
	const rl = createInterface({
		input: stdin,
		output: stdout
	});
	try {
		return (await rl.question(text)).trim();
	} finally {
		rl.close();
	}
}
function showPlan(plan) {
	console.log(t(`Kernel ${plan.version} · release ${plan.sourceCommit.slice(0, 12)}`, `内核 ${plan.version} · release ${plan.sourceCommit.slice(0, 12)}`));
	console.log(t(`Planned source changes: ${plan.changes.length}; local conflicts: ${plan.conflicts.length}; preserved local files: ${plan.preservedLocal.length}`, `计划源码变更：${plan.changes.length}；本地冲突：${plan.conflicts.length}；保留本地文件：${plan.preservedLocal.length}`));
	for (const file of plan.conflicts) console.log("CONFLICT " + file);
	console.log(t(plan.warning, "更新内核可能导致现有应用、依赖或集成失效。源码备份不能替代业务数据备份，也不保证兼容。请先停止应用；失效时手动恢复旧内核。"));
}
export async function kernelCommand(action, args = []) {
	if (action === "status") {
		console.log(JSON.stringify(await kernelStatus(root), null, 2));
		console.log(t("Local kernel backups:", "本地内核备份："));
		console.log(JSON.stringify(await kernelBackups(root), null, 2));
		return;
	}
	if (action === "check" || action === "update") {
		if (args.some((x) => x !== "--accept-risk")) throw Error("Use kernel check or kernel update [--accept-risk].");
		const plan = await prepareKernel(root);
		showPlan(plan);
		if (action === "check") {
			console.log(t("Preview only. No application source changed.", "仅检查预览，未修改应用源码。"));
			return;
		}
		if (!plan.changes.length && !plan.conflicts.length) { console.log(t("Kernel source is already current.", "内核源码已是当前版本。")); return; }
		if (plan.conflicts.length) throw Error(t("Merge the listed kernel conflicts before updating. Business files remain untouched.", "请先合并列出的内核冲突。业务文件未改动。"));
		if (!args.includes("--accept-risk") && !stdin.isTTY) throw Error(t("Interactive risk acknowledgement is required; run in a terminal or deliberately pass --accept-risk.", "请在终端确认兼容风险，或明确传入 --accept-risk。"));
		const accepted = args.includes("--accept-risk") || await question(t("Type UPDATE to accept this compatibility risk and back up/apply kernel source: ", "输入 UPDATE 接受兼容风险并备份、更新内核源码： ")) === "UPDATE";
		if (!accepted) {
			console.log(t("Kernel update cancelled.", "已取消内核更新。"));
			return;
		}
		const result = await applyKernel(root, plan.id, { acceptRisk: true });
		console.log(JSON.stringify(result, null, 2));
		if (result.changed) {
			console.log(t("Source applied, not runtime-ready. Next: bash Saplingagent.sh install --repair, then start and verify.", "源码已更新，尚未确认运行就绪。下一步：bash Saplingagent.sh install --repair，然后启动并验证。"));
			console.log(t("If broken, restore the listed backup using the project Node: .runtime/kernel/recover.mjs " + result.backupId, "如果失效，用项目 Node 执行：.runtime/kernel/recover.mjs " + result.backupId));
		}
		return;
	}
	if (action === "restore" && args.length === 1) {
		console.log(JSON.stringify(await restoreKernel(root, args[0]), null, 2));
		console.log(t("Repair dependencies, restart and verify after restoring source.", "恢复源码后请修复依赖、重新启动并验证。"));
		return;
	}
	if (action !== undefined) throw Error("Use kernel status / check / update [--accept-risk] / restore <backup-id>.");
	console.log(t("Kernel management — independent of your application Git history. Updates may break compatibility.", "内核管理——独立于应用 Git 历史。更新可能导致兼容性失效。"));
	console.log("1. " + t("Status and backups", "版本与备份") + "\n2. " + t("Check update", "检查更新") + "\n3. " + t("Update kernel", "更新内核") + "\n4. " + t("Restore backup", "恢复备份") + "\n0. " + t("Back", "返回"));
	const choice = await question(t("Choose: ", "请选择："));
	if (choice === "0" || !choice) return;
	if (choice === "1") return kernelCommand("status");
	if (choice === "2") return kernelCommand("check");
	if (choice === "3") return kernelCommand("update");
	if (choice === "4") return kernelCommand("restore", [await question(t("Backup ID: ", "备份 ID："))]);
	throw Error(t("Unknown kernel action.", "未知内核操作。"));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const [action, ...args] = cliArgs;
		await kernelCommand(action, args);
	} catch (error) {
		console.error((error.code ? error.code + ": " : "") + error.message);
		process.exitCode = 1;
	}
}
