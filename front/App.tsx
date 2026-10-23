import { useLanguage } from './localization/LanguageProvider';
import { useEffect, useRef, useState } from 'react';

// This application-owned host is optional. Core controls also have a direct URL.
export function App() {
  const { language, t, receive } = useLanguage();
  const footer = useRef<HTMLIFrameElement>(null);
  const controls = useRef<HTMLIFrameElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'saplingagent:language') {
        if (event.source === controls.current?.contentWindow || event.source === footer.current?.contentWindow) receive(event.data.language);
        return;
      }
      if (event.source !== controls.current?.contentWindow) return;
      const data = event.data;
      if (data?.type === 'kernel-panel') setOpen(data.open === true);
      if (data?.type === 'kernel-before-restart') window.dispatchEvent(new Event('saplingagent:before-restart'));
      if (data?.type === 'kernel-restarted') window.location.reload();
      if (data?.type === 'kernel-maintenance' && typeof data.url === 'string') {
        const url = new URL(data.url);
        if (url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port && url.pathname === '/' && !url.username && !url.password) window.location.assign(url.href);
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [receive]);
  const notifyLanguage = () => { for (const frame of [controls.current, footer.current]) frame?.contentWindow?.postMessage({ type: 'saplingagent:language', language }, window.location.origin); };
  useEffect(notifyLanguage, [language]);
  return <>
    <iframe ref={controls} title={t('kernel.controls')} onLoad={notifyLanguage} src="/__saplingagent/kernel" style={{ position: 'fixed', top: 12, right: 16, width: open ? 'min(660px, calc(100vw - 32px))' : '320px', height: open ? 'min(760px, calc(100dvh - 32px))' : '50px', zIndex: 40, border: open ? '1px solid #dce3d7' : 0, borderRadius: 14, boxShadow: open ? '0 12px 60px #26312820' : 'none' }} />
    <iframe ref={footer} title={t('kernel.version')} onLoad={notifyLanguage} src="/__saplingagent/kernel?footer" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 4, width: 310, height: 25, border: 0, zIndex: 10, pointerEvents: 'none' }} />
  </>;
}
