import React, {useEffect,useState,useRef,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {readCredentialFile} from './import-file';
import './styles.css';
import {ErrorNotice, Notice, LanguageSelector, translate, msg, setupError, normalizeLanguage, type Language, type Translation, type Message} from './localization';
import {ProjectSetup, type ProjectSetupState} from './ProjectSetup';
import {configurationClosed} from './setup-flow';
import {McpAccess, type McpAccessHandle, type McpAccessStatus} from './McpAccess';
import {aiConnectionReady, type McpSummary, type McpState} from './mcp-access';
import {blankProfile as blank, changeClaudeAuthentication, changeProfileEngine, canKeepCredential, profilePayload, type Profile} from './profile-draft';
type Login={phase:string;mode?:string;authUrl?:string;userCode?:string;message?:string};
type State={revision:number;activeId:string|null;profiles:Profile[];codex:{saved:boolean;chatgpt:boolean;type:string|null};login:Login;mcp?:McpSummary};
const token=document.querySelector<HTMLMetaElement>('meta[name="config-token"]')?.content||'';
async function request(route:string,body?:unknown){
 const response=await fetch('/api/config/'+route,{method:body===undefined?'GET':'POST',headers:{'X-Sapling-Config':token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error?.message||'Configuration request failed'),{code:value.error?.code});return value;
}
function CredentialButtons({engine,disabled,progress,error,notice,replace,onReplace,onImport,t,language}:{engine:'codex'|'claude';disabled:boolean;progress:'local'|'upload'|null;error:unknown;notice:Message|null;replace:boolean;onReplace:(value:boolean)=>void;onImport:(source:'local'|'upload',file?:File)=>void;t:Translation;language:Language}){
 const picker=useRef<HTMLInputElement>(null);
 return <div className="credential-import">
  <h3>{engine==='codex'?t("setup.use.an.existing.codex.login"):t("setup.import.claude.api.credentials")}</h3>
  <p className="hint">{engine==='codex'?t("setup.read.local.codex.auth.json.or.select"):t("setup.reads.anthropic.api.key.from.the.launcher")}</p>
  <div className="buttons">
   <button type="button" disabled={disabled} onClick={()=>onImport('local')}>{progress==='local'?t("setup.reading.local.credentials"):engine==='codex'?t("setup.use.local.codex.login"):t("setup.import.local.claude.api.credentials")}</button>
   <button type="button" className="quiet" disabled={disabled} onClick={()=>picker.current?.click()}>{progress==='upload'?t("setup.importing.file"):engine==='codex'?t("setup.upload.auth.json"):t("setup.upload.api.credential.json")}</button>
  </div>
  <input ref={picker} type="file" hidden accept=".json,application/json" aria-label={engine==='codex'?t("setup.codex.credential.file"):t("setup.claude.api.credential.file")} disabled={disabled} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)onImport('upload',file);}}/>
  <div className="credential-feedback" aria-live="polite" aria-atomic="true">
   {progress&&<div className="message progress" role="status">{t("setup.importing.credentials.into.this.project.please.wait")}</div>}
   {!!error&&<ErrorNotice issue={error} language={language}/>}
   {notice&&<Notice value={notice} language={language}/>}
  </div>
  <label className="check"><input type="checkbox" checked={replace} disabled={disabled} onChange={event=>onReplace(event.target.checked)}/>{t("setup.replace.existing.credentials.for.this.account.scheme")}</label>
 </div>;
}
function App(){
 const [lang,setLang]=useState<Language>(normalizeLanguage(document.querySelector<HTMLMetaElement>('meta[name="config-language"]')?.content));
 const t=translate(lang);
 const languageEpoch=useRef(0),[languageSaving,setLanguageSaving]=useState(false),[languageError,setLanguageError]=useState<unknown>(null);
 useEffect(()=>{const epoch=languageEpoch.current;void request('language').then(value=>{if(languageEpoch.current===epoch)setLang(normalizeLanguage(value.language));}).catch(issue=>{if(languageEpoch.current===epoch)setLanguageError(issue);});},[]);
 useEffect(()=>{document.documentElement.lang=lang;document.title=t('common.setup.title');},[lang]);
 async function changeLanguage(next:Language){const epoch=++languageEpoch.current;setLang(next);setLanguageSaving(true);setLanguageError(null);try{await request('language',{language:next});}catch(issue){if(languageEpoch.current===epoch){const value=issue as Error&{code?:string};setLanguageError(Object.assign(new Error(value.message||'Language save failed'),{code:value.code,messageKey:'common.language.unsaved'}));}}finally{if(languageEpoch.current===epoch)setLanguageSaving(false);}}
 const [state,setState]=useState<State|null>(null),[draft,setDraft]=useState<Profile>(blank),[key,setKey]=useState(''),[method,setMethod]=useState<'account'|'api'|'mcp'>('account');
 const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState<Message|null>(null),[models,setModels]=useState<{id:string;name:string}[]>([]),[done,setDone]=useState(false);
 const [feedbackTarget,setFeedbackTarget]=useState<'global'|'codex'|'claude'>('global'),[importSource,setImportSource]=useState<'local'|'upload'|null>(null);
 const [replaceCodex,setReplaceCodex]=useState(false),[replaceClaude,setReplaceClaude]=useState(false);
 const [directory,setDirectory]=useState<ProjectSetupState>({ready:false,busy:false,external:false,finishReady:false});
 const [aiDirty,setAIDirty]=useState(false);
 const [mcpStatus,setMcpStatus]=useState<McpAccessStatus>({dirty:false,busy:false}),[mcpLocation,setMcpLocation]=useState('');
 const mcp=useRef<McpAccessHandle>(null);
 const updateMcp=useCallback((value:McpState)=>setState(current=>current&&(!current.mcp||value.revision>=current.mcp.revision)?{...current,mcp:{revision:value.revision,enabled:value.enabled,externalOnly:value.externalOnly,available:value.available}}:current),[]);
 const apiForm=useRef<HTMLFormElement>(null);
 const pending=['starting','pending','completing'].includes(state?.login.phase||'');
 const refresh=async()=>{try{const value=await request('state');setState(value);setError(null);}catch(e){setError(e);}};
 useEffect(()=>{void refresh();},[]);
 useEffect(()=>{if(!pending||done)return;const timer=setInterval(()=>void refresh(),1500);return()=>clearInterval(timer);},[pending,done]);
 const action=async(work:()=>Promise<void>,importTarget?:{engine:'codex'|'claude';source:'local'|'upload'})=>{setFeedbackTarget(importTarget?.engine||'global');setImportSource(importTarget?.source||null);setBusy(true);setError(null);setNotice(null);try{await work();}catch(e){setError(e);}finally{setImportSource(null);setBusy(false);}};
 const update=<K extends keyof Profile>(name:K,value:Profile[K])=>{setDraft(current=>({...current,[name]:value}));if(name==='baseUrl'||name==='protocol'||name==='engine')setModels([]);};
 const clearSecrets=()=>{setKey('');setModels([]);setReplaceClaude(false);setFeedbackTarget('global');setNotice(null);setError(null);};
 const authentication=(kind:'api'|'subscription')=>{clearSecrets();setAIDirty(true);setDraft(current=>changeClaudeAuthentication(current,kind));};
 const edit=(profile:Profile)=>{setAIDirty(false);setKey('');setReplaceClaude(false);setModels([]);setNotice(null);setError(null);setMethod(profile.kind==='chatgpt'?'account':'api');setDraft({...blank(),...profile});};
 const preset=(value:string)=>{setKey('');setReplaceClaude(false);setModels([]);setDraft({...blank(),...({openai:{label:'OpenAI',engine:'codex',protocol:'responses',baseUrl:'https://api.openai.com/v1'},openrouter:{label:'OpenRouter',baseUrl:'https://openrouter.ai/api/v1'},anthropic:{label:'Anthropic',engine:'claude',protocol:'anthropic',baseUrl:'https://api.anthropic.com/v1'},local:{label:t('setup.local.model'),baseUrl:'http://127.0.0.1:11434/v1',noAuth:true}} as Record<string,Partial<Profile>>)[value]});};
 const saveProfile=async()=>{const value=await request('profiles',profilePayload(draft,key,state?.revision));setState(value);const selected=value.profiles.find((p:Profile)=>p.id===value.activeId);if(selected)setDraft({...blank(),...selected});setKey('');setAIDirty(false);setNotice((directory.external ? msg("setup.ai.scheme.saved.choose.save.build.app") : msg("setup.ai.scheme.saved.save.settings.restart.below")));};
 const save=()=>void action(saveProfile);
 const validatePendingSettings=()=>{if(method==='api'&&aiDirty&&!apiForm.current?.reportValidity())throw setupError("setup.complete.the.ai.scheme.fields.before.saving");};
 const savePendingSettings=async()=>{if(method==='api'&&aiDirty)await saveProfile();await mcp.current?.save();};
 const signIn=(mode:string)=>void action(async()=>{const value=await request('login',{mode});setState(current=>current?{...current,login:value.login}:current);if(value.login.authUrl)window.open(value.login.authUrl,'_blank','noopener,noreferrer');});
 const account=()=>void action(async()=>{setState(await request('profiles',{id:'codex-account',engine:'codex',kind:'chatgpt',label:'ChatGPT account',revision:state?.revision,activate:true}));setNotice((directory.external ? msg("setup.saved.account.selected.choose.save.build.app") : msg("setup.saved.account.selected.save.settings.restart.below")));});
 const finish=()=>void action(async()=>{const result=await request('close',{});if(!configurationClosed(result,directory.external))throw setupError("setup.setup.has.not.confirmed.completion.refresh.status");setKey('');setDone(true);});
 const importCredentials=(engine:'codex'|'claude',source:'local'|'upload',file?:File)=>void action(async()=>{
  const json=source==='upload'&&file?await readCredentialFile(file):undefined;
  const value=await request('credentials/import',{engine,source,json,revision:state?.revision,replace:engine==='codex'?replaceCodex:replaceClaude,...(engine==='claude'?{profile:draft}:{})});
  setState(value);setKey('');setAIDirty(false);setReplaceCodex(false);setReplaceClaude(false);setModels([]);
  if(engine==='claude'){const selected=value.profiles.find((p:Profile)=>p.id===value.activeId);if(selected)setDraft({...blank(),...selected});}
  setNotice((directory.external ? msg("setup.credentials.imported.and.selected.network.expiry.and") : msg("setup.credentials.imported.and.selected.network.expiry.and.2")));
 },{engine,source});
 if(done)return <main className="finished"><span className="brand">Saplingagent</span><h1>{(directory.external ? t("setup.setup.complete") : t("setup.setup.closed"))}</h1>{directory.external&&directory.artifact&&<p className="project-path"><strong>{directory.artifact}</strong></p>}<p>{(directory.external ? t("setup.your.settings.and.app.are.saved.in") : t("setup.double.click.your.compiled.launcher.to.open"))}</p>{state?.mcp?.enabled&&state.mcp.externalOnly&&<p>{t("setup.use.your.external.ai.client.with.the")}</p>}</main>;
 return <main className="setup">
  <header><a className="brand" href="/">Saplingagent <span>/ {t("setup.ai.setup")}</span></a><div className="header-actions"><LanguageSelector language={lang} onChange={next=>void changeLanguage(next)} disabled={languageSaving}/><a className="quiet" href={'/help?lang='+lang} target="_blank" rel="noreferrer">{t('common.help')}</a><button className="quiet" onClick={()=>{void refresh();void mcp.current?.refresh();}} disabled={busy||directory.busy||mcpStatus.busy}>{t("setup.refresh.status")}</button><button onClick={finish} disabled={busy||pending||mcpStatus.busy||mcpStatus.dirty||directory.busy||(directory.external&&!directory.finishReady)}>{(directory.external ? t("setup.finish.setup") : t("setup.close.setup"))}</button></div></header>
  <ErrorNotice issue={languageError} language={lang}/>{!!languageError&&<button className="quiet" disabled={languageSaving} onClick={()=>void changeLanguage(lang)}>{t('common.language.retry')}</button>}<section className="intro"><div className="eyebrow">{t("setup.your.project.your.ai")}</div><h1>{t("setup.set.up.your.project")}</h1><p>{(directory.external ? t("setup.use.your.own.account.api.endpoint.or") : t("setup.use.your.own.account.api.endpoint.or.2"))}</p></section>
  {feedbackTarget==='global'&&<>{!!error&&<ErrorNotice issue={error} language={lang}/>}{notice&&<Notice value={notice} language={lang}/>}</>}
  <ProjectSetup request={request} t={t} language={lang} aiReady={aiConnectionReady(state?.activeId,state?.mcp)} aiBusy={busy||pending||mcpStatus.busy} onDirectoryState={setDirectory} onPrepared={refresh} onSaveSettings={savePendingSettings} onValidateSettings={validatePendingSettings} onFinish={finish} aiDirty={(method==='api'&&aiDirty)||mcpStatus.dirty} configurationRevision={`${state?.revision}:${state?.mcp?.revision}`} onLocationChanged={setMcpLocation}>
  <div className="eyebrow">{t("setup.2.connect.your.ai")}</div>
  {!state?<section className="card"><p>{t("setup.reading.local.configuration")}</p><button onClick={()=>void refresh()}>{t("setup.retry")}</button></section>:<div className="layout">
   <aside className="card schemes"><div className="section-heading"><h2>{t("setup.saved.schemes")}</h2><span>{state.profiles.length}</span></div>
    {!state.profiles.length&&<p className="muted">{t("setup.save.a.configuration.to.start.you.can")}</p>}
    {state.profiles.map(profile=><div className={'scheme '+(state.activeId===profile.id?'selected':'')} key={profile.id}><button className="scheme-title" onClick={()=>edit(profile)} disabled={busy||pending}><strong>{profile.label}</strong><span>{profile.engine==='codex'?'Codex':profile.engine==='claude'?'Claude Agent':'OpenCode'}{' · '+(profile.kind==='subscription'?t("setup.subscription.token"):profile.kind==='chatgpt'?t("setup.account"):t("setup.api"))}{profile.kind!=='chatgpt'?' · '+profile.model:''}</span></button><div className="scheme-actions">{state.activeId===profile.id?<span className="badge">{t("setup.default")}</span>:<button className="quiet small" disabled={busy||pending} onClick={()=>void action(async()=>{setState(await request('activate',{id:profile.id,revision:state.revision}));setNotice((directory.external ? msg("setup.default.changed.choose.save.build.app.below") : msg("setup.default.changed.restart.the.app.to.apply")));})}>{t("setup.use")}</button>}<span className="muted small">{profile.kind==='chatgpt'?t("setup.account"):profile.kind==='subscription'?(profile.hasKey?t("setup.token.saved"):t("setup.token.missing")):profile.hasKey?t("setup.key.saved"):profile.noAuth?t("setup.no.key"):t("setup.key.missing")}</span></div></div>)}
    <button className="add" disabled={busy||pending} onClick={()=>{clearSecrets();setMethod('api');setAIDirty(false);setDraft(blank());}}>{t("setup.new.scheme")}</button>
    <p className="note">{t("setup.the.default.applies.on.restart.and.to")}</p>
   </aside>
   <section className="card editor"><div className="tabs"><button className={method==='account'?'active':''} onClick={()=>{clearSecrets();setMethod('account');}} disabled={busy||pending}>{t("setup.chatgpt.account")}</button><button className={method==='api'&&draft.engine!=='claude'?'active':''} onClick={()=>{clearSecrets();setMethod('api');if(draft.kind==='chatgpt'||draft.engine==='claude'){setDraft(blank());setAIDirty(false);}}} disabled={busy||pending}>{t("setup.api.custom.provider")}</button><button className={method==='api'&&draft.engine==='claude'?'active':''} disabled={busy||pending} onClick={()=>{clearSecrets();setMethod('api');setAIDirty(false);setDraft({...blank(),label:'Claude API',engine:'claude',protocol:'anthropic'});}}>{t("setup.claude")}</button><button className={method==='mcp'?'active':''} disabled={busy||pending||mcpStatus.busy} onClick={()=>{clearSecrets();setMethod('mcp');}}>{t("setup.external.ai.mcp")}</button></div>
    {method==='account'?<div className="account-pane"><div className="engine-icon">C</div><h2>{t("setup.sign.in.to.codex")}</h2><p>{t("setup.sign.in.on.the.official.page.with")}</p><div className="account-status"><span className={'dot '+(state.codex.chatgpt?'ready':'')}/>{state.codex.chatgpt?t("setup.chatgpt.credentials.saved.in.this.project"):t("setup.no.chatgpt.account.saved.yet")}</div>
     <CredentialButtons engine="codex" progress={feedbackTarget==='codex'?importSource:null} error={feedbackTarget==='codex'?error:null} notice={feedbackTarget==='codex'?notice:null} disabled={busy||pending} replace={replaceCodex} onReplace={setReplaceCodex} onImport={(source,file)=>importCredentials('codex',source,file)} t={t} language={lang}/>
     <div className="buttons">{state.codex.chatgpt&&<button disabled={busy||pending} onClick={account}>{t("setup.use.saved.account")}</button>}<button disabled={busy||pending} onClick={()=>signIn('chatgpt')}>{state.codex.chatgpt?t("setup.sign.in.again"):t("setup.sign.in.with.chatgpt")}</button><button className="quiet" disabled={busy||pending} onClick={()=>signIn('chatgptDeviceCode')}>{t("setup.use.device.code")}</button></div>
     {pending&&<div className="login-box" aria-live="polite"><p>{t("setup.complete.sign.in.in.the.official.browser")}</p>{state.login.userCode&&<p>{t("setup.one.time.code")} <code>{state.login.userCode}</code></p>}{state.login.authUrl&&<a className="link-button" href={state.login.authUrl} target="_blank" rel="noopener noreferrer">{t("setup.open.sign.in.page")}</a>}<button className="quiet" disabled={busy} onClick={()=>void action(async()=>{await request('login/cancel',{});await refresh();})}>{t("setup.cancel.sign.in")}</button></div>}
     {state.login.phase==='completed'&&<div className="message success">{t("setup.sign.in.complete.codex.is.now.the")}</div>}{state.login.phase==='failed'&&<ErrorNotice issue={state.login} language={lang}/>}
     <p className="note">{t("setup.account.access.model.availability.and.usage.limits")}</p>
    </div>:method==='api'?<form ref={apiForm} onChange={()=>setAIDirty(true)} onSubmit={event=>{event.preventDefault();save();}}>
     {draft.engine==='claude'&&<div className="buttons" role="radiogroup" aria-label={t("setup.claude.authentication")}><button type="button" role="radio" aria-checked={draft.kind==='api'} className={draft.kind==='api'?'':'quiet'} disabled={busy||pending} onClick={()=>authentication('api')}>{t("setup.api.key")}</button><button type="button" role="radio" aria-checked={draft.kind==='subscription'} className={draft.kind==='subscription'?'':'quiet'} disabled={busy||pending} onClick={()=>authentication('subscription')}>{t("setup.subscription.token.personal.use")}</button></div>}
     {draft.engine==='claude'&&draft.kind==='api'&&<CredentialButtons engine="claude" progress={feedbackTarget==='claude'?importSource:null} error={feedbackTarget==='claude'?error:null} notice={feedbackTarget==='claude'?notice:null} disabled={busy||pending||draft.noAuth} replace={replaceClaude} onReplace={setReplaceClaude} onImport={(source,file)=>importCredentials('claude',source,file)} t={t} language={lang}/>}
     <div className="section-heading"><div><h2>{draft.id?t("setup.edit.scheme"):t("setup.create.a.scheme")}</h2><p className="muted">{draft.kind==='subscription'?t("setup.use.a.token.generated.for.your.own"):t("setup.use.the.provider.s.api.url.not")}</p></div></div>
     {draft.kind==='subscription'?<>
      <label>{t("setup.scheme.name")}<input required maxLength={80} value={draft.label} onChange={event=>update('label',event.target.value)} disabled={busy}/></label>
      <label>{t("setup.subscription.token")}<input type="password" autoComplete="new-password" required={!canKeepCredential(draft)} value={key} onChange={event=>setKey(event.target.value)} disabled={busy} placeholder={canKeepCredential(draft)?t("setup.saved.leave.blank.to.keep"):t("setup.paste.your.own.setup.token.output")}/><span className="hint">{t("setup.run.claude.setup.token.in.your.own")}</span></label>
      <label>{t("setup.model.id")}<input required value={draft.model} onChange={event=>update('model',event.target.value)} disabled={busy} placeholder={t("setup.claude.model.id.or.alias.for.example")}/></label>
      <p className="note">{t("setup.for.the.account.owner.s.personal.use")} <a href="https://code.claude.com/docs/en/authentication#generate-a-long-lived-token" target="_blank" rel="noreferrer">{t("setup.official.token.guide")}</a></p>
     </>:<>
     <label>{t("setup.start.from")}<select defaultValue="custom" onChange={event=>preset(event.target.value)} disabled={busy}><option value="custom">{t("setup.custom.provider")}</option><option value="openai">OpenAI · Responses</option><option value="openrouter">OpenRouter · Chat Completions</option><option value="anthropic">Anthropic · Messages</option><option value="local">{t("setup.local.ollama.compatible")}</option></select></label>
     <label>{t("setup.scheme.name")}<input required maxLength={80} placeholder={t("setup.my.provider")} value={draft.label} onChange={event=>update('label',event.target.value)} disabled={busy}/></label>
     <div className="two"><label>{t("setup.agent.engine")}<select value={draft.engine} disabled={busy} onChange={event=>{clearSecrets();setAIDirty(true);setDraft(current=>changeProfileEngine(current,event.target.value as Profile['engine']));}}><option value="opencode">OpenCode</option><option value="codex">Codex App Server</option><option value="claude">Claude Agent</option></select></label><label>{t("setup.api.protocol")}<select value={draft.protocol} disabled={busy||draft.engine!=='opencode'} onChange={event=>update('protocol',event.target.value as Profile['protocol'])}><option value="chat">OpenAI Chat Completions</option><option value="responses">OpenAI Responses</option><option value="anthropic">Anthropic Messages</option></select></label></div>
     <label>{t("setup.api.base.url")}<input type="url" required placeholder="https://api.example.com/v1" value={draft.baseUrl} onChange={event=>update('baseUrl',event.target.value)} disabled={busy}/><span className="hint">{t("setup.for.example.https.api.example.com.v1")}</span></label>
     <label>{t("setup.api.key")}<input type="password" autoComplete="new-password" required={!draft.noAuth&&!canKeepCredential(draft)} value={key} onChange={event=>setKey(event.target.value)} disabled={busy||draft.noAuth} placeholder={canKeepCredential(draft)?t("setup.saved.leave.blank.to.keep"):t("setup.paste.your.api.key")}/><span className="hint">{t("setup.saved.locally.and.never.returned.to.this")}</span></label>
     <label className="check"><input type="checkbox" checked={draft.noAuth} onChange={event=>{update('noAuth',event.target.checked);setKey('');}} disabled={busy}/>{t("setup.this.endpoint.does.not.require.an.api")}</label>
     {draft.engine==='claude'&&<p className="note">{t("setup.claude.agent.uses.your.anthropic.api.key")} <a href="https://platform.claude.com" target="_blank" rel="noreferrer">{t('setup.anthropic.console')}</a></p>}
     <label>{t("setup.model.id")}<div className="input-action"><input required list="available-models" placeholder={t("setup.exact.provider.model.id")} value={draft.model} onChange={event=>update('model',event.target.value)} disabled={busy}/><button type="button" className="quiet" disabled={busy||!draft.baseUrl||!draft.label} onClick={()=>void action(async()=>{const value=await request('models',{...draft,apiKey:key});setModels(value.models);setNotice(msg("setup.found.value1.models.select.one.or.enter", {value1:value.models.length}));})}>{t("setup.fetch.models")}</button></div><datalist id="available-models">{models.map(model=><option key={model.id} value={model.id}>{model.name}</option>)}</datalist><span className="hint">{t("setup.discovery.is.optional.use.a.model.with")}</span></label>
     {draft.engine==='opencode'&&<details><summary>{t("setup.model.limits")}</summary><div className="two"><label>{t("setup.context.tokens")}<input type="number" min={4096} max={4000000} value={draft.contextWindow} onChange={event=>update('contextWindow',Number(event.target.value))}/></label><label>{t("setup.maximum.output.tokens")}<input type="number" min={1} max={draft.contextWindow} value={draft.maxOutput} onChange={event=>update('maxOutput',Number(event.target.value))}/></label></div><p className="hint">{t("setup.match.the.limits.declared.by.your.provider")}</p></details>}
     </>}
     <div className="form-footer"><button type="submit" disabled={busy||pending}>{busy?t("setup.working"):t("setup.save.use")}</button><span className="hint">{t("setup.saves.configuration.only.no.prompt.is.sent")}</span></div>
    </form>:null}
    <div hidden={method!=='mcp'}><McpAccess ref={mcp} request={request} t={t} language={lang} disabled={busy||pending||directory.busy} refreshKey={mcpLocation} onSaved={updateMcp} onStatus={setMcpStatus}/></div>
   </section>
  </div>}
  </ProjectSetup>
  <footer>{(directory.external ? t("setup.finish.changes.save.build.app.wait.for") : t("setup.finish.changes.save.settings.restart.wait.for"))}</footer>
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
