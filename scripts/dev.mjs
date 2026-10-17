import fs from "node:fs/promises";
import path from "node:path";
import { root, setup } from "./setup.mjs";
import { RuntimeManager } from "../backend/runtime-manager/manager.mjs";
import { selectRuntimePorts, listenAscending, portKeys } from "../backend/runtime-manager/ports.mjs";
import { createManagerServer } from "../backend/runtime-manager/server.mjs";
import { createGateway } from "../backend/runtime-manager/gateway.mjs";
import { acquireKernelLock, assertKernelOffline } from "../contracts/kernel.mjs";
async function launch() {
	const lease = await acquireKernelLock(root, "runtime-start");
	let released = false;
	const release = async () => {
		if (!released) {
			released = true;
			await lease();
		}
	};
	try {
		await assertKernelOffline(root);
		await setup();
		const token = (await fs.readFile(path.join(root, "local-secrets/runtime/service-token"), "utf8")).trim();
		const definitions = [
			{
				name: "workspace",
				portKey: "workspacePort",
				file: "backend/workspace/server.mjs"
			},
			{
				name: "builder",
				portKey: "builderPort",
				file: "backend/app-builder/server.mjs"
			},
			{
				name: "pdf-editor",
				portKey: "pdfEditorPort",
				file: "backend/pdf-editor/server.mjs",
				optional: true
			},
			{
				name: "agent",
				portKey: "agentPort",
				file: "backend/agent-runtime/server.mjs"
			}
		];
		const manager = new RuntimeManager({
			root,
			token,
			definitions,
			frontDefinition: {
				name: "front",
				portKey: "vitePort",
				file: "front/node_modules/vite/bin/vite.js",
				args: (config) => [
					path.join(root, "front"),
					"--host",
					"127.0.0.1",
					"--port",
					String(config.vitePort),
					"--strictPort"
				]
			}
		});
		let control, gateway, stopping = false;
		const addressFile = path.join(root, ".runtime/runtime-address.json");
		async function stop(code = 0) {
			if (stopping) return;
			stopping = true;
			await release();
			gateway?.closeUpgrades();
			gateway?.closeAllConnections();
			control?.closeAllConnections();
			await Promise.all([
				gateway && new Promise((resolve) => gateway.close(resolve)),
				control && new Promise((resolve) => control.close(resolve)),
				manager.close()
			]);
			try {
				if (JSON.parse(await fs.readFile(addressFile, "utf8")).instanceId === manager.instanceId) await fs.unlink(addressFile);
			} catch {}
			process.exit(code);
		}
		for (const signal of [
			"SIGINT",
			"SIGTERM",
			"SIGHUP"
		]) process.once(signal, () => void stop());
		try {
			const configured = await manager.loadConfig();
			const ports = await selectRuntimePorts(configured);
			const config = {
				...configured,
				...ports
			};
			manager.config = config;
			await fs.access(path.join(root, "front/node_modules/vite/bin/vite.js"));
			await fs.access(path.join(root, "backend/mcp-runtime/node_modules/@modelcontextprotocol/sdk/package.json"));
			const options = {
				manager,
				token,
				frontPort: config.frontPort,
				managerPort: config.runtimeManagerPort
			};
			control = createManagerServer(options);
			gateway = createGateway(options);
			const excluded = (key) => new Set(portKeys.filter((k) => k !== key).map((k) => config[k]));
			config.runtimeManagerPort = await listenAscending(control, config.runtimeManagerPort, excluded("runtimeManagerPort"));
			config.frontPort = await listenAscending(gateway, config.frontPort, excluded("frontPort"));
			options.frontPort = config.frontPort;
			options.managerPort = config.runtimeManagerPort;
			manager.portOverrides = Object.fromEntries(portKeys.map((key) => [key, config[key]]));
			await fs.mkdir(path.dirname(addressFile), { recursive: true });
			const temporary = `${addressFile}.${manager.instanceId}.tmp`;
			await fs.writeFile(temporary, JSON.stringify({
				instanceId: manager.instanceId,
				pid: process.pid,
				ports: manager.portOverrides,
				url: `http://127.0.0.1:${config.frontPort}/`
			}) + "\n", { mode: 0o600 });
			await fs.rename(temporary, addressFile);
			await release();
			await manager.log("ports_selected", { ports: manager.portOverrides });
			for (const key of portKeys) if (configured[key] !== config[key]) console.log(`Port selected: ${key} ${configured[key]} → ${config[key]}`);
			await manager.start();
			console.log(`Saplingagent: http://127.0.0.1:${config.frontPort}/ (Agent initialization continues in background)`);
			console.log(`Persistent runtime control: http://127.0.0.1:${config.frontPort}/__saplingagent/runtime`);
		} catch (error) {
			console.error(error.message);
			await stop(1);
		}
	} catch (error) {
		await release();
		throw error;
	}
}
launch().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
