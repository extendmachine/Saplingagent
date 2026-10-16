import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import './chat-dock.css';

export function ChatDock() {
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

  return <aside className={`chat-dock${open ? '' : ' is-collapsed'}`} aria-label="AI chat" data-expanded={open}>
    <button ref={launcher} type="button" className="chat-dock-launcher" hidden={open} aria-label="Open AI chat" aria-expanded={open} aria-controls="saplingagent-chat-panel" onClick={() => toggle(true)}>
      <MessageSquare size={17} aria-hidden="true" /><span>AI chat</span><ChevronLeft size={14} aria-hidden="true" />
    </button>
    <div ref={panel} id="saplingagent-chat-panel" className="chat-dock-surface" hidden={!open}>
      <header className="chat-dock-header">
        <div><MessageSquare size={17} aria-hidden="true" /><h2>AI chat</h2></div>
        <button type="button" aria-label="Collapse chat" aria-expanded={open} aria-controls="saplingagent-chat-panel" onClick={() => toggle(false)} title="Collapse chat"><ChevronRight size={18} aria-hidden="true" /></button>
      </header>
      <ChatPanel />
    </div>
  </aside>;
}
