import fs from 'node:fs/promises';
import path from 'node:path';
import {issue} from '../launcher/io.mjs';

const ownership=message=>issue('CONFIGURATION_OWNERSHIP',message);
export const identity=stat=>({device:String(stat.dev),inode:String(stat.ino)});
export const sameIdentity=(left,right)=>left?.device===right?.device&&left?.inode===right?.inode;
export async function realDirectory(directory) {
  const stat=await fs.lstat(directory,{bigint:true});
  if(!stat.isDirectory()||stat.isSymbolicLink()||await fs.realpath(directory)!==path.resolve(directory))
    throw ownership('Configuration paths must be real directories, not links. Inspect the saved session before retrying.');
  return identity(stat);
}
export async function siblingLocation(root,directory) {
  root=path.resolve(root);
  const projectIdentity=await realDirectory(root),parent=path.dirname(root);
  const parentIdentity=await realDirectory(parent);
  if(!directory)return {root,parent,projectIdentity,parentIdentity};
  directory=path.resolve(directory);
  if(path.dirname(directory)!==parent||directory===root||!/^sapling-config-[A-Za-z0-9]+$/.test(path.basename(directory)))
    throw ownership('The configuration folder must be a direct sibling of this project. Legacy or moved sessions require inspection; no external folder was removed.');
  const directoryIdentity=await realDirectory(directory);
  return {root,parent,directory,projectIdentity,parentIdentity,directoryIdentity};
}
export async function localRuntime(root) {
  await realDirectory(root);
  const directory=path.join(root,'.runtime');
  await fs.mkdir(directory,{recursive:true});
  await realDirectory(directory);
  return directory;
}
export async function regularJSON(file,{optional=false}={}) {
  let stat;
  try{stat=await fs.lstat(file);}catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw ownership('Configuration ownership metadata must be a regular local file.');
  try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{throw ownership('Configuration ownership metadata is invalid. Inspect the saved session.');}
}
