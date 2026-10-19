import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {issue} from '../launcher/io.mjs';
const execute=promisify(execFile);
// Both platform APIs refuse an existing destination, including an empty folder
// created after preflight. POSIX rename() alone would silently replace that folder.
export async function moveProject(previous,current){
  try{
    if(process.platform==='darwin'){
      await execute('/usr/bin/osascript',['-l','JavaScript','-e',"ObjC.import('Foundation');function run(args){var error=Ref();if(!$.NSFileManager.defaultManager.moveItemAtPathToPathError(args[0],args[1],error))throw new Error('MOVE_REFUSED');}",previous,current],{cwd:process.env.SAPLING_CONFIGURATION_DIR||'/',timeout:30000});
    }else if(process.platform==='win32'){
      await execute('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';[System.IO.Directory]::Move($env.SAPLING_MOVE_FROM,$env.SAPLING_MOVE_TO)"],{cwd:process.env.SAPLING_CONFIGURATION_DIR,env:{...process.env,SAPLING_MOVE_FROM:previous,SAPLING_MOVE_TO:current},windowsHide:true,timeout:30000});
    }else throw issue('UNSUPPORTED_DEVICE','Project configuration currently supports macOS and Windows.');
  }catch(error){if(error.code==='UNSUPPORTED_DEVICE')throw error;throw issue('PROJECT_RENAME_FAILED','The folder could not be renamed. Close terminals, editors or sync tools using it and retry. The destination is never replaced.');}
}
