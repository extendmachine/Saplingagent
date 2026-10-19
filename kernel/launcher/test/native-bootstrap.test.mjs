import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
const exec=promisify(execFile),source=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const go=path.join(source,'.runtime/go1.27.2-darwin-arm64/go/bin/go');
const available=await fs.access(go).then(()=>true,()=>false);

test('compiled macOS app restores absent local Node then launches from its relative Unicode project folder',{skip:process.platform!=='darwin'||!available,timeout:120000},async t=>{
  const base=path.join(source,'.cache/native-bootstrap');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,"项目 user's "));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const build=path.join(root,'.runtime/build'),native=path.join(source,'kernel/launcher/native');await fs.mkdir(build,{recursive:true});
  for(const name of await fs.readdir(native))await fs.copyFile(path.join(native,name),path.join(build,name));
  const binary=path.join(root,'Example.app/Contents/MacOS/launcher');await fs.mkdir(path.dirname(binary),{recursive:true});
  await exec(go,['build','-trimpath','-buildvcs=false','-o',binary,'.'],{cwd:build,env:{...process.env,GO111MODULE:'off',GOTOOLCHAIN:'local',GOENV:'off',GOWORK:'off',CGO_ENABLED:'0',GOCACHE:path.join(source,'.cache/go-build'),GOMAXPROCS:'2'}});
  await fs.mkdir(path.join(root,'kernel/config'),{recursive:true});await fs.writeFile(path.join(root,'kernel/config/macos.json'),JSON.stringify({nodeVersion:process.versions.node}));
  await fs.mkdir(path.join(root,'kernel/scripts/macos'),{recursive:true});await fs.mkdir(path.join(root,'kernel/launcher'),{recursive:true});
  const node=path.join(root,`.runtime/node-v${process.versions.node}-darwin-${process.arch}/bin/node`);
  await fs.writeFile(path.join(root,'kernel/scripts/macos/bootstrap.sh'),`#!/bin/bash\nset -e\n[ "$1" = runtime-only ]\nprintf '%s' "$1" > "$SEED_TEST_ROOT/bootstrap-action"\nmkdir -p "$(dirname "$SEED_TEST_NODE")"\ncp "$SEED_TEST_SOURCE_NODE" "$SEED_TEST_NODE"\n`);
  await fs.writeFile(path.join(root,'kernel/launcher/entry.mjs'),`import fs from 'node:fs';fs.writeFileSync(process.env.SEED_ROOT+'/launched.json',JSON.stringify({args:process.argv.slice(2),exec:process.execPath,root:process.env.SEED_ROOT}));`);
  await exec(binary,[],{cwd:'/',env:{...process.env,SEED_TEST_ROOT:root,SEED_TEST_NODE:node,SEED_TEST_SOURCE_NODE:process.execPath}});
  let result;for(let i=0;i<100;i++){try{result=JSON.parse(await fs.readFile(path.join(root,'launched.json')));break;}catch{}await delay(30);}
  assert.deepEqual(result,{args:['--launch'],exec:node,root});assert.equal(await fs.readFile(path.join(root,'bootstrap-action'),'utf8'),'runtime-only');
  await fs.rm(path.join(root,'bootstrap-action'));await fs.rm(path.join(root,'launched.json'));await exec(binary,[],{cwd:'/'});
  for(let i=0;i<100&&!await fs.access(path.join(root,'launched.json')).then(()=>true,()=>false);i++)await delay(30);
  await assert.rejects(fs.access(path.join(root,'bootstrap-action')));assert.ok(await fs.access(path.join(root,'launched.json')).then(()=>true));
  // Verify the same native source also compiles for both supported Windows architectures.
  for(const arch of ['amd64','arm64'])await exec(go,['build','-trimpath','-buildvcs=false','-o',path.join(build,arch+'.exe'),'.'],{cwd:build,env:{...process.env,GOOS:'windows',GOARCH:arch,GO111MODULE:'off',GOTOOLCHAIN:'local',GOENV:'off',GOWORK:'off',CGO_ENABLED:'0',GOCACHE:path.join(source,'.cache/go-build'),GOMAXPROCS:'2'}});
});

test('macOS runtime-only bootstrap validates existing local Node without entering installer or web setup',{skip:process.platform!=='darwin'},async t=>{
  const base=path.join(source,'.cache/native-bootstrap');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'runtime-only '));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const script=path.join(root,'kernel/scripts/macos/bootstrap.sh');await fs.mkdir(path.dirname(script),{recursive:true});await fs.copyFile(path.join(source,'kernel/scripts/macos/bootstrap.sh'),script);
  await fs.mkdir(path.join(root,'kernel/config'),{recursive:true});await fs.writeFile(path.join(root,'kernel/config/macos.json'),JSON.stringify({nodeVersion:process.versions.node}));
  const node=path.join(root,`.runtime/node-v${process.versions.node}-darwin-${process.arch}/bin/node`);await fs.mkdir(path.dirname(node),{recursive:true});await fs.copyFile(process.execPath,node);
  await fs.writeFile(path.join(root,'kernel/scripts/macos/cli.mjs'),"throw Error('installer must not run');");
  const result=await exec('/bin/bash',[script,'runtime-only'],{cwd:'/'});assert.match(result.stdout,/Detected device/);await assert.rejects(fs.access(path.join(root,'local-secrets')));
});
