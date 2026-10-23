import { launcherMessages } from './localization/launcher-messages.mjs';
import { readLanguage } from './localization/store.mjs';
import { normalizeLanguage, describeError, formatMessage } from './localization/public.mjs';
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
process.env.SAPLING_LANG=process.env.SAPLING_LANG_EXPLICIT==='1'?normalizeLanguage(process.env.SAPLING_LANG):await readLanguage(root,normalizeLanguage(process.env.SAPLING_LANG||process.env.LC_ALL||process.env.LANG));
const t = (key,params) => formatMessage(launcherMessages,process.env.SAPLING_LANG,key,params);
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
	console.log(t("Kernel {p0} · release {p1}",{p0:(plan.version),p1:(plan.sourceCommit.slice(0, 12))}));
	console.log(t("Planned source changes: {p0}; local conflicts: {p1}; preserved local files: {p2}",{p0:(plan.changes.length),p1:(plan.conflicts.length),p2:(plan.preservedLocal.length)}));
	for (const file of plan.conflicts) console.log("CONFLICT " + file);
	console.log(process.env.SAPLING_LANG==='zh'?t("Kernel updates may break compatibility."):plan.warning);
}
export async function kernelCommand(action, args = []) {
	if (action === "status") {
		console.log(JSON.stringify(await kernelStatus(root), null, 2));
		console.log(t("Local kernel backups:"));
		console.log(JSON.stringify(await kernelBackups(root), null, 2));
		return;
	}
	if (action === "check" || action === "update") {
		if (args.some((x) => x !== "--accept-risk")) throw Error(t("Use kernel check or kernel update [--accept-risk]."));
		const plan = await prepareKernel(root);
		showPlan(plan);
		if (action === "check") {
			console.log(t("Preview only. No application source changed."));
			return;
		}
		if (!plan.changes.length && !plan.conflicts.length) { console.log(t("Kernel source is already current.")); return; }
		if (plan.conflicts.length) throw Error(t("Merge the listed kernel conflicts before updating. Business files remain untouched."));
		if (!args.includes("--accept-risk") && !stdin.isTTY) throw Error(t("Interactive risk acknowledgement is required; run in a terminal or deliberately pass --accept-risk."));
		const accepted = args.includes("--accept-risk") || await question(t("Type UPDATE to accept this compatibility risk and back up/apply kernel source: ")) === "UPDATE";
		if (!accepted) {
			console.log(t("Kernel update cancelled."));
			return;
		}
		const result = await applyKernel(root, plan.id, { acceptRisk: true });
		console.log(JSON.stringify(result, null, 2));
		if (result.changed) {
			console.log(t("Source applied, not runtime-ready. Next: bash Saplingagent.sh install --repair, then start and verify."));
			console.log(t("If broken, restore the listed backup using the project Node: .runtime/kernel/recover.mjs {id}",{id:result.backupId}));
		}
		return;
	}
	if (action === "restore" && args.length === 1) {
		console.log(JSON.stringify(await restoreKernel(root, args[0]), null, 2));
		console.log(t("Repair dependencies, restart and verify after restoring source."));
		return;
	}
	if (action !== undefined) throw Error(t("Use kernel status / check / update [--accept-risk] / restore <backup-id>."));
	console.log(t("Kernel management — independent of your application Git history. Updates may break compatibility."));
	console.log("1. " + t("Status and backups") + "\n2. " + t("Check update") + "\n3. " + t("Update kernel") + "\n4. " + t("Restore backup") + "\n0. " + t("Back"));
	const choice = await question(t("Choose: "));
	if (choice === "0" || !choice) return;
	if (choice === "1") return kernelCommand("status");
	if (choice === "2") return kernelCommand("check");
	if (choice === "3") return kernelCommand("update");
	if (choice === "4") return kernelCommand("restore", [await question(t("Backup ID: "))]);
	throw Error(t("Unknown kernel action."));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const [action, ...args] = cliArgs;
		await kernelCommand(action, args);
	} catch (error) {
		const info=describeError(error,process.env.SAPLING_LANG);console.error([info.summary,info.action,info.code,info.details].filter(Boolean).join('\n'));
		process.exitCode = 1;
	}
}
