import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, CircleHelp, FileCode2, FileText, Folder, FolderGit2, GitBranch, GitFork as Github, Layers3, Leaf, LockKeyhole, MonitorPlay, Package, Plus, Rocket, ScanText, ShieldCheck, Sparkles, Sprout, X } from 'lucide-react';
import { useLanguage } from '../../localization/LanguageProvider';
import { exampleUrl, featureIds, parseRepository, projectPaths, selectFeature, type FeatureId, type Repository } from './model';
import { workflowText, type WorkflowMessageKey } from './messages';
import './workflow.css';

const stepKeys = ['step0', 'step1', 'step2', 'step3', 'step4'] as const;
const stepIcons = [Github, ScanText, Layers3, Sprout, Rocket];
const tabs = ['summary', 'license', 'tree', 'dependencies', 'issues'] as const;
type Tab = typeof tabs[number];
type ReviewState = 'ready' | 'private' | 'missing' | 'license' | 'unsupported';
const stateKeys = { ready: 'stateReady', private: 'statePrivate', missing: 'stateMissing', license: 'stateLicense', unsupported: 'stateUnsupported' } as const;
const featureIcons = { core: Layers3, templates: FileCode2, preview: MonitorPlay, export: ArrowDownToLine };
const genericKeys = { core: 'genericCore', templates: 'genericTemplates', preview: 'genericPreview', export: 'genericExport' } as const;

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`gw-panel ${className}`}>{children}</section>;
}

export function GitHubWorkflow() {
  const { language } = useLanguage();
  const t = (key: WorkflowMessageKey) => workflowText(language, key);
  const [step, setStep] = useState(0);
  const [unlocked, setUnlocked] = useState(0);
  const [input, setInput] = useState('');
  const [repository, setRepository] = useState<Repository | null>(null);
  const [sample, setSample] = useState(false);
  const [inputError, setInputError] = useState(false);
  const [tab, setTab] = useState<Tab>('summary');
  const [reviewState, setReviewState] = useState<ReviewState>('ready');
  const [selected, setSelected] = useState<FeatureId[]>(['core', 'preview']);
  const [name, setName] = useState('');
  const [improvements, setImprovements] = useState('');
  const [delivery, setDelivery] = useState(false);
  const [destination, setDestination] = useState('');
  const [destinationError, setDestinationError] = useState<'invalid' | 'same' | null>(null);
  const [modal, setModal] = useState<'flow' | 'reset' | 'publish' | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const paths = repository ? projectPaths(repository) : null;
  const parsedInput = parseRepository(input);
  const parsedDestination = parseRepository(destination);
  const featureName = (id: FeatureId) => t(sample ? id : genericKeys[id]);
  const blocked = reviewState !== 'ready';

  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
    if (!modal && dialog.current?.open) dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    document.querySelector('.application-content')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [step]);

  function go(next: number) {
    setUnlocked(current => Math.max(current, next));
    setStep(next);
  }
  function start(value: string, isSample: boolean) {
    const repo = parseRepository(value);
    if (!repo) { setInputError(true); return; }
    setRepository(repo); setInput(value); setSample(isSample); setInputError(false);
    setReviewState('ready'); setTab('summary'); setSelected(['core', 'preview']);
    setName(repo.name); setImprovements(''); setDestination(''); setDelivery(false);
    setUnlocked(1); setStep(1);
  }
  function invalidatePlan() {
    setUnlocked(2); setDelivery(false); setDestinationError(null);
  }
  function reset() {
    setStep(0); setUnlocked(0); setRepository(null); setInput(''); setName('');
    setSelected(['core', 'preview']); setImprovements(''); setDestination('');
    setInputError(false); setDestinationError(null); setDelivery(false); setModal(null);
  }
  function reviewPublication(event: FormEvent) {
    event.preventDefault();
    if (!parsedDestination) { setDestinationError('invalid'); return; }
    if (parsedDestination.url.toLowerCase() === repository?.url.toLowerCase()) { setDestinationError('same'); return; }
    setDestinationError(null); setModal('publish');
  }
  const pageTitle = (['title', 'analysisTitle', 'featuresTitle', 'buildTitle', 'publishTitle'] as const)[step];
  const pageDescription = (['intro', 'analysisDesc', 'featuresDesc', 'buildDesc', 'publishDesc'] as const)[step];

  return <div className="gw-wrap"><div className="gw-workspace">
    <div className="gw-topline">
      <div className="gw-breadcrumb"><FolderGit2 size={16} /><span>{t('workspace')}</span><ChevronRight size={13} /><strong>{step === 0 ? t('newProject') : repository?.name}</strong></div>
      <div className="gw-top-actions"><button className="gw-text-button gw-mobile-new" type="button" onClick={() => repository ? setModal('reset') : heading.current?.focus()}><Plus size={15} />{t('newProject')}</button><button className="gw-text-button" type="button" onClick={() => setModal('flow')}><CircleHelp size={15} />{t('flow')}</button></div>
    </div>
    <div className="gw-layout">
      <aside className="gw-sidebar" aria-label={t('workspace')}>
        <button type="button" className="gw-new" onClick={() => repository ? setModal('reset') : heading.current?.focus()}><Plus size={16} />{t('newProject')}</button>
        <p className="gw-section-label">{t('saved')}</p>
        <div className="gw-project"><span className="gw-project-icon"><FolderGit2 size={19} /></span><div><strong>{repository?.name || 'Saplingagent'}</strong><small>{repository?.owner || t('noProject')}</small></div></div>
        <nav className="gw-steps" aria-label={t('flow')}>
          {stepKeys.map((key, index) => { const Icon = stepIcons[index]; return <button key={key} type="button" className={`gw-step ${index === step ? 'is-active' : ''}`} disabled={index > unlocked} aria-current={index === step ? 'step' : undefined} onClick={() => setStep(index)}><span className="gw-step-number">{index < step ? <Check size={12} /> : String(index + 1).padStart(2, '0')}</span><Icon size={16} /><span>{t(key)}</span>{index === step && <span className="gw-active-dot" />}</button>; })}
        </nav>
        <div className="gw-local"><Leaf size={23} /><strong>{t('local')}</strong><p>{t('localNote')}</p><span><span className="gw-dot" />{t('inside')}</span></div>
      </aside>
      <div className="gw-main">
        <div className="gw-page-heading"><div className="gw-eyebrow"><span className="gw-dot" />{step === 0 ? t('eyebrow') : `${String(step + 1).padStart(2, '0')} / 05 · ${t(stepKeys[step])}`}</div><h1 ref={heading} tabIndex={-1}>{t(pageTitle)}</h1><p>{t(pageDescription)}</p></div>
        <div className="gw-prototype"><span className="gw-pill"><span className="gw-dot" />{t('prototype')}</span><span>{t('prototypeNote')}</span></div>

        {step === 0 && <>
          <Panel className="gw-import">
            <span className="gw-github"><Github size={27} /></span>
            <h2>{t('sourceTitle')}</h2><p>{t('sourceDesc')}</p>
            <form onSubmit={event => { event.preventDefault(); start(input, input.trim().replace(/\/$/, '') === exampleUrl); }} noValidate>
              <label htmlFor="gw-source">{t('sourceLabel')}</label>
              <div className={`gw-url-field ${inputError ? 'has-error' : ''}`}><Github size={18} /><input id="gw-source" value={input} onChange={event => { setInput(event.target.value); setInputError(false); }} placeholder="https://github.com/owner/repository" spellCheck={false} autoComplete="off" aria-invalid={inputError} aria-describedby={inputError ? 'gw-source-error' : 'gw-source-hint'} /><span className="gw-input-key">↵</span></div>
              {inputError ? <p id="gw-source-error" className="gw-error" role="alert">{t('sourceError')}</p> : <p id="gw-source-hint" className="gw-field-hint">{t('sourceHint')}</p>}
              <button type="submit" className="gw-primary gw-import-button"><Sparkles size={16} />{t('analyze')}<ArrowRight size={16} /></button>
            </form>
            <div className="gw-path"><Folder size={16} /><div><small>{t('destination')}</small><code>{parsedInput ? `${projectPaths(parsedInput).root}/` : t('pathEmpty')}</code></div><LockKeyhole size={15} /></div>
          </Panel>
          <button type="button" className="gw-example" onClick={() => start(exampleUrl, true)}><span className="gw-example-icon"><MonitorPlay size={22} /></span><span><small>{t('sampleLabel')}</small><strong>{t('example')}</strong><span>{t('sampleDesc')}</span></span><ArrowUpRight size={20} /></button>
          <div className="gw-principles">{(['how1', 'how2', 'how3'] as const).map((key, i) => <div key={key}><span>0{i + 1}</span><h3>{t(key)}</h3><p>{t(`${key}Desc`)}</p></div>)}</div>
        </>}

        {step === 1 && <>
          <div className="gw-repo-strip"><Github size={20} /><div><strong>{repository?.owner} / {repository?.name}</strong><small>{t('fixture')}</small></div><span className="gw-tag">{t('prototype')}</span></div>
          <div className="gw-analysis-pipeline">{(['downloadSource', 'readSource', 'extractFeatures'] as const).map((key, index) => <div key={key}><span>{index + 1}</span><strong>{t(key)}</strong><small>{t('notConnected')}</small></div>)}</div>
          <p className="gw-source-path"><Folder size={13} /><span>{t('destination')} · <code>{paths?.source}</code></span></p>
          <div className="gw-review-state"><label htmlFor="gw-review-state">{t('inspect')}</label><select id="gw-review-state" value={reviewState} onChange={event => { setReviewState(event.target.value as ReviewState); setUnlocked(1); setDelivery(false); }}>{Object.entries(stateKeys).map(([value, key]) => <option value={value} key={value}>{t(key)}</option>)}</select></div>
          {blocked && <div className="gw-warning" role="status"><CircleHelp size={18} /><div><strong>{t(stateKeys[reviewState])}</strong><p>{t(({ private: 'privateNote', missing: 'missingNote', license: 'licenseNote', unsupported: 'unsupportedNote' } as const)[reviewState as Exclude<ReviewState, 'ready'>])}</p></div></div>}
          <Panel className="gw-analysis">
            <div className="gw-tabs" role="tablist" aria-label={t('reviewLabel')}>{tabs.map((key, index) => <button id={`gw-tab-${key}`} type="button" role="tab" tabIndex={tab === key ? 0 : -1} aria-selected={tab === key} aria-controls={`gw-panel-${key}`} key={key} onClick={() => setTab(key)} onKeyDown={event => { const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0; if (offset || event.key === 'Home' || event.key === 'End') { event.preventDefault(); const target = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length]; setTab(target); document.getElementById(`gw-tab-${target}`)?.focus(); } }}>{t(key)}</button>)}</div>
            <div className="gw-tab-content" id={`gw-panel-${tab}`} role="tabpanel" aria-labelledby={`gw-tab-${tab}`}>
              {tab === 'summary' && <><span className="gw-soft-icon"><ScanText size={23} /></span><h2>{t('summaryHeading')}</h2><p className="gw-body-text">{t(sample ? 'summaryVideo' : 'summaryGeneric')}</p><div className="gw-mini-label">{t('capability')}</div><div className="gw-capabilities">{featureIds.map(id => <span key={id}><Check size={13} />{featureName(id)}</span>)}</div><div className="gw-analysis-facts"><div><small>{t('stack')}</small><strong>{sample ? 'HTML · TypeScript · FFmpeg' : '—'}</strong></div><div><small>{t('effort')}</small><p>{t('effortDesc')}</p></div></div></>}
              {tab === 'license' && <><span className="gw-soft-icon"><ShieldCheck size={23} /></span><h2>{t('licenseHeading')}</h2><span className="gw-tag gw-tag-amber">{t('licensePending')}</span><p className="gw-body-text">{t('licenseDesc')}</p><pre className="gw-code">{t('licensePlaceholder')}</pre></>}
              {tab === 'tree' && <><h2>{t('tree')}</h2><p className="gw-body-text">{t('treeDesc')}</p><pre className="gw-code">{`${repository?.name}/\n├── README.md\n├── LICENSE\n├── package.json\n├── src/\n│   ├── core/\n│   └── components/\n├── examples/\n└── tests/`}</pre></>}
              {tab === 'dependencies' && <><h2>{t('dependencies')}</h2><p className="gw-body-text">{t('depDesc')}</p><div className="gw-table-scroll"><table><thead><tr><th>{t('depName')}</th><th>{t('depPurpose')}</th><th>{t('depStatus')}</th></tr></thead><tbody>{(['Node.js', 'FFmpeg', 'Browser runtime']).map((dep, i) => <tr key={dep}><td><Package size={14} />{dep}</td><td>{t((['runtime', 'media', 'browser'] as const)[i])}</td><td>{t('pending')}</td></tr>)}</tbody></table></div></>}
              {tab === 'issues' && <><h2>{t('issues')}</h2><p className="gw-body-text">{t('issuesDesc')}</p>{(['issue1', 'issue2'] as const).map(key => <div className="gw-issue" key={key}><CircleHelp size={17} /><div><strong>{t(key)}</strong><small>{t('issueTag')}</small></div></div>)}</>}
            </div>
          </Panel>
          <div className="gw-footer"><button className="gw-secondary" type="button" onClick={() => setStep(0)}><ChevronLeft size={15} />{t('change')}</button><button className="gw-primary" type="button" disabled={blocked} onClick={() => go(2)}>{t('select')}<ArrowRight size={16} /></button></div>
        </>}

        {step === 2 && <>
          <p className="gw-inline-note"><CircleHelp size={14} />{t('exampleFeatures')}</p>
          <div className="gw-feature-grid">{featureIds.map(id => { const Icon = featureIcons[id]; const checked = selected.includes(id); return <label key={id} className={`gw-feature ${checked ? 'is-selected' : ''}`}><input type="checkbox" checked={checked} onChange={() => { setSelected(current => selectFeature(current, id)); invalidatePlan(); }} /><span className="gw-feature-top"><span className="gw-soft-icon"><Icon size={23} /></span><span className="gw-checkbox">{checked && <Check size={13} />}</span></span><strong>{featureName(id)}</strong><p>{t(sample ? `${id}Desc` as WorkflowMessageKey : 'genericDesc')}</p><span className="gw-feature-meta">{id === 'core' ? t('suggested') : id === 'preview' || id === 'export' ? t(sample ? 'requiresCore' : 'requiresGenericCore') : <FileCode2 size={14} />}</span></label>; })}</div>
          <Panel className="gw-configuration"><label htmlFor="gw-name">{t('applicationName')}</label><input id="gw-name" maxLength={80} value={name} placeholder={t('namePlaceholder')} onChange={event => { setName(event.target.value); invalidatePlan(); }} /><label htmlFor="gw-improvements">{t('improvements')}</label><textarea id="gw-improvements" rows={3} maxLength={2000} value={improvements} placeholder={t('improvementsPlaceholder')} onChange={event => { setImprovements(event.target.value); invalidatePlan(); }} /><p className="gw-field-hint">{t('selectionNote')}</p></Panel>
          <div className="gw-footer"><button className="gw-secondary" type="button" onClick={() => setStep(1)}><ChevronLeft size={15} />{t('back')}</button><div className="gw-footer-right"><span>{selected.length} / 4 {t('selected')}</span><button className="gw-primary" type="button" disabled={!selected.length || !name.trim()} title={!selected.length || !name.trim() ? t('noSelection') : undefined} onClick={() => go(3)}>{t('planButton')}<ArrowRight size={16} /></button></div></div>
        </>}

        {step === 3 && <>
          <Panel className="gw-plan"><div className="gw-plan-title"><span className="gw-app-icon"><Sprout size={29} /></span><div><small>{t('plan')}</small><h2>{name}</h2></div><span className="gw-tag">{t('prototype')}</span></div><div className="gw-plan-section"><h3>{t('adapted')}</h3><div className="gw-capabilities">{selected.map(id => <span key={id}><Check size={13} />{featureName(id)}</span>)}</div>{improvements.trim() && <blockquote>{improvements}</blockquote>}</div><div className="gw-plan-section"><h3>{t('baseline')}</h3><p>{t('baselineDesc')}</p></div><div className="gw-plan-paths"><div><FolderGit2 size={17} /><span><small>{t('sourceLocation')}</small><code>{paths?.source}</code></span></div><div><Sprout size={18} /><span><small>{t('outputLocation')}</small><code>{paths?.output}</code></span></div></div><p className="gw-field-hint">{t('pathNote')}</p><div className="gw-plan-section"><h3>{t('verify')}</h3>{(['verify1', 'verify2', 'verify3'] as const).map((key, i) => <div className="gw-check-row" key={key}><span>{i + 1}</span><p>{t(key)}</p><small>{t('pending')}</small></div>)}</div></Panel>
          {!delivery ? <div className="gw-footer"><button className="gw-secondary" type="button" onClick={() => setStep(2)}><ChevronLeft size={15} />{t('back')}</button><button className="gw-primary" type="button" onClick={() => setDelivery(true)}><MonitorPlay size={16} />{t('previewResult')}</button></div> : <><Panel className="gw-delivery"><span className="gw-tag">{t('resultSample')}</span><div className="gw-delivery-placeholder"><MonitorPlay size={32} /><h3>{t('prototypeApp')}</h3><p>{t('prototypeAppDesc')}</p></div><div className="gw-delivery-status"><span>{t('generatedPending')}</span><span>{t('testsPending')}</span></div></Panel><div className="gw-footer"><button className="gw-secondary" type="button" onClick={() => setStep(2)}><ChevronLeft size={15} />{t('back')}</button><button className="gw-primary" type="button" onClick={() => go(4)}>{t('preparePublish')}<ArrowRight size={16} /></button></div></>}
        </>}

        {step === 4 && <>
          <Panel className="gw-publish"><span className="gw-github"><Github size={26} /></span><h2>{t('targetLabel')}</h2><form onSubmit={reviewPublication} noValidate><label htmlFor="gw-target">{t('sourceLabel')}</label><div className={`gw-url-field ${destinationError ? 'has-error' : ''}`}><Github size={18} /><input id="gw-target" value={destination} onChange={event => { setDestination(event.target.value); setDestinationError(null); }} placeholder="https://github.com/your-name/your-application" spellCheck={false} autoComplete="off" aria-invalid={Boolean(destinationError)} aria-describedby="gw-target-hint" /></div><p id="gw-target-hint" className={destinationError ? 'gw-error' : 'gw-field-hint'} role={destinationError ? 'alert' : undefined}>{destinationError ? t(destinationError === 'same' ? 'sameRepo' : 'sourceError') : t('targetHint')}</p><div className="gw-plan-section"><h3>{t('publishReview')}</h3>{(['publishCode', 'publishDocs', 'publishLicense', 'publishExclude'] as const).map(key => <div className="gw-publish-row" key={key}><FileText size={16} /><span>{t(key)}</span><span className="gw-tag">{t('pending')}</span></div>)}</div><div className="gw-publish-metadata"><div><span>{t('target')}</span><code>{parsedDestination ? `${parsedDestination.owner}/${parsedDestination.name}` : '—'}</code></div><div><span>{t('access')}</span><span>{t('pending')}</span></div><div><span>{t('commit')}</span><span>{t('notGenerated')}</span></div></div><div className="gw-footer"><button className="gw-secondary" type="button" onClick={() => setStep(3)}><ChevronLeft size={15} />{t('back')}</button><button className="gw-primary" type="submit">{t('reviewTarget')}<ArrowRight size={16} /></button></div></form></Panel>
        </>}
        <div className="gw-bottom-note"><GitBranch size={13} /><span>{t('untouched')}</span><span>·</span><span>{t('prototype')}</span></div>
      </div>
    </div>
    <dialog ref={dialog} className="gw-dialog" aria-labelledby="gw-dialog-title" onCancel={() => setModal(null)} onClose={() => setModal(null)}>
      <button className="gw-dialog-close" type="button" aria-label={t('close')} onClick={() => setModal(null)}><X size={19} /></button>
      <span className="gw-soft-icon">{modal === 'publish' ? <Rocket size={24} /> : modal === 'reset' ? <Plus size={24} /> : <Sprout size={24} />}</span>
      <h2 id="gw-dialog-title">{t(modal === 'publish' ? 'publishSample' : modal === 'reset' ? 'resetTitle' : 'flowTitle')}</h2>
      <p>{t(modal === 'publish' ? 'publishSampleDesc' : modal === 'reset' ? 'resetDesc' : 'flowDesc')}</p>
      {modal === 'flow' && <><ol className="gw-flow-list">{stepKeys.map((key, i) => <li key={key}><span>{i + 1}</span>{t(key)}</li>)}</ol><p className="gw-field-hint">{t('failureNote')}</p></>}
      {modal === 'publish' && <><div className="gw-dialog-target"><Github size={18} /><code>{parsedDestination?.owner}/{parsedDestination?.name}</code></div><button className="gw-primary" type="button" disabled><LockKeyhole size={15} />{t('uploadDisabled')}</button></>}
      <div className="gw-dialog-actions">{modal === 'reset' ? <><button className="gw-secondary" type="button" onClick={() => setModal(null)}>{t('cancel')}</button><button className="gw-primary" type="button" onClick={reset}>{t('reset')}</button></> : <button className="gw-secondary" type="button" onClick={() => setModal(null)}>{t(modal === 'publish' ? 'finish' : 'close')}</button>}</div>
    </dialog>
  </div></div>;
}
