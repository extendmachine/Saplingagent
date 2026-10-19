import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url));
const modules=path.resolve(directory,'../../node_modules');
export default {resolve:{alias:[{find:/^react-dom(\/.*)?$/,replacement:modules+'/react-dom$1'},{find:/^react(\/.*)?$/,replacement:modules+'/react$1'}]},root:directory,base:'/',build:{outDir:path.resolve(directory,'../../.cache/setup'),emptyOutDir:true},server:{host:'127.0.0.1'}};
