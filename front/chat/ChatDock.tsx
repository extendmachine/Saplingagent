import { useLanguage } from '../localization/LanguageProvider';
import { useRef, useState } from 'react';
import { ChevronRight, MessageSquare } from 'lucide-react';
import { ChatLauncher } from './ChatLauncher';
import { ChatPanel } from './ChatPanel';
import './chat-dock.css';

export function ChatDock() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(true);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  function toggle(expanded: boolean) {
    setOpen(expanded);
    requestAnimationFrame(() => {
      if (expanded) panel.current?.querySelector('textarea')?.focus();
      else launcher.current?.focus();
    });
  }

  return <aside className={`chat-dock${open ? '' : ' is-collapsed'}`} aria-label={t('chat.title')} data-expanded={open}>
    <ChatLauncher visible={!open} onOpen={() => toggle(true)} buttonRef={launcher} />
    <div ref={panel} id="saplingagent-chat-panel" className="chat-dock-surface" hidden={!open}>
      <header className="chat-dock-header">
        <div><MessageSquare size={17} aria-hidden="true" /><h2>{t('chat.title')}</h2></div>
        <button type="button" aria-label={t('chat.collapse')} aria-expanded={open} aria-controls="saplingagent-chat-panel" onClick={() => toggle(false)} title={t('chat.collapse')}><ChevronRight size={18} aria-hidden="true" /></button>
      </header>
      <ChatPanel />
    </div>
  </aside>;
}
