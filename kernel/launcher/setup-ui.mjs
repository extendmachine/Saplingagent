import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {command, nodeForRoot, prepareBuildStorage} from './build.mjs';
import {atomic, json, issue, writeJSON} from './io.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function sourceSignature(root) {
  const hash = createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url)));
  async function walk(relative) {
    for (const entry of (await fs.readdir(path.join(root, relative), {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const name = relative + '/' + entry.name;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) hash.update(name).update(await fs.readFile(path.join(root,name)));
      else throw issue('UI_BUILD_FAILED', 'Configuration source must contain regular files.', 500);
    }
  }
  await walk('kernel/ui/setup');
  // Setup imports the shared language and error catalogs; invalidate cached UI on changes.
  try { await walk('kernel/localization'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const name of ['kernel/package.json','kernel/package-lock.json']) hash.update(name).update(await fs.readFile(path.join(root,name)));
  return hash.digest('hex');
}

async function builtFiles(directory, names) {
  const index = await fs.readFile(path.join(directory,'index.html'));
  const html = index.toString('utf8');
  const resources = [...html.matchAll(/(?:src|href)=["'](\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css|woff2|svg))["']/g)].map(match=>match[1].slice(1));
  if (!html.includes('__SAPLING_CONFIG_TOKEN__') || !resources.some(name=>name.endsWith('.js'))) throw issue('UI_BUILD_FAILED','Configuration build did not produce a complete page.',500);
  names ||= ['index.html',...(await fs.readdir(path.join(directory,'assets'))).sort().map(name=>'assets/'+name)];
  if (!Array.isArray(names) || !names.includes('index.html') || !resources.every(name=>names.includes(name))) throw issue('UI_BUILD_FAILED','Configuration build is missing referenced resources.',500);
  const files = [];
  for (const name of names) {
    if (name!=='index.html' && !/^assets\/[a-zA-Z0-9_.-]+$/.test(name)) throw issue('UI_BUILD_FAILED','Configuration build contains an unsupported resource.',500);
    if (!(await fs.lstat(path.join(directory,name))).isFile()) throw issue('UI_BUILD_FAILED','Configuration resources must be regular files.',500);
    const bytes = name === 'index.html' ? index : await fs.readFile(path.join(directory,name));
    if (!bytes.length) throw issue('UI_BUILD_FAILED','Configuration build contains an empty resource.',500);
    files.push({path:name,sha256:digest(bytes)});
  }
  return files;
}

async function current(root, signature) {
  try {
    const directory = path.join(root,'kernel/.cache/setup');
    const receipt = await json(path.join(directory,'build.json'));
    if (receipt?.schemaVersion !== 1 || receipt.signature !== signature) return false;
    return JSON.stringify(await builtFiles(directory,receipt.files.map(file=>file.path))) === JSON.stringify(receipt.files);
  } catch { return false; }
}

async function compile(root, stage) {
  try {
    await command(root, nodeForRoot(root), [path.join(root,'kernel/node_modules/vite/bin/vite.js'),'build','--config',path.join(root,'kernel/ui/setup/vite.config.mjs'),'--outDir',stage,'--emptyOutDir'], {timeout:120000});
  } catch {
    throw issue('UI_BUILD_FAILED','Configuration page could not be built. The previous page was retained. Run bash Saplingagent.sh install --repair, then configure.',500);
  }
}

// Called by script, native entry and offline resume. Never empty the live directory:
// publish all resources first and atomically replace the document last. Retain old
// hashed resources so a document loaded before a rebuild can still finish loading.
export async function prepareSetupUI(root, {build=compile, waitMs=120000}={}) {
  root = await fs.realpath(root);
  await prepareBuildStorage(root);
  const signature = await sourceSignature(root);
  if (await current(root,signature)) return {rebuilt:false};
  const cache = path.join(root,'kernel/.cache');
  const lock = path.join(cache,'setup-build.lock');
  await fs.mkdir(cache,{recursive:true});
  const id = randomUUID(), deadline = Date.now()+waitMs;
  while (true) {
    try {
      await fs.mkdir(lock);
      try { await writeJSON(path.join(lock,'owner.json'),{id,pid:process.pid}); }
      catch (error) { await fs.rm(lock,{recursive:true,force:true}); throw error; }
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = await json(path.join(lock,'owner.json')).catch(()=>null);
      if (Number.isSafeInteger(owner?.pid) && owner.pid>0) {
        try { process.kill(owner.pid,0); }
        catch (error) {
          if (error.code==='ESRCH') throw issue('UI_BUILD_INTERRUPTED','A configuration build was interrupted. After confirming no setup build is running, remove kernel/.cache/setup-build.lock and retry configure.',409);
        }
      }
      if (Date.now()>=deadline) throw issue('UI_BUILD_BUSY','Configuration page is being prepared. Retry after the current build finishes; inspect kernel/.cache/setup-build.lock if it was interrupted.',409);
      await delay(100);
    }
  }
  const stage = path.join(cache,'setup-stage-'+id);
  try {
    const latestSignature = await sourceSignature(root);
    if (await current(root,latestSignature)) return {rebuilt:false};
    await fs.mkdir(stage);
    await build(root,stage);
    const files = await builtFiles(stage);
    if (await sourceSignature(root)!==latestSignature) throw issue('UI_BUILD_CHANGED','Configuration source changed during preparation. The previous page was retained; retry configure.',409);
    const destination = path.join(cache,'setup');
    // Publish every flat Vite asset, including resources referenced from CSS/JS.
    for (const name of await fs.readdir(path.join(stage,'assets'))) {
      if (!/^[a-zA-Z0-9_.-]+$/.test(name) || !(await fs.lstat(path.join(stage,'assets',name))).isFile()) throw issue('UI_BUILD_FAILED','Configuration build contains an unsupported asset.',500);
      await atomic(path.join(destination,'assets',name),await fs.readFile(path.join(stage,'assets',name)));
    }
    await atomic(path.join(destination,'index.html'),await fs.readFile(path.join(stage,'index.html')));
    await writeJSON(path.join(destination,'build.json'),{schemaVersion:1,signature:latestSignature,files});
    return {rebuilt:true};
  } finally {
    await fs.rm(stage,{recursive:true,force:true});
    if ((await json(path.join(lock,'owner.json')))?.id===id) await fs.rm(lock,{recursive:true,force:true});
  }
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=fileURLToPath(new URL('../../',import.meta.url));
  await prepareSetupUI(root);
  console.log('Configuration page is ready.');
}
