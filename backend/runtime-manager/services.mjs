import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { constants } from 'node:fs';
import { portKeys } from './ports.mjs';

const invalid = (message, service) => Object.assign(new Error(message), { code: 'INVALID_SERVICES', ...(service ? { service } : {}) });
const names = /^[a-z][a-z0-9_-]{0,63}$/;
const excluded = new Set(['runtime-manager', 'mcp-runtime', 'ai-config']);
const fields = new Set(['name', 'enabled', 'cwd', 'command', 'file', 'args', 'port', 'dependsOn', 'env', 'healthPath', 'healthCheck', 'drain', 'timeoutMs']);
const strings = value => Array.isArray(value) && value.every(x => typeof x === 'string' && !x.includes('\0'));
const exists = file => fs.access(file).then(() => true, () => false);
export const servicePortEnv = name => `SEED_${name.replaceAll('-', '_').toUpperCase()}_PORT`;

export async function loadProjectServices(root, builtins) {
  const core = [];
  for (const definition of builtins) {
    if (definition.optional && !await exists(path.resolve(root, definition.file))) continue;
    core.push({ ...definition });
  }
  const reserved = new Set(['front', ...builtins.map(x => x.name), ...excluded]);
  const knownFiles = new Set(builtins.map(x => path.resolve(root, x.file)));
  const project = new Map();
  let directories;
  try { directories = await fs.readdir(path.join(root, 'backend'), { withFileTypes: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw invalid('Project services could not be inspected.'); directories = []; }
  for (const directory of directories.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!directory.isDirectory() || !names.test(directory.name) || reserved.has(directory.name)) continue;
    for (const file of ['server.mjs', 'server.cjs', 'server.js']) {
      const entry = path.join('backend', directory.name, file);
      if (knownFiles.has(path.resolve(root, entry))) break;
      if (await exists(path.join(root, entry))) {
        project.set(directory.name, { name: directory.name, file: entry, port: 4500, healthCheck: 'http', healthPath: '/health', project: true, drain: false });
        break;
      }
    }
  }
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(path.join(root, 'config/services.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw invalid('config/services.json must contain valid service definitions.'); }
  if (manifest !== undefined) {
    if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.services) || manifest.services.length > 100 || Object.keys(manifest).some(k => !['version', 'services'].includes(k))) throw invalid('Use service manifest version 1 with a services array (up to 100 entries).');
    const seen = new Set();
    for (const entry of manifest.services) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !names.test(entry.name) || reserved.has(entry.name) || seen.has(entry.name) || Object.keys(entry).some(k => !fields.has(k))) throw invalid('Service names must be unique and must not replace built-in services.');
      const name = entry.name; seen.add(name);
      if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') throw invalid('Service enabled must be a boolean.', name);
      if (entry.enabled === false) { project.delete(name); continue; }
      if (entry.command !== undefined && (!strings(entry.command) || !entry.command.length || !entry.command[0])) throw invalid('Service command must be a nonempty argv array.', name);
      if (entry.file !== undefined && (typeof entry.file !== 'string' || !entry.file || entry.file.includes('\0'))) throw invalid('Service file must be a Node entrypoint.', name);
      if (Boolean(entry.command) === Boolean(entry.file)) throw invalid('Choose either a service command or a Node file.', name);
      if (entry.args !== undefined && !strings(entry.args)) throw invalid('Service args must be a string array.', name);
      if (entry.cwd !== undefined && (typeof entry.cwd !== 'string' || !entry.cwd || entry.cwd.includes('\0'))) throw invalid('Service cwd must be a directory.', name);
      if (entry.port !== undefined && (!Number.isInteger(entry.port) || entry.port < 1024 || entry.port > 65535)) throw invalid('Service port must be between 1024 and 65535.', name);
      if (entry.dependsOn !== undefined && (!strings(entry.dependsOn) || new Set(entry.dependsOn).size !== entry.dependsOn.length)) throw invalid('Service dependencies must be unique names.', name);
      if (entry.env !== undefined && (!entry.env || typeof entry.env !== 'object' || Array.isArray(entry.env) || Object.entries(entry.env).some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string' || value.includes('\0')))) throw invalid('Service env must contain string values.', name);
      if (entry.healthCheck !== undefined && !['http', 'tcp', 'process'].includes(entry.healthCheck)) throw invalid('Use http, tcp or process readiness.', name);
      if (entry.healthPath !== undefined && (typeof entry.healthPath !== 'string' || !entry.healthPath.startsWith('/') || /[\r\n\0]/.test(entry.healthPath))) throw invalid('Service healthPath must be a local HTTP path.', name);
      if (entry.drain !== undefined && typeof entry.drain !== 'boolean') throw invalid('Service drain must be a boolean.', name);
      if (entry.timeoutMs !== undefined && (!Number.isInteger(entry.timeoutMs) || entry.timeoutMs < 100 || entry.timeoutMs > 300000)) throw invalid('Service timeoutMs must be between 100 and 300000.', name);
      const check = entry.healthCheck || 'http';
      project.set(name, { ...entry, healthCheck: check, healthPath: entry.healthPath || '/', ...(check !== 'process' && entry.port === undefined ? { port: 4500 } : {}), project: true, drain: entry.drain === true });
    }
  }
  const all = [...core, ...project.values()], byName = new Map(all.map(x => [x.name, x])), envNames = new Set();
  for (const definition of project.values()) {
    const envName = servicePortEnv(definition.name);
    if (envNames.has(envName)) throw invalid('Project service names must have distinct environment variable names.', definition.name);
    envNames.add(envName);
    const cwd = path.resolve(root, definition.cwd || '.');
    if (!await fs.stat(cwd).then(x => x.isDirectory(), () => false)) throw invalid('Service working directory does not exist.', definition.name);
    if (definition.file && !await fs.stat(path.resolve(cwd, definition.file)).then(x => x.isFile(), () => false)) throw invalid('Service Node entrypoint does not exist.', definition.name);
  }
  const ordered = [], done = new Set(), visiting = new Set();
  function visit(definition) {
    if (done.has(definition.name)) return;
    if (visiting.has(definition.name)) throw invalid('Service dependencies contain a cycle.', definition.name);
    visiting.add(definition.name);
    for (const name of definition.dependsOn || []) {
      if (!byName.has(name)) throw invalid('A service dependency is missing or disabled.', definition.name);
      visit(byName.get(name));
    }
    visiting.delete(definition.name); done.add(definition.name); ordered.push(definition);
  }
  for (const definition of all) visit(definition);
  return ordered;
}

export async function assignProjectPorts(definitions, config, previous, ownedPorts) {
  const used = new Set(portKeys.map(key => config[key]));
  const retained = new Set();
  for (const definition of definitions) {
    if (!definition.project || definition.port === undefined) continue;
    definition.preferredPort = definition.port;
    const old = previous.get(definition.name);
    if (old?.preferredPort === definition.port && !used.has(old.port) && (ownedPorts.has(old.port) || await portAvailable(old.port))) {
      definition.port = old.port; used.add(old.port); retained.add(definition);
    }
  }
  for (const definition of definitions) {
    if (!definition.project || definition.port === undefined || retained.has(definition)) continue;
    const preferred = definition.preferredPort;
    let port = preferred;
    while (port <= 65535) {
      if (!used.has(port) && (ownedPorts.has(port) || await portAvailable(port))) break;
      port++;
    }
    if (port > 65535) throw Object.assign(new Error('No available port for the project service.'), { code: 'PORT_UNAVAILABLE', service: definition.name });
    definition.preferredPort = preferred; definition.port = port; used.add(port);
  }
}
async function portAvailable(port) {
  const probe = net.createServer();
  return new Promise((resolve, reject) => {
    probe.once('error', error => ['EADDRINUSE', 'EACCES'].includes(error.code) ? resolve(false) : reject(error));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

export async function serviceCommand(root, definition, port) {
  const cwd = path.resolve(root, definition.cwd || '.');
  const expand = text => text.replaceAll('${ROOT}', root).replaceAll('${PORT}', port === undefined ? '' : String(port));
  const argv = definition.command ? definition.command.map(expand) : [process.execPath, path.resolve(cwd, definition.file)];
  if (definition.command?.[0] === 'node') argv[0] = process.execPath;
  if (definition.command?.[0] === 'npm') {
    const npm = process.platform === 'win32' ? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js') : path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
    if (!await exists(npm)) throw invalid('The project Node runtime is missing its npm CLI.', definition.name);
    argv.splice(0, 1, process.execPath, npm);
  }
  const env = Object.fromEntries(Object.entries(definition.env || {}).map(([key, value]) => [key, expand(value)]));
  env.PATH = [path.dirname(process.execPath), path.join(cwd, 'node_modules/.bin'), path.join(root, 'node_modules/.bin'), env.PATH || process.env.PATH || ''].join(path.delimiter);
  if (!['node', 'npm'].includes(definition.command?.[0]) && definition.command) {
    const candidates = path.isAbsolute(argv[0]) || /[\\/]/.test(argv[0]) ? [path.resolve(cwd, argv[0])] : env.PATH.split(path.delimiter).flatMap(folder => {
      const file = path.join(folder, argv[0]);
      return process.platform === 'win32' ? [file, file + '.exe'] : [file];
    });
    let executable;
    for (const candidate of candidates) if (await fs.stat(candidate).then(x => x.isFile(), () => false) && await fs.access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK).then(() => true, () => false)) { executable = candidate; break; }
    if (!executable) throw invalid('Service executable is unavailable. Install its project runtime or correct the command.', definition.name);
    argv[0] = executable;
  }
  return { cwd, command: argv[0], args: [...argv.slice(1), ...(definition.args || []).map(expand)], env };
}
