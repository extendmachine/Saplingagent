// Compatibility entry; implementation is under kernel/.
import { forwardEntry } from "../kernel/compat/entry.mjs";
export * from "../kernel/scripts/setup.mjs";
await forwardEntry(import.meta.url,new URL("../kernel/scripts/setup.mjs",import.meta.url));
