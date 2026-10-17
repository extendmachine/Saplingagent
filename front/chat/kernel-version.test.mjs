import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { transformSync } from "rolldown/utils";
async function footer(kernel, release) {
	let cursor = 0;
	const slots = [], effects = [], jsx = (type, props) => ({
		type,
		props
	}), react = {
		useState(initial) {
			const i = cursor++;
			if (!(i in slots)) slots[i] = initial;
			return [slots[i], (value) => slots[i] = value];
		},
		useRef(value) {
			const i = cursor++;
			return slots[i] ||= { current: value };
		},
		useCallback(fn) {
			cursor++;
			return fn;
		},
		useEffect(fn) {
			const i = cursor++;
			if (!(i in slots)) {
				slots[i] = true;
				effects.push(fn);
			}
		}
	};
	const context = vm.createContext({
		JSON,
		Error,
		AbortSignal,
		performance: { timeOrigin: 1 },
		document: {
			hidden: false,
			addEventListener() {},
			removeEventListener() {}
		},
		window: {
			setInterval: () => 1,
			clearInterval() {},
			location: { reload() {} }
		},
		fetch: async (url) => ({
			ok: url === "/api/kernel" || (url === "/api/release" && Boolean(release)),
			status: 503,
			json: async () => url === "/api/kernel" ? { kernel } : url === "/api/release" ? { release } : { error: { message: "Git unavailable" } }
		})
	});
	const mocks = {
		react,
		"react/jsx-runtime": {
			jsx,
			jsxs: jsx
		},
		"lucide-react": { RefreshCw: "svg" }
	};
	const code = transformSync("VersionFooter.tsx", await readFile(new URL("../features/version/VersionFooter.tsx", import.meta.url), "utf8"), { jsx: { runtime: "automatic" } }).code;
	const module = new vm.SourceTextModule(code, { context });
	await module.link((name) => {
		const m = mocks[name];
		return new vm.SyntheticModule(Object.keys(m), function() {
			for (const [k, v] of Object.entries(m)) this.setExport(k, v);
		}, { context });
	});
	await module.evaluate();
	const render = () => {
		cursor = 0;
		return module.namespace.VersionFooter();
	};
	render();
	for (const fn of effects) fn();
	for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
	return render();
}
function text(node) {
	if (node === null || node === undefined || typeof node === "boolean") return "";
	if (typeof node !== "object") return String(node);
	if (Array.isArray(node)) return node.map(text).join("");
	return text(node.props?.children);
}
test("kernel version comes from independent installed metadata even when application Git is unavailable", async () => {
	const value = text(await footer({
		state: "managed",
		version: "0.91"
	}));
	assert.match(value, /Kernel version 0\.91/);
	assert.match(value, /Version unavailable/);
});
test("legacy or invalid kernel metadata retains original0.90 baseline", async () => {
	for (const kernel of [{
		state: "legacy",
		version: "0.90"
	}, {
		state: "invalid",
		version: "not-version"
	}]) assert.match(text(await footer(kernel)), /Kernel version 0\.90/);
});


test("product release stays distinct from kernel and unavailable workspace Git", async () => {
 const value = text(await footer({state:"managed",version:"0.90"},{schemaVersion:1,version:"0.9.2"}));
 assert.match(value,/Saplingagent 0\.9\.2/); assert.match(value,/Kernel version 0\.90/); assert.match(value,/Workspace version Version unavailable/);
});
test("missing or malformed product metadata never falls back to the kernel version", async () => {
 for(const release of [undefined,{schemaVersion:1,version:"0.90"},{schemaVersion:2,version:"0.9.2"},{schemaVersion:1,version:92}]) {
  const value=text(await footer({state:"managed",version:"0.90"},release));
  assert.match(value,/Saplingagent Release unavailable/); assert.doesNotMatch(value,/Saplingagent 0\.90/);
 }
});
