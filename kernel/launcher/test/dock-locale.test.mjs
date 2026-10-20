import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';

const exec=promisify(execFile);
const base=fileURLToPath(new URL('../../../.cache/dock-locale-tests/',import.meta.url));
const bridge=new URL('../dock.mjs',import.meta.url).href;

test('real Unicode executable identity is stable with Finder, C and French locales',{skip:process.platform!=='darwin',timeout:15000},async t=>{
 await fs.mkdir(base,{recursive:true});
 const root=await fs.mkdtemp(path.join(base,'identity-'));
 let child,exited;
 t.after(async()=>{
  if(child?.exitCode===null){child.kill();await exited;}
  await fs.rm(root,{recursive:true,force:true});
 });
 const executable=path.join(root,'项目 中文','应用 示例.app','Contents','MacOS','applet');
 await fs.mkdir(path.dirname(executable),{recursive:true});
 await fs.copyFile(process.execPath,executable);
 child=spawn(executable,['-e','process.stdout.write("ready\\n");setInterval(()=>{},1000)'],{cwd:root,stdio:['ignore','pipe','ignore']});
 exited=once(child,'exit');
 await once(child.stdout,'data');
 const expected=await fs.realpath(executable);
 const clean=Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='LANG'&&!key.startsWith('LC_')));
 const probe=`import {processIdentity} from ${JSON.stringify(bridge)};
 const before=JSON.stringify(process.env);
 const identity=await processIdentity(${child.pid});
 console.log(JSON.stringify({identity,unchanged:before===JSON.stringify(process.env)}));`;
 let first;
 for(const [label,locale] of [
  ['Finder without locale',{}],
  ['C locale',{LANG:'C',LC_ALL:'C'}],
  ['French time',{LANG:'en_US.UTF-8',LC_TIME:'fr_FR.UTF-8'}],
  ['French locale',{LANG:'fr_FR.UTF-8',LC_ALL:'fr_FR.UTF-8'}],
 ]){
  const {stdout}=await exec(process.execPath,['--input-type=module','-e',probe],{cwd:root,env:{...clean,...locale},timeout:3000});
  const result=JSON.parse(stdout);
  assert.equal(result.unchanged,true,`${label}: parent environment remains unchanged`);
  assert.equal(result.identity?.executable,expected,`${label}: real executable path`);
  assert.match(result.identity.stamp,/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d\d:\d\d:\d\d \d{4}$/);
  first??=result.identity;
  assert.deepEqual(result.identity,first,`${label}: stable process start identity`);
 }
});
