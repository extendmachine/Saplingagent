import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {deviceName,nodeRuntimeName} from '../../tooling/device.mjs';
import {runtimeHome} from '../../tooling/bindings.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const exec=promisify(execFile);
test('Linux device settings and tool names distinguish x64 and ARM64',()=>{
  assert.equal(deviceName('linux'),'linux');
  assert.equal(nodeRuntimeName('1.2.3','linux','x64'),'node-v1.2.3-linux-x64');
  assert.equal(nodeRuntimeName('1.2.3','linux','arm64'),'node-v1.2.3-linux-arm64');
  assert.ok(runtimeHome(root,{},'linux').endsWith(path.join('.local','share','Saplingagent')));
});

test('Linux bootstrap reuses a shared distribution, can switch to a movable portable copy, and binds two projects independently',
{skip:process.platform!=='linux',timeout:60000},async t=>{
  const cache=path.join(root,'.cache/linux-bootstrap');await fs.mkdir(cache,{recursive:true});
  const area=await fs.mkdtemp(path.join(cache,'case-'));t.after(()=>fs.rm(area,{recursive:true,force:true}));
  const library=path.join(area,'shared library'),official=path.dirname(path.dirname(process.execPath));
  const name=nodeRuntimeName(process.versions.node);
  await fs.mkdir(path.join(library,'runtimes'),{recursive:true});
  await fs.symlink(official,path.join(library,'runtimes',name));
  const project=async key=>{
    const dir=path.join(area,key);
    for(const file of ['scripts/linux/bootstrap.sh','scripts/linux/node-download.sh','scripts/linux/node.mjs','tooling/device.mjs','tooling/bindings.mjs','contracts/local-storage.mjs','localization/installer-messages.sh']){
      const to=path.join(dir,'kernel',file);await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(path.join(root,'kernel',file),to);
    }
    await fs.mkdir(path.join(dir,'kernel/config'));await fs.writeFile(path.join(dir,'kernel/config/linux.json'),JSON.stringify({nodeVersion:process.versions.node}));
    return dir;
  };
  const run=(dir,mode)=>exec('/bin/bash',[path.join(dir,'kernel/scripts/linux/bootstrap.sh'),'runtime-only'],{
    env:{PATH:'/usr/bin:/bin',HOME:area,SAPLING_RUNTIME_MODE:mode,SAPLING_RUNTIME_HOME:library},
  });
  let a=await project('first app');const b=await project('second'),alias=dir=>path.join(dir,'.runtime',name);
  await Promise.all([run(a,'shared'),run(b,'shared')]);
  assert.equal(await fs.realpath(alias(a)),official);assert.equal(await fs.realpath(alias(b)),official);
  await run(a,'portable');
  const moved=path.join(area,'moved');await fs.rename(a,moved);a=moved;
  await run(a,'portable');
  const portable=await fs.realpath(alias(a));assert.ok(portable.startsWith(a+path.sep));
  assert.equal((await exec(path.join(portable,'bin/node'),['--version'])).stdout.trim(),process.version);
  assert.match((await exec(path.join(portable,'bin/node'),[path.join(portable,'lib/node_modules/npm/bin/npm-cli.js'),'--version'])).stdout,/^\d+\.\d+\.\d+/);
  await run(a,'shared');assert.equal(await fs.realpath(alias(a)),official);
});

test('Linux downloads one matching archive across installers and keeps a failed checksum out of the library',
{skip:process.platform!=='linux',timeout:30000},async t=>{
  const base=path.join(root,'.cache/linux-bootstrap');await fs.mkdir(base,{recursive:true});
  const area=await fs.mkdtemp(path.join(base,'download-'));t.after(()=>fs.rm(area,{recursive:true,force:true}));
  const version='24.21.0',name=nodeRuntimeName(version),archive=name+'.tar.gz';
  const registry=path.join(area,'registry'),library=path.join(area,'library'),commands=path.join(area,'commands');
  await fs.mkdir(path.join(registry,name,'bin'),{recursive:true});
  await fs.mkdir(path.join(registry,name,'lib/node_modules/npm/bin'),{recursive:true});
  await fs.writeFile(path.join(registry,name,'bin/node'),'#!/bin/sh\necho v'+version+'/linux/'+process.arch+'\n',{mode:0o755});
  await fs.writeFile(path.join(registry,name,'lib/node_modules/npm/bin/npm-cli.js'),'');
  await exec('tar',['-czf',archive,name],{cwd:registry});
  await fs.mkdir(commands);
  await fs.writeFile(path.join(commands,'curl'),[
    '#!/bin/bash','set -eu','while [ "$#" -gt 0 ]; do',
    'case "$1" in https://*) url=$1 ;; -o) shift; dest=$1 ;; esac','shift','done',
    'echo "$url" >> "$REGISTRY/requests"','cp "$REGISTRY/${url##*/}" "$dest"','',
  ].join('\n'),{mode:0o755});
  const run=()=>exec('/bin/bash',['-c',[
    'set -eu','source "$1/kernel/scripts/linux/node-download.sh"',
    'source "$1/kernel/localization/installer-messages.sh"','version=$2; arch=$3; mode=shared',
    'linux_install_node "$4"',
  ].join('\n'),'test',root,version,process.arch,library],{
    env:{PATH:commands+':/usr/bin:/bin',REGISTRY:registry,HOME:area,SAPLING_LANG:'en'},
  });
  await fs.writeFile(path.join(registry,'SHASUMS256.txt'),'0'.repeat(64)+'  '+archive+'\n');
  await assert.rejects(run(),/SHA-256/);assert.deepEqual(await fs.readdir(path.join(library,'runtimes')),[]);
  await fs.writeFile(path.join(registry,'SHASUMS256.txt'),(await exec('sha256sum',[archive],{cwd:registry})).stdout);
  await fs.writeFile(path.join(registry,'requests'),'');
  const [one,two]=await Promise.all([run(),run()]);
  assert.equal(one.stdout,two.stdout);assert.equal(one.stdout.trim(),path.join(library,'runtimes',name,'bin/node'));
  assert.deepEqual((await fs.readFile(path.join(registry,'requests'),'utf8')).trim().split('\n'),[
    'https://nodejs.org/dist/v'+version+'/SHASUMS256.txt','https://nodejs.org/dist/v'+version+'/'+archive,
  ]);
});
