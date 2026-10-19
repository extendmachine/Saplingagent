import {prepareManagedEnvironment} from '../../contracts/local-storage.mjs';
import path from 'node:path';
import { AppServer } from '../../contracts/codex-rpc.mjs';
import { codexBinary } from '../../contracts/local-process.mjs';
import { failure,privateDirectory } from './store.mjs';
export class AccountSetup {
  constructor(root,store,{Client=AppServer,command=codexBinary(root)}={}) { Object.assign(this,{root,store,Client,command});this.login={phase:'idle'};this.epoch=0;this.clientClosures=new WeakMap();this.pendingCloses=new Set(); }
  snapshot(){return {...this.login};}
  closeClient(client){
    if(!client)return Promise.resolve();
    let closing=this.clientClosures.get(client);
    if(!closing){closing=Promise.resolve().then(()=>client.close());this.clientClosures.set(client,closing);this.pendingCloses.add(closing);closing.then(()=>this.pendingCloses.delete(closing),()=>{});}
    return closing;
  }
  async begin(mode){
    if(!['chatgpt','chatgptDeviceCode'].includes(mode))throw failure('INVALID_CONFIG','Choose browser or device-code login.');
    if(['starting','pending','completing'].includes(this.login.phase))throw failure('LOGIN_BUSY','A sign-in is already running. Finish or cancel it first.',409);
    const epoch=++this.epoch;this.login={phase:'starting',mode};
    let client;this.notices=[];
    try{
      await privateDirectory(path.join(this.root,'local-secrets'));
      await privateDirectory(path.join(this.root,'local-secrets/codex'));
      if(epoch!==this.epoch)throw failure('LOGIN_CANCELLED','Sign-in was cancelled.',409);
      const env={...await prepareManagedEnvironment(this.root),CODEX_HOME:path.join(this.root,'local-secrets/codex'),SEED_ROOT:this.root};
      for(const key of ['OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN','SAPLING_CODEX_API_KEY'])delete env[key];
      client=this.client=new this.Client({command:this.command,cwd:this.root,env,args:['-c','cli_auth_credentials_store="file"','-c','model_provider="openai"']});
      client.on('notification',m=>{if(m.method==='account/login/completed'){if(epoch===this.epoch&&this.login.phase==='starting')this.notices.push(m.params);else void this.completed(m.params,epoch).catch(()=>{});}});
      client.on('disconnect',()=>{if(epoch===this.epoch&&['starting','pending'].includes(this.login.phase))this.login={phase:'failed',message:'Sign-in service stopped. Retry sign-in.',mode};});
      await client.call('initialize',{clientInfo:{name:'saplingagent-setup',title:'Saplingagent setup',version:'0.1.0'},capabilities:{experimentalApi:true}});client.send({method:'initialized',params:{}});
      if(epoch!==this.epoch)throw failure('LOGIN_CANCELLED','Sign-in was cancelled.',409);
      const result=await client.call('account/login/start',{type:mode});
      if(epoch!==this.epoch)throw failure('LOGIN_CANCELLED','Sign-in was cancelled.',409);
      const url=new URL(mode==='chatgptDeviceCode'?result.verificationUrl:result.authUrl);
      if(url.protocol!=='https:'||url.hostname!=='auth.openai.com')throw Error('Unexpected authentication URL');
      this.login={phase:'pending',mode,authUrl:url.href,...(mode==='chatgptDeviceCode'?{userCode:result.userCode}:{})};this.loginId=result.loginId;
      for(const notice of this.notices.splice(0))await this.completed(notice,epoch);
      return this.snapshot();
    }catch(error){if(epoch===this.epoch)this.login={phase:'failed',mode,message:'Could not start official sign-in. Check the local Codex installation and network, then retry.'};await this.closeClient(client);if(this.client===client)this.client=null;throw error.status?error:failure('LOGIN_FAILED','Could not start official sign-in. Check installation and network.',502);}
  }
  async completed(params,epoch){
    if(epoch!==this.epoch||this.login.phase!=='pending'||params.loginId!==this.loginId)return;
    if(!params.success){this.login={phase:'failed',message:'Official sign-in did not complete. Retry or use a different configuration.'};const client=this.client;this.client=null;await this.closeClient(client);return;}
    this.login={phase:'completing',mode:this.login.mode};
    this.completing=(async()=>{
      try{await this.store.save({id:'codex-account',label:'ChatGPT account',engine:'codex',kind:'chatgpt',activate:true});if(epoch===this.epoch)this.login={phase:'completed'};}
      catch{if(epoch===this.epoch)this.login={phase:'failed',message:'Login finished, but its scheme could not be saved. Reload and choose Use saved account.'};}
      finally{const client=this.client;this.client=null;await this.closeClient(client);}
    })();await this.completing;
  }
  async cancel(){
    if(this.login.phase==='completing'){await this.completing;return this.snapshot();}
    ++this.epoch;const client=this.client;this.client=null;const id=this.loginId;this.loginId=null;this.login={phase:'cancelled'};
    try{if(client&&id)await client.call('account/login/cancel',{loginId:id},5000);}catch{}finally{await this.closeClient(client);}return this.snapshot();
  }
  async close(){await this.cancel();while(this.pendingCloses.size)await Promise.all([...this.pendingCloses]);}
}
