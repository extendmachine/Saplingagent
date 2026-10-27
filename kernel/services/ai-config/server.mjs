import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes,timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { ConfigurationStore,failure } from './store.mjs';
import { AccountSetup } from './auth.mjs';
import { CredentialImport } from './credentials.mjs';
import { ProjectLauncher, prepareSetupUI } from '../../launcher/public.mjs';
import { readMcpAccess, saveMcpAccess, getMcpAccess } from '../../contracts/mcp-access.mjs';
import {readLanguage, writeLanguage} from '../../localization/store.mjs';
import {normalizeLanguage, formatMessage, describeError} from '../../localization/public.mjs';
import {setupMessages} from '../../localization/setup-messages.mjs';
import {wantsConfigurationErrorPage,renderConfigurationError} from './error-page.mjs';
const defaultRoot=fileURLToPath(new URL('../../../',import.meta.url));
export function createConfigurationServer({root=process.env.SEED_ROOT||defaultRoot,assets=path.join(root,'kernel/.cache/setup'),language,authOptions={},importOptions={},onClose,token:providedToken,projectController,onProjectRename,instanceId,beforeClose}={}){
  root=path.resolve(root);
  let store=new ConfigurationStore(root),auth=new AccountSetup(root,store,authOptions),imports=new CredentialImport(store,importOptions);const token=providedToken||randomBytes(32).toString('hex');let closing=false,shutdown,directoryOperation=false,finalizing=false,activeAIRequests=0;const project=projectController||new ProjectLauncher(root);
  const preferredLanguage=req=>normalizeLanguage(language ?? String(req.headers['accept-language']||'').split(',').map(part=>part.trim().split(';')[0]).find(tag=>/^(en|zh)(?:-|$)/i.test(tag)));
  const currentLanguage=req=>readLanguage(root,preferredLanguage(req));
  const languageState=async req=>({language:await currentLanguage(req),supported:['en','zh']});
  const aiRoutes=new Set(['profiles','activate','models','login','credentials/import','mcp']);
  const pendingLogin=()=>['starting','pending','completing'].includes(auth.login.phase);
  const settingsSaved=async()=>{const state=await project.state();return state.settingsSaved===true;};
  const mcpSummary=async()=>{const {revision,enabled,externalOnly,available}=await getMcpAccess(root);return {revision,enabled,externalOnly,available};};
  const configurationState=async(state)=>({...state,login:auth.snapshot(),mcp:await mcpSummary()});
  const accessConfigured=async()=>{if((await store.state()).activeId)return true;const mcp=await readMcpAccess(root);return mcp.enabled&&mcp.externalOnly;};
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
  const send=(res,status,body)=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
  const server=http.createServer(async(req,res)=>{
    try{
      const address=server.address();const host=`127.0.0.1:${address.port}`;const origin=`http://${host}`;
      if(req.headers.host!==host||req.headers.origin&&req.headers.origin!==origin||['cross-site','same-site'].includes(req.headers['sec-fetch-site']))throw failure('CROSS_SITE','Open this configuration page from its local launcher URL.',403);
      const url=new URL(req.url,origin);
      if(req.method==='GET'&&url.pathname==='/health/project-launcher'){
        const state=await project.state();
        return send(res,200,{root:project.root,instanceId,busy:project.busy,...(state.finalization?{finalization:{id:state.finalization.id,phase:state.finalization.phase}}:{})});
      }
      if(url.pathname.startsWith('/api/')){
        const supplied=Buffer.from(String(req.headers['x-sapling-config']||''));const expected=Buffer.from(token);
        if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw failure('UNAUTHORIZED','Reload the local configuration page.',401);
        if(closing||finalizing)throw failure('CLOSING','Configuration is closing or restarting. Wait for the operation to finish.',503);
        if(req.method==='GET'&&['/api/config/state','/api/config/project','/api/config/mcp','/api/config/language'].includes(url.pathname)&&directoryOperation)throw failure('PROJECT_BUSY','Wait for project directory confirmation to finish.',409);
        if(req.method==='GET'&&url.pathname==='/api/config/language')return send(res,200,await languageState(req));
        if(req.method==='GET'&&url.pathname==='/api/config/state')return send(res,200,await configurationState(await store.state()));
        if(req.method==='GET'&&url.pathname==='/api/config/mcp')return send(res,200,await getMcpAccess(root));
        if(req.method==='GET'&&url.pathname==='/api/config/project')return send(res,200,await project.state());
        if(req.method!=='POST')throw failure('NOT_FOUND','Configuration endpoint not found.',404);
        if(req.headers.origin!==origin||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw failure('CROSS_SITE','Use the local configuration page to make changes.',403);
        let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>(['/api/config/project/save','/api/config/project/prepare'].includes(url.pathname)?2*1024*1024:65536))throw failure('BODY_TOO_LARGE','Configuration request is too large.',413);parts.push(chunk);}
        let body;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw failure('INVALID_CONFIG','Invalid configuration JSON.');}
        if(!body||typeof body!=='object'||Array.isArray(body))throw failure('INVALID_CONFIG','Expected a configuration object.');
        if(directoryOperation)throw failure('PROJECT_BUSY','Wait for project directory confirmation to finish.',409);
        const setupPhase=(await project.state()).finalization?.phase;
        if(directoryOperation||finalizing||closing||['waiting-release','restarting'].includes(setupPhase))throw failure('PROJECT_BUSY','Wait for setup to finish saving or restarting before changing settings.',409);
        if(['/api/config/profiles','/api/config/activate','/api/config/credentials/import','/api/config/mcp'].includes(url.pathname)&&pendingLogin())throw failure('LOGIN_BUSY','Finish or cancel the current sign-in before changing schemes.',409);
        if(['/api/config/profiles','/api/config/activate','/api/config/login','/api/config/close','/api/config/mcp'].includes(url.pathname)&&imports.busy)throw failure('IMPORT_BUSY','Wait for credential import to finish.',409);
        if(url.pathname.startsWith('/api/config/project/')){
          if(pendingLogin()||imports.busy)throw failure('LOGIN_BUSY','Finish account configuration before project operations.',409);
          const route=url.pathname.slice('/api/config/project/'.length);
          if(route==='rename')throw failure('PROJECT_FINALIZATION_REQUIRED',project.configurationHost==='external'?'Save project settings, then choose Save & build app to apply the folder name.':'Save project settings, then choose Save settings & restart. The live configuration process cannot rename its own folder.',409);
          if(['save','prepare','finalize'].includes(route)){
            if(activeAIRequests)throw failure('PROJECT_BUSY','Wait for AI configuration requests before saving or restarting.',409);
            directoryOperation=true;
            try{
              await auth.close();
              if(route!=='finalize')return send(res,200,{project:await project.stageSetup(body),root:project.root,renamed:false});
              if(Object.keys(body).length)throw failure('INVALID_CONFIG','Finalization uses the saved settings and accepts an empty object only.');
              if(!await settingsSaved())throw failure('PROJECT_SETTINGS_REQUIRED','Save project settings before finalizing setup.',409);
              if(!await accessConfigured())throw failure('AI_NOT_CONFIGURED','Save and select an AI connection or enable external-only MCP access before finalizing setup.',409);
              const result=await project.finalizeSetup({management:{pid:process.pid,instanceId,port:address.port},language:await currentLanguage(req)});
              if(project.configurationHost==='external')return send(res,202,{job:result});
              const finalization={...Object.fromEntries(['id','phase','targetRoot','previousRoot','readyUrl'].filter(key=>result[key]!==undefined).map(key=>[key,result[key]])),managementPort:address.port};
              finalizing=true;
              send(res,202,{finalization});
              setImmediate(()=>void server.shutdown().catch(()=>{console.error('Configuration shutdown failed. Inspect the setup finalization receipt before retrying.');process.exitCode=1;}));
              return;
            }finally{directoryOperation=false;}
          }
          if(route==='build'){
            if(activeAIRequests)throw failure('PROJECT_BUSY','Wait for AI configuration requests before exporting.',409);
            directoryOperation=true;
            try{
              await auth.close();
              if(project.configurationHost!=='external'&&(await project.state()).exportReady!==true)throw failure('PROJECT_RESTART_REQUIRED','Save settings and wait for the completed restart before exporting your app.',409);
              if(!await accessConfigured())throw failure('AI_NOT_CONFIGURED','Save and select an AI connection or enable external-only MCP access before exporting.',409);
              return send(res,202,{job:await project.build()});
            }finally{directoryOperation=false;}
          }
          if(route==='open')return send(res,202,{job:await project.openProject()});
          if(route==='restart')return send(res,202,await project.restart());
          if(route==='stop')return send(res,200,await project.stop());
          if(route==='reveal')return send(res,200,await project.reveal());
          throw failure('NOT_FOUND','Project endpoint not found.',404);
        }
        if(project.busy)throw failure('PROJECT_BUSY','Wait for the project operation before changing configuration.',409);
        if(url.pathname==='/api/config/language'){
          if(Object.keys(body).length!==1||!['en','zh'].includes(body.language))throw failure('INVALID_LANGUAGE','Choose English or Chinese.');
          activeAIRequests++;
          try{await writeLanguage(root,body.language);return send(res,200,await languageState(req));}
          finally{activeAIRequests--;}
        }
        const aiRoute=url.pathname.slice('/api/config/'.length);
        if(aiRoutes.has(aiRoute)){
          activeAIRequests++;
          try{
            if(!await settingsSaved())throw failure('PROJECT_SETTINGS_REQUIRED','Save project settings before configuring AI.',409);
            if(project.busy)throw failure('PROJECT_BUSY','Wait for the project operation before changing configuration.',409);
            if(aiRoute==='mcp'){await saveMcpAccess(root,body);await project.invalidateSetup();return send(res,200,await getMcpAccess(root));}
            if(aiRoute!=='models')await project.invalidateSetup();
            if(aiRoute==='credentials/import')return send(res,200,await configurationState(await imports.run(body)));
            if(aiRoute==='profiles')return send(res,200,await configurationState(await store.save(body)));
            if(aiRoute==='activate')return send(res,200,await configurationState(await store.activate(body)));
            if(aiRoute==='models')return send(res,200,await store.models(body));
            if(aiRoute==='login')return send(res,200,{login:await auth.begin(body.mode)});
          }finally{activeAIRequests--;}
        }
        if(url.pathname==='/api/config/login/cancel'){activeAIRequests++;try{return send(res,200,{login:await auth.cancel()});}finally{activeAIRequests--;}}
        if(url.pathname==='/api/config/close'&&(project.busy||activeAIRequests))throw failure('PROJECT_BUSY','Wait for project and AI configuration operations before closing setup.',409);
        if(url.pathname==='/api/config/close'){closing=true;try{await auth.close();await prepareClose();}catch(error){closing=false;throw error;}send(res,200,{closed:true,...(project.configurationHost==='external'?{handoff:true}:{})});setImmediate(()=>void server.shutdown());return;}
        throw failure('NOT_FOUND','Configuration endpoint not found.',404);
      }
      if(req.method!=='GET')throw failure('NOT_FOUND','Page not found.',404);
      if(url.pathname==='/help'){
        const {renderHelpPage}=await import('../../localization/help.mjs');
        const selected=url.searchParams.has('lang')?normalizeLanguage(url.searchParams.get('lang')):await currentLanguage(req);
        const nonce=randomBytes(18).toString('base64'),page=renderHelpPage(selected,{endpoint:'/api/config/language',token}).replaceAll('<script>',`<script nonce="${nonce}">`);
        res.writeHead(200,{...headers,'Content-Security-Policy':headers['Content-Security-Policy'].replace("script-src 'self'",`script-src 'self' 'nonce-${nonce}'`),'Content-Type':'text/html; charset=utf-8'});res.end(page);return;
      }
      if(url.pathname==='/project-icon.png'){
        const iconFile=path.join(project.root,'config/project-icon.png');const stat=await fs.lstat(iconFile).catch(()=>null);
        if(!stat?.isFile()||stat.isSymbolicLink()||stat.size>1048576)throw failure('NOT_FOUND','Project icon not found.',404);
        const png=await fs.readFile(iconFile);if(png.length<33||png.toString('hex',0,8)!=='89504e470d0a1a0a')throw failure('NOT_FOUND','Invalid project icon.',404);
        res.writeHead(200,{...headers,'Content-Type':'image/png'});res.end(png);return;
      }
      let file;
      if(url.pathname==='/')file='index.html';
      else if(/^\/assets\/[a-zA-Z0-9_.-]+\.(js|css|woff2|svg)$/.test(url.pathname))file=url.pathname.slice(1);
      else throw failure('NOT_FOUND','Page not found.',404);
      let content;try{content=await fs.readFile(path.join(assets,file));}catch(error){
        if(error.code!=='ENOENT')throw failure('UI_UNREADABLE','Configuration page files cannot be read. Check local file permissions and retry configure.',500);
        if(file!=='index.html')throw failure('UI_ASSET_NOT_FOUND','This configuration resource is unavailable. Reload the configuration page; if it persists, run bash Saplingagent.sh configure.',404);
        throw failure('UI_NOT_BUILT','Configuration page is not built. Run bash Saplingagent.sh configure to prepare it; if preparation fails, run install --repair first.',503);
      }
      if(file==='index.html'){const selected=await currentLanguage(req);content=Buffer.from(content.toString('utf8').replaceAll('__SAPLING_CONFIG_TOKEN__',token).replaceAll('__SAPLING_CONFIG_LANGUAGE__',selected).replaceAll('__SAPLING_CONFIG_TITLE__',formatMessage(setupMessages,selected,'common.setup.title')));}
      res.writeHead(200,{...headers,'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.html')?'text/html; charset=utf-8':'image/svg+xml'});res.end(content);
    }catch(error){
      if(!res.headersSent){
        const safe={code:error.code&&error.status?error.code:'CONFIG_STORAGE_ERROR',message:error.status?error.message:'Unable to read or save local configuration. Check the project files and reload.'};
        const selected=await currentLanguage(req).catch(()=>preferredLanguage(req));
        if(wantsConfigurationErrorPage(req,safe.code)){
          res.writeHead(error.status||500,{...headers,'Content-Type':'text/html; charset=utf-8','Vary':'Accept'});
          res.end(renderConfigurationError(safe,selected));
        }else send(res,error.status||500,{error:{...safe,...describeError(safe,selected)}});
      }else res.end();
    }
  });
  let closePreparation;
  const prepareClose=()=>closePreparation||(closePreparation=Promise.resolve().then(()=>beforeClose?.()).catch(error=>{closePreparation=null;throw error;}));
  server.relocate=async current=>{await auth.close();root=path.resolve(current);store=new ConfigurationStore(root);auth=new AccountSetup(root,store,authOptions);imports=new CredentialImport(store,importOptions);server.configStore=store;server.accountSetup=auth;await onProjectRename?.();};
  server.requestTimeout=90000;server.headersTimeout=10000;
  server.shutdown=()=>shutdown||=(async()=>{closing=true;if(!finalizing)await project.cancel();await auth.close();await prepareClose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await onClose?.();})().catch(error=>{shutdown=null;closing=false;throw error;});
  server.configStore=store;server.accountSetup=auth;server.projectLauncher=project;
  return server;
}
async function openBrowser(url){
  const command=process.platform==='win32'?'powershell.exe':'/usr/bin/open';
  const args=process.platform==='win32'?['-NoLogo','-NoProfile','-Command',`Start-Process '${url}'`]:[url];
  await new Promise(resolve=>{const child=spawn(command,args,{stdio:'ignore',windowsHide:true});child.once('error',resolve);child.once('exit',resolve);});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {openConfiguration}=await import('../../configuration/bootstrap.mjs');
  const root=path.resolve(process.env.SEED_ROOT||defaultRoot);
  const address=await openConfiguration(root,{noOpen:process.argv.includes('--no-open')||process.env.SAPLING_NO_OPEN==='1'});
  console.log(`Project setup: http://127.0.0.1:${address.port}/`);
}
