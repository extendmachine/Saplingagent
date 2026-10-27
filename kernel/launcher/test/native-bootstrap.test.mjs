import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {buildEnv,prepareBuildStorage} from '../build.mjs';
const exec=promisify(execFile),source=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const go=path.join(source,'.runtime/go1.27.2-darwin-arm64/go/bin/go');
const available=await fs.access(go).then(()=>true,()=>false);

test('compiled macOS app restores absent local Node then launches from its relative Unicode project folder',{skip:process.platform!=='darwin'||!available,timeout:120000},async t=>{
  const base=path.join(source,'.cache/native-bootstrap');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,"项目 user's "));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const build=path.join(root,'.runtime/build'),native=path.join(source,'kernel/launcher/native');await fs.mkdir(build,{recursive:true});
  for(const name of await fs.readdir(native))await fs.copyFile(path.join(native,name),path.join(build,name));
  const binary=path.join(root,'Example.app/Contents/MacOS/launcher');await fs.mkdir(path.dirname(binary),{recursive:true});
  await prepareBuildStorage(source);
  await exec(go,['build','-trimpath','-buildvcs=false','-o',binary,'.'],{cwd:build,env:buildEnv(source)});
  await fs.mkdir(path.join(root,'kernel/config'),{recursive:true});await fs.writeFile(path.join(root,'kernel/config/macos.json'),JSON.stringify({nodeVersion:process.versions.node}));
  await fs.mkdir(path.join(root,'kernel/scripts/macos'),{recursive:true});await fs.mkdir(path.join(root,'kernel/launcher'),{recursive:true});
  const node=path.join(root,`.runtime/node-v${process.versions.node}-darwin-${process.arch}/bin/node`);
  await fs.writeFile(path.join(root,'kernel/scripts/macos/bootstrap.sh'),`#!/bin/bash\nset -e\n[ "$1" = runtime-only ]\nprintf '%s' "$1" > "$SEED_TEST_ROOT/bootstrap-action"\nmkdir -p "$(dirname "$SEED_TEST_NODE")"\ncp "$SEED_TEST_SOURCE_NODE" "$SEED_TEST_NODE"\n`);
  await fs.writeFile(path.join(root,'kernel/launcher/entry.mjs'),`import fs from 'node:fs';fs.writeFileSync(process.env.SEED_ROOT+'/launched.json',JSON.stringify({args:process.argv.slice(2),exec:process.execPath,root:process.env.SEED_ROOT,temp:process.env.TEMP,cache:process.env.npm_config_cache,nodeCache:process.env.NODE_COMPILE_CACHE,config:process.env.XDG_CONFIG_HOME}));`);
  await exec(binary,[],{cwd:'/',env:{...process.env,SEED_TEST_ROOT:root,SEED_TEST_NODE:node,SEED_TEST_SOURCE_NODE:process.execPath,NODE_COMPILE_CACHE:path.join(root,'foreign-node-cache'),XDG_CONFIG_HOME:path.join(root,'foreign-config')}});
  let result;for(let i=0;i<100;i++){try{result=JSON.parse(await fs.readFile(path.join(root,'launched.json')));break;}catch{}await delay(30);}
  assert.deepEqual(result,{args:['--launch'],exec:node,root,temp:path.join(root,'.runtime/launcher-tmp'),cache:path.join(root,'.cache/npm'),nodeCache:path.join(root,'.cache/node-compile'),config:path.join(root,'local-secrets/runtime/config')});assert.equal(await fs.readFile(path.join(root,'bootstrap-action'),'utf8'),'runtime-only');
  await fs.rm(path.join(root,'bootstrap-action'));await fs.rm(path.join(root,'launched.json'));await exec(binary,[],{cwd:'/'});
  for(let i=0;i<100&&!await fs.access(path.join(root,'launched.json')).then(()=>true,()=>false);i++)await delay(30);
  await assert.rejects(fs.access(path.join(root,'bootstrap-action')));assert.ok(await fs.access(path.join(root,'launched.json')).then(()=>true));
  // Verify the same native source also compiles for both supported Windows architectures.
  for(const arch of ['amd64','arm64'])await exec(go,['build','-trimpath','-buildvcs=false','-o',path.join(build,arch+'.exe'),'.'],{cwd:build,env:{...buildEnv(source),GOOS:'windows',GOARCH:arch}});
});

test('macOS runtime-only bootstrap validates existing local Node without entering installer or web setup',{skip:process.platform!=='darwin'},async t=>{
  const base=path.join(source,'.cache/native-bootstrap');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'runtime-only '));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const script=path.join(root,'kernel/scripts/macos/bootstrap.sh');await fs.mkdir(path.dirname(script),{recursive:true});await fs.copyFile(path.join(source,'kernel/scripts/macos/bootstrap.sh'),script);await fs.mkdir(path.join(root,'kernel/localization'),{recursive:true});await fs.copyFile(path.join(source,'kernel/localization/installer-messages.sh'),path.join(root,'kernel/localization/installer-messages.sh'));
  await fs.mkdir(path.join(root,'kernel/config'),{recursive:true});await fs.writeFile(path.join(root,'kernel/config/macos.json'),JSON.stringify({nodeVersion:process.versions.node}));
  const node=path.join(root,`.runtime/node-v${process.versions.node}-darwin-${process.arch}/bin/node`);await fs.mkdir(path.dirname(node),{recursive:true});await fs.copyFile(process.execPath,node);
  await fs.writeFile(path.join(root,'kernel/scripts/macos/cli.mjs'),"throw Error('installer must not run');");
  const result=await exec('/bin/bash',[script,'runtime-only'],{cwd:'/'});assert.match(result.stdout,/Detected device/);await fs.access(path.join(root,'local-secrets/runtime/config'));await fs.access(path.join(root,'.cache/node-compile'));
});

test('macOS bootstrap overrides inherited caches before the first Node invocation and refuses cache links',{skip:process.platform!=='darwin'},async t=>{
 const base=path.join(source,'.cache/native-bootstrap');await fs.mkdir(base,{recursive:true});const parent=await fs.mkdtemp(path.join(base,'first-node-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));const root=path.join(parent,'project'),foreign=path.join(parent,'foreign');await fs.mkdir(root);await fs.mkdir(foreign);
 const script=path.join(root,'kernel/scripts/macos/bootstrap.sh');await fs.mkdir(path.dirname(script),{recursive:true});await fs.copyFile(path.join(source,'kernel/scripts/macos/bootstrap.sh'),script);await fs.mkdir(path.join(root,'kernel/localization'),{recursive:true});await fs.copyFile(path.join(source,'kernel/localization/installer-messages.sh'),path.join(root,'kernel/localization/installer-messages.sh'));
 await fs.mkdir(path.join(root,'kernel/config'),{recursive:true});await fs.writeFile(path.join(root,'kernel/config/macos.json'),JSON.stringify({nodeVersion:process.versions.node}));
 const node=path.join(root,`.runtime/node-v${process.versions.node}-darwin-${process.arch}/bin/node`),seen=path.join(root,'first-node-env');await fs.mkdir(path.dirname(node),{recursive:true});
 await fs.writeFile(node,`#!/bin/bash\nprintf '%s\\n' "$NODE_COMPILE_CACHE" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_STATE_HOME" "$XDG_CACHE_HOME" > "$SAPLING_TEST_ENV_RECEIPT"\nexec "$SAPLING_TEST_SOURCE_NODE" "$@"\n`,{mode:0o755});
 const env={...process.env,SAPLING_TEST_ENV_RECEIPT:seen,SAPLING_TEST_SOURCE_NODE:process.execPath,NODE_COMPILE_CACHE:foreign,XDG_CONFIG_HOME:foreign,XDG_DATA_HOME:foreign,XDG_STATE_HOME:foreign,XDG_CACHE_HOME:foreign};
 await exec('/bin/bash',[script,'runtime-only'],{env,cwd:parent});
 assert.deepEqual((await fs.readFile(seen,'utf8')).trim().split('\n'),['.cache/node-compile','local-secrets/runtime/config','data/runtime','data/runtime-state','.cache/runtime'].map(relative=>path.join(root,relative)));assert.deepEqual(await fs.readdir(foreign),[]);
 await fs.rm(seen);await fs.rm(path.join(root,'.cache/node-compile'),{recursive:true});await fs.symlink(foreign,path.join(root,'.cache/node-compile'));await assert.rejects(exec('/bin/bash',[script,'runtime-only'],{env,cwd:parent}),error=>error.stderr.includes('ordinary local directories'));await assert.rejects(fs.access(seen));assert.deepEqual(await fs.readdir(foreign),[]);
});
