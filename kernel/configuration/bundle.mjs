import fs from 'node:fs/promises';
import path from 'node:path';
import {builtinModules} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {prepareSetupUI} from '../launcher/setup-ui.mjs';
import {writeJSON,issue} from '../launcher/io.mjs';
import {siblingLocation,realDirectory} from './paths.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const within=(root,file)=>{const relative=path.relative(root,file);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
// The backend has no third-party dependencies. Preserve relative module locations
// and reject an unclosed import graph instead of reaching back into the project.
export async function moduleClosure(root,entry='kernel/configuration/host.mjs') {
  const seen=new Map();
  async function visit(relative) {
    if(seen.has(relative))return;
    if(!relative.startsWith('kernel/')||!within(root,path.join(root,relative)))throw issue('CONFIGURATION_BUNDLE_INVALID','Configuration imports must stay in the kernel.',500);
    const file=path.join(root,relative),stat=await fs.lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink())throw issue('CONFIGURATION_BUNDLE_INVALID','Configuration source must use regular files.',500);
    const bytes=await fs.readFile(file);seen.set(relative,bytes);
    const source=bytes.toString('utf8');
    const imports=[...source.matchAll(/(?<![.\w])(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g)].map(m=>m[1]);
    for(const spec of imports) {
      if(spec.startsWith('node:')||builtinModules.includes(spec))continue;
      if(!spec.startsWith('.'))throw issue('CONFIGURATION_BUNDLE_INVALID',`Unsupported configuration import ${spec} in ${relative}.`,500);
      await visit(path.posix.normalize(path.posix.join(path.posix.dirname(relative),spec)));
    }
  }
  await visit(entry);return seen;
}
export async function prepareConfigurationBundle(root,{prepareUI=prepareSetupUI}={}) {
  await realDirectory(root);
  await realDirectory(path.join(root,'kernel'));
  await fs.mkdir(path.join(root,'kernel/.cache'),{recursive:true});
  await realDirectory(path.join(root,'kernel/.cache'));
  await prepareUI(root);
  const files=await moduleClosure(root), cache=path.join(root,'kernel/.cache/configuration');
  const stage=cache+'-'+randomUUID();
  await fs.mkdir(stage,{recursive:true});
  try {
    for(const [relative,bytes] of files) {
      const target=path.join(stage,'code',relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
    }
    // Only the current verified build, not accumulated old assets.
    const ui=JSON.parse(await fs.readFile(path.join(root,'kernel/.cache/setup/build.json'),'utf8'));
    const manifest=[];
    for(const item of ui.files) {
      if(item.path!=='index.html'&&!/^assets\/[a-zA-Z0-9_.-]+$/.test(item.path))throw issue('CONFIGURATION_BUNDLE_INVALID','Invalid setup resource.',500);
      const bytes=await fs.readFile(path.join(root,'kernel/.cache/setup',item.path));
      if(digest(bytes)!==item.sha256)throw issue('CONFIGURATION_BUNDLE_CHANGED','Setup changed during copying. Retry configure.',409);
      const dest=path.join(stage,'ui',item.path);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);
      manifest.push({path:'ui/'+item.path,sha256:digest(bytes)});
    }
    for(const [relative,bytes]of files)manifest.push({path:'code/'+relative,sha256:digest(bytes)});
    for(const [name,bytes] of files)if(digest(await fs.readFile(path.join(root,name)))!==digest(bytes))throw issue('CONFIGURATION_BUNDLE_CHANGED','Configuration source changed while preparing. Retry configure.');
    await writeJSON(path.join(stage,'bundle.json'),{schemaVersion:1,files:manifest});
    // The outer project configuration lease serializes this publication.
    await fs.rm(cache,{recursive:true,force:true});await fs.rename(stage,cache);
    return cache;
  }finally{await fs.rm(stage,{recursive:true,force:true});}
}
export async function copyConfigurationBundle(root,bundle,{node=process.execPath,tempParent}={}) {
  const {parent}=await siblingLocation(root);
  if(tempParent!==undefined)throw issue('CONFIGURATION_LOCATION','Configuration uses this project’s parent folder; a temporary-directory override is not supported.');
  await realDirectory(bundle);
  const directory=await fs.mkdtemp(path.join(parent,'sapling-config-'));await fs.chmod(directory,0o700);
  try {
    const receipt=JSON.parse(await fs.readFile(path.join(bundle,'bundle.json'),'utf8'));
    for(const file of receipt.files) {
      if(typeof file.path!=='string'||file.path.includes('\\')||file.path.split('/').some(part=>!part||part==='.'||part==='..')||!/^(?:code\/kernel\/|ui\/)/.test(file.path)||!within(bundle,path.join(bundle,file.path)))throw issue('CONFIGURATION_BUNDLE_INVALID','Invalid configuration bundle path.',500);
      const bytes=await fs.readFile(path.join(bundle,file.path));
      if(digest(bytes)!==file.sha256)throw issue('CONFIGURATION_BUNDLE_CHANGED','Configuration bundle changed. Retry configure.');
      const destination=path.join(directory,file.path);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes);
    }
    await fs.copyFile(path.join(bundle,'bundle.json'),path.join(directory,'bundle.json'));
    const executable=path.join(directory,process.platform==='win32'?'node.exe':'node');
    await fs.copyFile(node,executable);await fs.chmod(executable,0o700);
    await fs.mkdir(path.join(directory,'tmp'));
    return {directory,executable};
  }catch(error){await fs.rm(directory,{recursive:true,force:true});throw error;}
}
