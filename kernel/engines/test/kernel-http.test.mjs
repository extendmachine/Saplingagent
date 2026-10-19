import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMediaFixture } from "../../../backend/agent-runtime/test/media-fixture.mjs";
test("read-only kernel metadata is independent of Git/model and does not expose local receipt fields", async (t) => {
	const parent = fileURLToPath(new URL("../../../.cache/kernel-api/", import.meta.url));
	await fs.mkdir(parent, { recursive: true });
	const root = await fs.mkdtemp(path.join(parent, "app-"));
	const f = await createMediaFixture(root);
	t.after(async () => {
		await f.close();
		await fs.rm(root, {
			recursive: true,
			force: true
		});
	});
	let result = await (await fetch(f.base + "/api/kernel")).json();
	assert.equal(result.kernel.state, "legacy");
	assert.equal(result.kernel.version, "0.90");
	const names = [
		"kernel/manager.mjs",
		"kernel/recover.mjs",
		"contracts/kernel.mjs",
		"Saplingagent.sh",
		"scripts/dev.mjs"
	];
	await fs.mkdir(path.join(root, "kernel"));
	await fs.writeFile(path.join(root, "kernel/manifest.json"), JSON.stringify({
		schemaVersion: 3,
		version: "0.91",
		appApi: 1,
		minNode: "24.11.0",
		files: names.map((name) => ({
			path: name,
			sha256: "0".repeat(64),
			bytes: 0,
			executable: false
		}))
	}));
	await fs.mkdir(path.join(root, ".runtime/kernel"), { recursive: true });
	await fs.writeFile(path.join(root, ".runtime/kernel/state.json"), JSON.stringify({
		sourceCommit: "a".repeat(40),
		privateValue: "SYNTHETIC_DO_NOT_EXPOSE"
	}));
	const raw = await (await fetch(f.base + "/api/kernel")).text();
	assert.equal(JSON.parse(raw).kernel.version, "0.91");
	assert.equal(raw.includes("SYNTHETIC_DO_NOT_EXPOSE"), false);
	assert.equal(f.calls.filter((c) => c.method === "turn/start").length, 0);
});
