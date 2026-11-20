// Serve a completed, project-local build while the next build runs. The build
// script retains control of its normal output directory, including custom apps.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {npmCommand} from '../../contracts/local-process.mjs';
import {ensureManagedDirectory} from '../../contracts/local-storage.mjs';

const invalid = message => Object.assign(new Error(message), {code:'INVALID_CONFIG', service:'front'});
const buildError = message => Object.assign(new Error(message), {code:'FRONTEND_BUILD_FAILED', service:'front'});

export function frontendSettings(config) {
  const frontendMode = config.frontendMode ?? 'development';
  if (!['static','development'].includes(frontendMode)) throw invalid('Choose development or static for frontendMode in config/runtime.json.');
  if (frontendMode === 'development') return {frontendMode};
  const frontendDist = config.frontendDist ?? 'dist';
  const frontendBase = config.frontendBase ?? '/';
  if (typeof frontendDist !== 'string' || !frontendDist.split('/').every(part => /^[\p{L}\p{N}_-][\p{L}\p{N}._ -]*$/u.test(part) && part.toLowerCase() !== 'node_modules')) {
    throw invalid('frontendDist must name a public build output directory relative to front/.');
  }
  const segments = typeof frontendBase === 'string' ? frontendBase.split('/') : [];
  if (segments.length < 2 || segments[0] || segments.at(-1) ||
      segments.slice(1,-1).some(part => !/^[\p{L}\p{N}_-][\p{L}\p{N}._ -]*$/u.test(part)) ||
      ['api','__saplingagent'].includes(segments[1]?.toLowerCase())) {
    throw invalid('Use / or a local directory URL such as /app/ for frontendBase.');
  }
  return {frontendMode, frontendDist, frontendBase:segments.map(encodeURIComponent).join('/')};
}

async function checkDirectory(root, relative, required) {
  let dir = root;
  for (const part of relative.split('/')) {
    dir = path.join(dir, part);
    const stat = await fs.lstat(dir).catch(error => {
      if (error.code === 'ENOENT') {
        if (!required) return null;
        throw buildError('The frontend output is missing. Check front/, its build script and frontendDist, then retry Restart app.');
      }
      throw error;
    });
    if (!stat) return;
    if (!stat.isDirectory() || await fs.realpath(dir) !== dir) throw buildError('Use a regular project-local directory for frontend output.');
  }
}

// A directory name contains the PID that created it. Reap abandoned snapshots
// only after confirming this operating system no longer knows that owner.
async function clearAbandoned(cache) {
  for (const entry of await fs.readdir(cache, {withFileTypes:true})) {
    const match = /^(\d+)-[a-zA-Z0-9]{6}$/.exec(entry.name);
    if (!entry.isDirectory() || !match || Number(match[1]) < 2) continue;
    try { process.kill(Number(match[1]), 0); }
    catch (error) { if (error.code === 'ESRCH') await fs.rm(path.join(cache, entry.name), {recursive:true, force:true}).catch(() => {}); }
  }
}

export async function buildStaticFrontend(root, config, {signal, onOutput, endpointEnv} = {}) {
  // Load npm and the HTTP middleware only for projects using this mode.
  const {command, buildEnv} = await import('../../launcher/build.mjs');
  const {default:serveStatic} = await import('serve-static').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND') {
      throw Object.assign(new Error('Install or repair kernel dependencies, then retry Restart app.'), {code:'DEPENDENCIES_MISSING',service:'front'});
    }
    throw error;
  });
  root = await fs.realpath(root);
  const output = 'front/' + config.frontendDist;
  const cache = await ensureManagedDirectory(root, '.runtime/static-frontend');
  await clearAbandoned(cache);
  await checkDirectory(root, 'front', true);
  await checkDirectory(root, output, false);
  const npm = npmCommand();
  const env = {...buildEnv(root), ...endpointEnv};
  env.PATH = path.dirname(process.execPath) + path.delimiter + env.PATH;
  try {
    await command(root, npm.command, [...npm.args,'run','build'], {cwd:path.join(root,'front'), env, onOutput, signal});
  } catch (error) {
    if (signal?.aborted) throw error;
    throw buildError('The frontend build failed. Run npm run build in front/ to inspect the error, then retry Restart app.');
  }
  signal?.throwIfAborted();
  const snapshot = await fs.mkdtemp(path.join(cache, process.pid + '-'));
  try {
    await checkDirectory(root, output, true);
    const source = path.join(root, output);
    await fs.cp(source, snapshot, {recursive:true, mode:constants.COPYFILE_FICLONE, filter: async file => {
      signal?.throwIfAborted();
      if (file !== source && path.basename(file).startsWith('.')) return false;
      const stat = await fs.lstat(file);
      if (!stat.isFile() && !stat.isDirectory()) throw buildError('The static frontend build must contain regular public files and directories.');
      return true;
    }});
    const index = await fs.stat(path.join(snapshot, 'index.html'));
    if (!index.isFile() || !index.size) throw buildError('The frontend build has no index.html. Check frontendDist and retry Restart app.');
    return staticSite(snapshot, config, serveStatic);
  } catch (error) {
    await fs.rm(snapshot,{recursive:true,force:true});
    if (error.code === 'ENOENT') throw buildError('The frontend build has no index.html. Check frontendDist and retry Restart app.');
    throw error;
  }
}

function staticSite(directory, config, serveStatic) {
  const base = config.frontendBase;
  const serve = serveStatic(directory,{index:false,redirect:false, dotfiles:'ignore',maxAge:0});
  let requests = 0, retired = false;
  const clean = () => fs.rm(directory,{recursive:true,force:true}).catch(() => {});
  return {
    base, dist:config.frontendDist,
    async retire() {
      retired = true;
      if (!requests) await clean();
    },
    async handle(req,res,url) {
      requests++;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        requests--;
        if (retired && !requests) void clean();
      };
      res.once('finish',finish);res.once('close',finish);
      const end = (status, headers = {}) => {res.writeHead(status,headers);res.end();};
      if (!['HEAD','GET'].includes(req.method)) return end(405,{Allow:'GET, HEAD'});
      if (base !== '/' && (url.pathname === '/' || url.pathname === base.slice(0,-1))) return end(302,{Location:base + url.search});
      if (!url.pathname.startsWith(base)) return end(404);
      let relative;
      try { relative = decodeURIComponent(url.pathname.slice(base.length)); }
      catch { return end(400); }
      if (base === '/' && /^(?:api|__saplingagent)(?:\/|$)/.test(relative)) return end(404);
      if (relative.split('/').some(segment => segment.startsWith('.') || /[\\:\x00-\x1f]/.test(segment))) return end(404);
      // Resolve the explicit file (including directory indexes and SPA fallbacks)
      // before passing its URL to the middleware. Missing assets stay 404.
      const file = path.join(directory, relative);
      let target = file;
      const stat = await fs.stat(file).catch(() => null);
      if (stat?.isDirectory()) target = path.join(file, 'index.html');
      else if (!stat) {
        if (path.extname(relative) || !String(req.headers.accept || '').includes('text/html')) return end(404);
        target = path.join(directory, 'index.html');
      }
      if (await fs.realpath(target).catch(() => null) !== target) return end(404);
      if (res.destroyed) return;
      req.url = '/' + path.relative(directory, target).split(path.sep).map(encodeURIComponent).join('/') + url.search;
      serve(req,res,error => { if (res.headersSent) res.destroy(); else end(error?.statusCode || 404); });
    }
  };
}
