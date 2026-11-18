import fs from 'node:fs/promises';
import path from 'node:path';
import {engineModules} from '../../contracts/engine-dependencies.mjs';
import {openCodeBinary,claudeBinary} from '../../contracts/local-process.mjs';

// Native integration fixtures exercise the selected installed provider using synthetic data.
export async function linkNativeProvider(source,root,engine) {
  const packageName=engine==='claude'?'@anthropic-ai/claude-agent-sdk':'@opencode-ai/sdk';
  const executable=engine==='claude'?claudeBinary:openCodeBinary;
  const links=[
    [path.join(engineModules(source,engine),packageName),path.join(engineModules(root,engine),packageName)],
    [executable(source),executable(root)],
  ];
  for(const [actual,local] of links){
    await fs.mkdir(path.dirname(local),{recursive:true});
    await fs.symlink(await fs.realpath(actual),local);
  }
}
