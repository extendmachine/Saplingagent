// Configuration and runtime HTTP tests exercise real ownership/processes with a
// disposable tool library. Nothing here reads the developer's installed SDKs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {ensureTools,npmFor,toolRequirements} from '../tools.mjs';

export async function prepareFixtureBindings(root,localNode=process.execPath,engines){
  const wanted=await toolRequirements(root),home=path.join(root,'.runtime/fixture-library');
  if(localNode!==process.execPath){
    const npm=npmFor(localNode).args[0];await fs.mkdir(path.dirname(npm),{recursive:true});
    await fs.writeFile(npm,'// synthetic configuration test npm');
  }
  const binaries=path.join(root,'.runtime/fixture-tools');await fs.mkdir(binaries,{recursive:true});
  for(const name of ['codex','claude','opencode'])await fs.writeFile(path.join(binaries,name),wanted[name]);
  const {ready}=await ensureTools(root,{home,engines,candidates:name=>[path.join(binaries,name)],run:async(exe,args,{cwd})=>{
    if(args[0]==='--version')return fs.readFile(exe,'utf8');
    if(args[0]==='app-server')return 'fixture help';
    if(args.includes('--package-lock-only'))return '';
    if(!args.includes('ci'))throw new Error('Unexpected runtime fixture installation');
    const pkg=JSON.parse(await fs.readFile(path.join(cwd,'package.json'),'utf8'));
    for(const [name,version] of Object.entries(pkg.dependencies)){
      const dir=path.join(cwd,'node_modules',name);await fs.mkdir(dir,{recursive:true});
      await fs.writeFile(path.join(dir,'package.json'),JSON.stringify({version,main:'index.js'}));
      await fs.writeFile(path.join(dir,'index.js'),'// synthetic SDK');
    }
  }});
  if(!ready)throw new Error('Fixture failed tool readiness');
}
