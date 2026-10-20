import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { ChevronLeft, MessageSquare } from 'lucide-react';
import { CHAT_LAUNCHER_KEY, clampChatLauncherTop, readChatLauncherTop } from './chat-launcher';

export function ChatLauncher({ visible, onOpen, buttonRef }: { visible: boolean; onOpen: () => void; buttonRef: RefObject<HTMLButtonElement | null> }) {
  const [top, setTop] = useState<number | null>(() => { try { return readChatLauncherTop(window.localStorage, window.innerHeight); } catch { return null; } });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; y: number; top: number; last: number; moved: boolean } | null>(null), suppressClick = useRef(false);
  const move = (value: number) => { const next = clampChatLauncherTop(value, window.innerHeight); setTop(next); return next; };
  const save = (value: number) => { try { localStorage.setItem(CHAT_LAUNCHER_KEY, String(Math.round(value))); } catch { /* optional preference */ } };
  function start(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const position = event.currentTarget.getBoundingClientRect().top;
    drag.current = { id: event.pointerId, y: event.clientY, top: position, last: position, moved: false }; suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
  }
  function moving(event: PointerEvent<HTMLButtonElement>) {
    const state = drag.current; if (!state || state.id !== event.pointerId) return;
    const delta = event.clientY - state.y;
    if (Math.abs(delta) > 3) state.moved = true;
    if (state.moved) state.last = move(state.top + delta);
  }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    const state = drag.current; if (!state || state.id !== event.pointerId) return;
    suppressClick.current = state.moved || event.type === 'pointercancel';
    if (state.moved) save(state.last);
    drag.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) { suppressClick.current = false; return; }
    event.preventDefault(); save(move(event.currentTarget.getBoundingClientRect().top + (event.key === 'ArrowUp' ? -16 : 16)));
  }
  useEffect(() => { const fit = () => setTop(value => value === null ? null : clampChatLauncherTop(value, window.innerHeight)); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); }, []);
  return <button ref={buttonRef} type="button" className={`chat-dock-launcher${dragging ? ' is-dragging' : ''}`} style={top === null ? undefined : { top, transform: 'none' }} hidden={!visible} aria-label="Open AI chat" aria-expanded={!visible} aria-controls="saplingagent-chat-panel" title="Open AI chat · Drag vertically or use arrow keys to move" onPointerDown={start} onPointerMove={moving} onPointerUp={finish} onPointerCancel={finish} onKeyDown={keyboard} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onOpen(); }}>
    <MessageSquare size={17} aria-hidden="true" /><span>AI chat</span><ChevronLeft size={14} aria-hidden="true" />
  </button>;
}
