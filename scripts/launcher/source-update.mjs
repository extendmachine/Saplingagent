import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const t = (en, zh) => process.env.SAPLING_LANG === 'zh' ? zh : en;
function environment() {
  const env = {...process.env,GIT_TERMINAL_PROMPT:'0'};
  for(const key of Object.keys(env))if(key.startsWith('GIT_')&&key!=='GIT_TERMINAL_PROMPT')delete env[key];
  return env;
}
async function git(root,args,{optional=false}={}) {
  try{return (await exec('git',['-C',root,...args],{env:environment(),encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024})).stdout.trim();}
  catch(error){if(optional&&error.code!== 'ENOENT')return '';throw Object.assign(new Error(t(`Source update: Git ${args[0]} failed. Check network/Git access and retry. Raw remote output is hidden.`,`源码更新：Git ${args[0]} 失败。请检查网络和 Git 访问后重试；不会显示远端原始输出。`)),{operation:args[0]});}
}
export async function runtimePortsBusy(root) {
  const config=JSON.parse(await fs.readFile(path.join(root,'config/runtime.json'),'utf8'));
  let activePorts = {};
  try { activePorts = JSON.parse(await fs.readFile(path.join(root, '.runtime/runtime-address.json'), 'utf8')).ports || {}; } catch {}
  const ports=[...new Set([...Object.entries(config), ...Object.entries(activePorts)].filter(([key,value])=>key.endsWith('Port')&&Number.isInteger(value)&&value>0&&value<65536).map(([,port])=>port))];
  return (await Promise.all(ports.map(port=>new Promise(resolve=>{
    const socket=net.createConnection({host:'127.0.0.1',port});
    const done=value=>{socket.destroy();resolve(value);};
    socket.once('connect',()=>done(true));socket.once('error',()=>done(false));socket.setTimeout(600,()=>done(false));
  })))).some(Boolean);
}
export async function updateSource(root,{mode,output=console.log,isRunning=runtimePortsBusy}={}) {
  if(mode!=='upstream') {
    output(t(`Source: ${mode} storage keeps your code/version. Only local dependencies are checked. Choose Git / storage → Follow release if you want upstream source updates.`,`源码：${mode} 存放模式保留你的代码和版本；本次只检查本地依赖。需要更新上游源码，请在 Git / 存放配置中选择“跟随 release”。`));
    return {changed:false,reason:'customer-owned'};
  }
  const branch=await git(root,['branch','--show-current']);
  const tracked=branch&&await git(root,['config','--get',`branch.${branch}.merge`],{optional:true});
  const remote=branch&&await git(root,['config','--get',`branch.${branch}.remote`],{optional:true});
  if(!branch||remote!=='upstream'||!tracked?.startsWith('refs/heads/')) {
    output(t('Source: selected historical/untracked version preserved; no source update. Return to your upstream-tracking branch to update.','源码：保留当前历史／非跟踪版本，本次不更新源码。需要更新时，请先返回跟随上游的分支。'));
    return {changed:false,reason:'selected-version'};
  }
  const head=await git(root,['rev-parse','HEAD']);
  if(await git(root,['status','--porcelain']))throw new Error(t('Source update paused: save or commit your pending changes first, then choose Install / update again. No files were overwritten.','源码更新暂停：请先保存版本或提交未保存的修改，再选择安装 / 更新。未覆盖文件。'));
  const gitDir=await git(root,['rev-parse','--absolute-git-dir']);
  for(const name of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply'])if(await fs.access(path.join(gitDir,name)).then(()=>true,()=>false))throw new Error(t('Finish the existing Git operation before updating source.','请先完成当前 Git 合并／变基等操作，再更新源码。'));
  if(await isRunning(root))throw new Error(t('Source update paused: configured application ports are in use. Stop the running app before updating.','源码更新暂停：应用配置的端口正在使用。请先停止正在运行的应用，再更新。'));
  const targetBranch=tracked.slice('refs/heads/'.length);
  await git(root,['check-ref-format','--branch',targetBranch]);
  const target=`refs/remotes/upstream/${targetBranch}`;
  output(t(`Checking upstream ${targetBranch}; current source ${head.slice(0,8)}…`,`正在检查上游 ${targetBranch}；当前源码 ${head.slice(0,8)}…`));
  const heartbeat=setInterval(()=>output(t('Still checking upstream; waiting for Git/network…','仍在检查上游，请等待 Git／网络响应…')),15000);heartbeat.unref();
  try{await git(root,['fetch','--no-tags','upstream',`${tracked}:${target}`]);}finally{clearInterval(heartbeat);}
  const latest=await git(root,['rev-parse',target]);
  if(await git(root,['rev-parse','HEAD'])!==head||await git(root,['branch','--show-current'])!==branch||await git(root,['status','--porcelain']))throw new Error(t('Source changed during the update check. Save your work and retry; no merge was performed.','检查期间源码状态发生变化，请保存后重试；未执行合并。'));
  let current=false;try{await git(root,['merge-base','--is-ancestor',latest,head]);current=true;}catch{}
  if(current){output(t(`Source is current with upstream ${latest.slice(0,8)}; your local commits are retained.`,`源码已包含上游 ${latest.slice(0,8)}；本地提交保留。`));return {changed:false,reason:'current',sourceCommit:latest};}
  output(t(`New upstream source ${latest.slice(0,8)}. Checking whether your local version can merge…`,`发现上游新源码 ${latest.slice(0,8)}，正在检查能否与本地版本合并…`));
  try{await git(root,['merge-tree','--write-tree',head,latest]);}
  catch{throw new Error(t('Source update paused: the merge has conflicts, unrelated history, or Git lacks merge-tree --write-tree (Git 2.38+). Working files were kept. Review git fetch upstream and git merge upstream/'+targetBranch+' manually.','源码更新暂停：存在合并冲突、无共同历史，或 Git 不支持 merge-tree --write-tree（需 Git 2.38+）。工作文件保留。请手动检查 git fetch upstream 和 git merge upstream/'+targetBranch+'。'));}
  if(await isRunning(root)||await git(root,['rev-parse','HEAD'])!==head||await git(root,['branch','--show-current'])!==branch||await git(root,['status','--porcelain']))throw new Error(t('App/source state changed while preparing the update. Stop the app, save work and retry.','准备更新时应用／源码状态发生变化，请停止应用并保存后重试。'));
  try{await git(root,['merge','--no-edit','--no-gpg-sign','--no-autostash','--no-overwrite-ignore',latest]);}
  catch{throw new Error(t('Git could not finish the source merge (for example an ignored file collision, hook or repository setting). Inspect git status and the current version before retrying; source and dependency success are not assumed.','Git 未能完成源码合并（例如忽略文件冲突、Hook 或仓库配置问题）。请先检查 git status 和当前版本再重试；不会将源码或依赖报告为更新成功。'));}
  const merged=await git(root,['rev-parse','HEAD']);
  output(t(`Source updated: ${head.slice(0,8)} → ${merged.slice(0,8)} (upstream ${latest.slice(0,8)}). Local history retained.`,`源码已更新：${head.slice(0,8)} → ${merged.slice(0,8)}（上游 ${latest.slice(0,8)}），本地历史保留。`));
  return {changed:true,sourceCommit:latest,head:merged};
}
