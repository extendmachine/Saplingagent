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
test("unavailable installed metadata never invents a baseline", async () => {
 for(const kernel of [{state:"legacy",version:"0.90"},{state:"invalid",version:"not-version"}]) {
  const value=text(await footer(kernel));assert.match(value,/Kernel version Unavailable/);assert.doesNotMatch(value,/Kernel version 0\.90/);
 }
});
test("only installed kernel0.9.4 is displayed even with stale compatibility metadata",async()=>{
 const value=text(await footer({state:"managed",version:"0.9.4"},{schemaVersion:1,version:"0.9.1"}));
 assert.match(value,/Kernel version 0\.9\.4/);assert.doesNotMatch(value,/Saplingagent 0\.9\.1|Release unavailable/);
 assert.match(value,/Workspace revision Version unavailable/);
});
test("missing deprecated metadata cannot hide the installed kernel",async()=>{
 const value=text(await footer({state:"managed",version:"0.9.4"}));assert.match(value,/Kernel version 0\.9\.4/);
});
