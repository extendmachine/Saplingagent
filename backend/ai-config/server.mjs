// Compatibility entry; implementation is under kernel/.
import { forwardEntry } from "../../kernel/compat/entry.mjs";
export * from "../../kernel/services/ai-config/server.mjs";
await forwardEntry(import.meta.url,new URL("../../kernel/services/ai-config/server.mjs",import.meta.url));
