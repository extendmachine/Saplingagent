import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes,timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { ConfigurationStore,failure } from './store.mjs';
import { AccountSetup } from './auth.mjs';
import { CredentialImport } from './credentials.mjs';
import { ProjectLauncher } from '../../kernel/launcher/public.mjs';
const defaultRoot=fileURLToPath(new URL('../../',import.meta.url));
export function createConfigurationServer({root=process.env.SEED_ROOT||defaultRoot,assets=path.join(root,'.cache/ai-config-ui'),language='en',authOptions={},importOptions={},onClose,token:providedToken,projectController,onProjectRename,instanceId}={}){
  let store=new ConfigurationStore(root),auth=new AccountSetup(root,store,authOptions),imports=new CredentialImport(store,importOptions);const token=providedToken||randomBytes(32).toString('hex');let closing=false,shutdown;const project=projectController||new ProjectLauncher(root);
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
  const send=(res,status,body)=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
  const server=http.createServer(async(req,res)=>{
    try{
      const address=server.address();const host=`127.0.0.1:${address.port}`;const origin=`http://${host}`;
      if(req.headers.host!==host||req.headers.origin&&req.headers.origin!==origin||['cross-site','same-site'].includes(req.headers['sec-fetch-site']))throw failure('CROSS_SITE','Open this configuration page from its local launcher URL.',403);
      const url=new URL(req.url,origin);
      if(req.method==='GET'&&url.pathname==='/health/project-launcher')return send(res,200,{root:project.root,instanceId,busy:project.busy});
      if(url.pathname.startsWith('/api/')){
        const supplied=Buffer.from(String(req.headers['x-sapling-config']||''));const expected=Buffer.from(token);
        if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw failure('UNAUTHORIZED','Reload the local configuration page.',401);
        if(closing)throw failure('CLOSING','Configuration service is closing.',503);
        if(req.method==='GET'&&url.pathname==='/api/config/state'){const login=auth.snapshot();return send(res,200,{...await store.state(),login});}
        if(req.method==='GET'&&url.pathname==='/api/config/project')return send(res,200,await project.state());
        if(req.method!=='POST')throw failure('NOT_FOUND','Configuration endpoint not found.',404);
        if(req.headers.origin!==origin||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw failure('CROSS_SITE','Use the local configuration page to make changes.',403);
        let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>(url.pathname==='/api/config/project/save'?2*1024*1024:65536))throw failure('BODY_TOO_LARGE','Configuration request is too large.',413);parts.push(chunk);}
        let body;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw failure('INVALID_CONFIG','Invalid configuration JSON.');}
        if(!body||typeof body!=='object'||Array.isArray(body))throw failure('INVALID_CONFIG','Expected a configuration object.');
        if(['/api/config/profiles','/api/config/activate','/api/config/credentials/import'].includes(url.pathname)&&['starting','pending','completing'].includes(auth.login.phase))throw failure('LOGIN_BUSY','Finish or cancel the current sign-in before changing schemes.',409);
        if(['/api/config/profiles','/api/config/activate','/api/config/login','/api/config/close'].includes(url.pathname)&&imports.busy)throw failure('IMPORT_BUSY','Wait for credential import to finish.',409);
        if(url.pathname.startsWith('/api/config/project/')){
          if(['starting','pending','completing'].includes(auth.login.phase)||imports.busy)throw failure('LOGIN_BUSY','Finish account configuration before project operations.',409);
          const route=url.pathname.slice('/api/config/project/'.length);
          if(route==='save')return send(res,200,{project:await project.save(body)});
          if(route==='build'){const state=await store.state();if(!state.activeId)throw failure('AI_NOT_CONFIGURED','Save and select an AI connection before compiling.',409);return send(res,202,{job:await project.build()});}
          if(route==='rename'){const previous=project.root;const result=await project.rename(body.folderName);if(result.renamed){await auth.close();root=result.root;assets=path.join(root,path.relative(previous,assets));store=new ConfigurationStore(root);auth=new AccountSetup(root,store,authOptions);imports=new CredentialImport(store,importOptions);server.configStore=store;server.accountSetup=auth;process.env.SEED_ROOT=root;await onProjectRename?.();}return send(res,200,result);}
          if(route==='open')return send(res,202,{job:await project.openProject()});
          if(route==='restart')return send(res,202,await project.restart());
          if(route==='stop')return send(res,200,await project.stop());
          if(route==='reveal')return send(res,200,await project.reveal());
          throw failure('NOT_FOUND','Project endpoint not found.',404);
        }
        if(project.busy&&url.pathname!=='/api/config/models')throw failure('PROJECT_BUSY','Wait for the project operation before changing configuration.',409);
        if(url.pathname==='/api/config/credentials/import')return send(res,200,{...await imports.run(body),login:auth.snapshot()});
        if(url.pathname==='/api/config/profiles')return send(res,200,{...await store.save(body),login:auth.snapshot()});
        if(url.pathname==='/api/config/activate')return send(res,200,{...await store.activate(body),login:auth.snapshot()});
        if(url.pathname==='/api/config/models')return send(res,200,await store.models(body));
        if(url.pathname==='/api/config/login')return send(res,200,{login:await auth.begin(body.mode)});
        if(url.pathname==='/api/config/login/cancel')return send(res,200,{login:await auth.cancel()});
        if(url.pathname==='/api/config/close'&&project.busy)throw failure('PROJECT_BUSY','Wait for the build or app operation before closing setup.',409);
        if(url.pathname==='/api/config/close'){send(res,200,{closed:true});setImmediate(()=>void server.shutdown());return;}
        throw failure('NOT_FOUND','Configuration endpoint not found.',404);
      }
      if(req.method!=='GET')throw failure('NOT_FOUND','Page not found.',404);
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
      let content;try{content=await fs.readFile(path.join(assets,file));}catch{throw failure('UI_NOT_BUILT','Configuration page is not built. Choose Configure AI in Saplingagent.sh after installation.',503);}
      if(file==='index.html')content=Buffer.from(content.toString('utf8').replaceAll('__SAPLING_CONFIG_TOKEN__',token).replaceAll('__SAPLING_CONFIG_LANGUAGE__',language==='zh'?'zh':'en'));
      res.writeHead(200,{...headers,'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.html')?'text/html; charset=utf-8':'image/svg+xml'});res.end(content);
    }catch(error){if(!res.headersSent)send(res,error.status||500,{error:{code:error.code&&error.status?error.code:'CONFIG_STORAGE_ERROR',message:error.status?error.message:'Unable to read or save local configuration. Check the project files and reload.'}});else res.end();}
  });
  server.requestTimeout=90000;server.headersTimeout=10000;
  server.shutdown=()=>shutdown||=(async()=>{closing=true;await project.cancel();await auth.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));onClose?.();})();
  server.configStore=store;server.accountSetup=auth;server.projectLauncher=project;
  return server;
}
async function openBrowser(url){
  const command=process.platform==='win32'?'powershell.exe':'/usr/bin/open';
  const args=process.platform==='win32'?['-NoLogo','-NoProfile','-Command',`Start-Process '${url}'`]:[url];
  await new Promise(resolve=>{const child=spawn(command,args,{stdio:'ignore',windowsHide:true});child.once('error',resolve);child.once('exit',resolve);});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=createConfigurationServer({language:process.env.SAPLING_LANG,onClose:()=>process.exit(0)});
  for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,()=>void server.shutdown());
  server.listen(0,'127.0.0.1',async()=>{const url=`http://127.0.0.1:${server.address().port}/`;console.log(process.env.SAPLING_LANG==='zh'?`AI 配置网页：${url}\n完成后点击“完成配置”，回到脚本启动应用。`:`AI configuration: ${url}\nChoose Finish setup to return to the launcher and start the app.`);if(!process.argv.includes('--no-open'))await openBrowser(url);});
}
