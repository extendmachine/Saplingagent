import path from 'node:path';
import { packageSource } from './package-macos.mjs';
try {
  const [ref = 'release', outputDir] = process.argv.slice(2);
  console.log(JSON.stringify(await packageSource({ ref, platform: 'Windows', ...(outputDir ? { outputDir: path.resolve(outputDir) } : {}) }), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
