// Public kernel HTTP contract; lifecycle owner supplies drain and shutdown hooks.
import { kernelStatus, prepareKernel, kernelBackups, inspectKernelPlan } from './manager.mjs';
import { startMaintenance } from './handoff.mjs';
import { readReleaseMetadata } from './contracts/release.mjs';
import { validId } from './storage.mjs';
export async function kernelRequest(req,res,{manager,onMaintenance},route,send){
 if(!route.startsWith('/api/runtime/kernel'))return false;
 try{
  if(req.method==='GET'&&route==='/api/runtime/kernel'){
   let release=null;try{release=await readReleaseMetadata(manager.root);}catch{}
   send(res,200,{kernel:await kernelStatus(manager.root),release,backups:await kernelBackups(manager.root)});return true;
  }
  let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>2048)throw Object.assign(Error('Request too large.'),{code:'PAYLOAD_TOO_LARGE',status:413});chunks.push(chunk);}
  let input;try{input=JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw Object.assign(Error('Invalid JSON.'),{code:'INVALID_REQUEST',status:400});}
  if(!input||typeof input!=='object'||Array.isArray(input))throw Object.assign(Error('Use a JSON object.'),{code:'INVALID_REQUEST',status:400});
  if(req.method==='POST'&&route==='/api/runtime/kernel/check'&&!Object.keys(input).length){
   if(manager.operation||manager.maintenance)throw Object.assign(Error('Runtime operation is active.'),{code:'KERNEL_BUSY',status:409});
   send(res,200,{plan:await prepareKernel(manager.root)});return true;
  }
  const action=route==='/api/runtime/kernel/apply'?'apply':route==='/api/runtime/kernel/restore'?'restore':null;
  const key=action==='apply'?'planId':'backupId';
  if(req.method!=='POST'||!action||!validId(input[key])||input.acceptRisk!==true||Object.keys(input).some(k=>![key,'acceptRisk'].includes(k)))throw Object.assign(Error('Use a plan/backup UUID and acceptRisk:true.'),{code:'INVALID_REQUEST',status:400});
  if(!onMaintenance)throw Object.assign(Error('This runtime does not support maintenance handoff.'),{code:'KERNEL_UNAVAILABLE',status:503});
  if(action==='apply')await inspectKernelPlan(manager.root,input[key]);
  else if(!(await kernelBackups(manager.root)).some(b=>b.id===input[key]&&b.phase!=='invalid'))throw Object.assign(Error('Source backup was not found.'),{code:'INVALID_BACKUP',status:400});
  const undo=await manager.prepareMaintenance();let worker;
  try{worker=await startMaintenance(manager.root,action,input[key]);}
  catch(error){await undo();throw error;}
  let committed=false;
  res.once('finish',()=>{committed=true;worker.commit();void onMaintenance();});
  res.once('close',()=>{if(!committed){worker.abort();void undo();}});
  send(res,202,{jobId:worker.jobId,url:worker.url});return true;
 }catch(error){send(res,error.status||500,{error:{code:error.code||'KERNEL_FAILED',message:error.code?error.message:'Kernel operation failed. Inspect local diagnostics; no success is assumed.'}});return true;}
}
