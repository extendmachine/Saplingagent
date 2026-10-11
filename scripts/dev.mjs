import fs from 'node:fs/promises';
import path from 'node:path';
import { root, setup } from './setup.mjs';
import { RuntimeManager, availablePort } from '../backend/runtime-manager/manager.mjs';
import { createManagerServer } from '../backend/runtime-manager/server.mjs';
import { createGateway } from '../backend/runtime-manager/gateway.mjs';

await setup();
const token = (await fs.readFile(path.join(root, 'local-secrets/runtime/service-token'), 'utf8')).trim();
const definitions = [
  { name: 'workspace', portKey: 'workspacePort', file: 'backend/workspace/server.mjs' },
  { name: 'builder', portKey: 'builderPort', file: 'backend/app-builder/server.mjs' },
  { name: 'pdf-editor', portKey: 'pdfEditorPort', file: 'backend/pdf-editor/server.mjs', optional: true },
  { name: 'agent', portKey: 'agentPort', file: 'backend/agent-runtime/server.mjs' },
];
const manager = new RuntimeManager({ root, token, definitions, frontDefinition: { name: 'front', portKey: 'vitePort', file: 'front/node_modules/vite/bin/vite.js', args: config => [path.join(root, 'front'), '--host', '127.0.0.1', '--port', String(config.vitePort), '--strictPort'] } });
let control, gateway, stopping = false;
async function stop(code = 0) {
  if (stopping) return; stopping = true;
  gateway?.closeUpgrades(); gateway?.closeAllConnections(); control?.closeAllConnections();
  await Promise.all([gateway && new Promise(resolve => gateway.close(resolve)), control && new Promise(resolve => control.close(resolve)), manager.close()]);
  process.exit(code);
}
for (const signal of ['SIGINT','SIGTERM','SIGHUP']) process.once(signal, () => void stop());
try {
  const config = await manager.loadConfig(); manager.config = config;
  for (const port of [config.frontPort,config.vitePort,config.runtimeManagerPort]) await availablePort(port);
  await fs.access(path.join(root,'front/node_modules/vite/bin/vite.js'));
  await fs.access(path.join(root,'backend/mcp-runtime/node_modules/@modelcontextprotocol/sdk/package.json'));
  const options = { manager, token, frontPort: config.frontPort, managerPort: config.runtimeManagerPort };
  control = createManagerServer(options); gateway = createGateway(options);
  const listen = (server, port) => new Promise((resolve,reject) => { server.once('error',reject); server.listen(port,'127.0.0.1',resolve); });
  await listen(control,config.runtimeManagerPort); await listen(gateway,config.frontPort);
  await manager.start();
  console.log(`Saplingagent: http://127.0.0.1:${config.frontPort}/ (Agent initialization continues in background)`);
  console.log(`Persistent runtime control: http://127.0.0.1:${config.frontPort}/__saplingagent/runtime`);
} catch (error) { console.error(error.message); await stop(1); }
