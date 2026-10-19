// Compatibility entry; implementation is under kernel/.
import { forwardEntry } from "../kernel/compat/entry.mjs";
export * from "../kernel/scripts/package-macos.mjs";
await forwardEntry(import.meta.url,new URL("../kernel/scripts/package-macos.mjs",import.meta.url));
