// Compatibility entry; implementation is under kernel/.
import { forwardEntry } from "../kernel/compat/entry.mjs";
export * from "../kernel/scripts/verify-release.mjs";
await forwardEntry(import.meta.url,new URL("../kernel/scripts/verify-release.mjs",import.meta.url));
