import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url));
export default {root:directory,base:'/',build:{outDir:path.resolve(directory,'../../.cache/ai-config-ui'),emptyOutDir:true},server:{host:'127.0.0.1'}};
