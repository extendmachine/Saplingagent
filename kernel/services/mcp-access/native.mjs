import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {commandShell,terminateOwned,processGroupAlive} from '../../contracts/local-process.mjs';
import {managedEnvironment} from '../../contracts/local-storage.mjs';

export class ToolError extends Error {
  constructor(code,message){super(message);this.code=code;}
}
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const OUTPUT_LIMIT=1024*1024;
const target=(root,value)=>path.resolve(root,value);
const aborted=()=>({exitCode:null,signal:null,stdout:'',stderr:'',timedOut:false,cancelled:true,stdoutTruncated:false,stderrTruncated:false});

export function createNativeTools(root) {
  const commands=new Set();let closing=false;
  return {
    async listFiles({path:relative='.',limit=200,cursor='0'}) {
      const offset=Number(cursor);
      if(!Number.isSafeInteger(offset)||offset<0)throw new ToolError('INVALID_INPUT','Directory cursor is outside the supported range.');
      const directory=target(root,relative),entries=(await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
      const files=[];
      for(const entry of entries.slice(offset,offset+limit)) {
        const absolutePath=path.join(directory,entry.name),info=await fs.lstat(absolutePath);
        files.push({path:path.isAbsolute(relative)?absolutePath:path.join(relative,entry.name),absolutePath,size:info.size,type:info.isSymbolicLink()?'symlink':info.isDirectory()?'directory':info.isFile()?'file':'other'});
      }
      const truncated=offset+files.length<entries.length;
      return {files,total:entries.length,truncated,...truncated?{nextCursor:String(offset+files.length)}:{}};
    },
    async readFile({path:relative,encoding='utf8',offset=0,maxBytes=OUTPUT_LIMIT}) {
      const file=target(root,relative);
      if(!(await fs.stat(file)).isFile())throw new ToolError('INVALID_INPUT','Read a regular file; use a command when a device or special stream is intended.');
      const handle=await fs.open(file,'r');
      try {
        const info=await handle.stat(),buffer=Buffer.alloc(maxBytes),{bytesRead}=await handle.read(buffer,0,maxBytes,offset),bytes=buffer.subarray(0,bytesRead),truncated=offset+bytesRead<info.size;
        return {path:relative,absolutePath:file,content:bytes.toString(encoding),encoding,hash:digest(bytes),hashScope:offset===0&&!truncated?'file':'returnedBytes',size:info.size,offset,returnedBytes:bytesRead,truncated,...truncated?{nextOffset:offset+bytesRead}:{}};
      }finally{await handle.close();}
    },
    async writeFile({path:relative,content,encoding='utf8'}) {
      if(encoding==='base64'&&(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)))throw new ToolError('INVALID_INPUT','Use complete standard Base64 data.');
      const file=target(root,relative),bytes=Buffer.from(content,encoding);
      await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);
      return {status:'applied',path:relative,absolutePath:file,bytes:bytes.length,hash:digest(bytes),recovery:'No automatic snapshot or rollback is provided by this external MCP service.'};
    },
    async deleteFile({path:relative}) {
      const file=target(root,relative);await fs.unlink(file);
      return {status:'applied',path:relative,absolutePath:file,recovery:'No automatic snapshot or rollback is provided by this external MCP service.'};
    },
    async runCommand({command,cwd='.',timeoutMs=60000},{signal}={}) {
      if(closing||signal?.aborted)return aborted();
      const shell=commandShell(command),directory=target(root,cwd);
      const child=spawn(shell.command,shell.args,{cwd:directory,env:managedEnvironment(root),shell:false,windowsVerbatimArguments:shell.windowsVerbatimArguments,detached:process.platform!=='win32',windowsHide:true,stdio:['ignore','pipe','pipe']});
      const chunks={stdout:[],stderr:[]},sizes={stdout:0,stderr:0},truncated={stdout:false,stderr:false};
      for(const name of ['stdout','stderr'])child[name].on('data',chunk=>{
        const room=OUTPUT_LIMIT-sizes[name];if(chunk.length>room)truncated[name]=true;
        if(room>0){const value=chunk.subarray(0,room);chunks[name].push(value);sizes[name]+=value.length;}
      });
      let timedOut=false,cancelled=false,termination,settled=false,timer;
      const stop=(timeout=false)=>{
        if(timeout)timedOut=true;else cancelled=true;
        return termination??=(terminateOwned(child,{graceMs:150,killMs:750}));
      };
      const cancel=()=>{void stop().catch(()=>{});};
      const completion=new Promise((resolve,reject)=>{
        const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(!processGroupAlive(child))commands.delete(record);};
        child.once('error',()=>{if(settled)return;settled=true;cleanup();reject(new ToolError('COMMAND_START_FAILED','The command could not start. Check its shell, working directory and OS access.'));});
        child.once('close',async(exitCode,exitSignal)=>{
          if(settled)return;settled=true;cleanup();
          try {await termination;resolve({exitCode,signal:exitSignal,stdout:Buffer.concat(chunks.stdout).toString('utf8'),stderr:Buffer.concat(chunks.stderr).toString('utf8'),timedOut,cancelled,stdoutTruncated:truncated.stdout,stderrTruncated:truncated.stderr});}
          catch {reject(new ToolError('COMMAND_STOP_FAILED','The owned command tree did not confirm shutdown. Inspect its state before retrying.'));}
        });
      });
      const record={stop,completion};commands.add(record);
      signal?.addEventListener('abort',cancel,{once:true});
      timer=setTimeout(()=>{void stop(true).catch(()=>{});},timeoutMs);
      if(signal?.aborted)cancel();
      return completion;
    },
    async close() {
      closing=true;
      const active=[...commands];
      await Promise.all(active.map(record=>record.stop()));
      await Promise.allSettled(active.map(record=>record.completion));
    },
  };
}
