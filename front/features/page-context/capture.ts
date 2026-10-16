export type CaptureRequest = { requestId: string; selector?: string; includeImage?: boolean };
const privateNode = (node: Element) => !!node.closest('input[type="password"],textarea,input,[data-page-private],.chat-dock .message');
export function pageUrl() {
  const url = new URL(location.href);
  for (const key of [...url.searchParams.keys()]) if (/token|secret|password|api.?key|^code$|^auth$/i.test(key)) url.searchParams.delete(key);
  url.username = ''; url.password = ''; url.hash = '';
  return url.href;
}
export async function capturePage(request: CaptureRequest) {
  const target = request.selector ? document.querySelector(request.selector) : document.body;
  if (!target) throw new Error('The requested page element was not found.');
  if (privateNode(target)) throw new Error('Choose a page container rather than a private input or message.');
  const elements: Record<string, unknown>[] = [], text: string[] = [], warnings: string[] = [];
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_ELEMENT);
  let node: Node | null = target, visited = 0;
  while (node && visited++ < 10000 && elements.length < 500) {
    const element = node as Element;
    if (!element.matches('script,style,noscript,link,meta') && !element.closest('[data-page-private],.chat-dock .message') && !element.matches('input[type="password"]')) {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      if (rect.width && rect.height && style.display !== 'none' && style.visibility !== 'hidden') {
        const label = element.getAttribute('aria-label') || element.getAttribute('alt') || element.getAttribute('placeholder') || '';
        const visibleText = element.matches('input,textarea,select') ? '' : !element.children.length || element.matches('h1,h2,h3,h4,p,button,a,label,summary') ? (element.textContent || '').trim().slice(0, 500) : '';
        if (visibleText) text.push(visibleText);
        elements.push({ tag: element.tagName.toLowerCase(), role: element.getAttribute('role') || undefined, label: label || undefined, text: visibleText || undefined, id: element.id || undefined, bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }, style: { display: style.display, position: style.position, color: style.color, backgroundColor: style.backgroundColor, fontSize: style.fontSize, padding: style.padding, gap: style.gap } });
      }
    }
    node = walker.nextNode();
  }
  if (node) warnings.push('DOM element capture was truncated at its inspection budget.');
  const combinedText = text.join('\n'); if (combinedText.length > 120000) warnings.push('Visible text was truncated.');
  let image: { mimeType: 'image/png'; data: string } | undefined;
  if (request.includeImage !== false) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const { toPng } = await import('html-to-image');
      const rect = target.getBoundingClientRect();
      if (rect.width > 4096 || rect.height > 4096) warnings.push('The page image was cropped to 4096 pixels; DOM/layout inspection remains available.');
      const capture = toPng(target as HTMLElement, { backgroundColor: target === document.body ? getComputedStyle(document.documentElement).backgroundColor : undefined, pixelRatio: 1, width: Math.min(4096, Math.ceil(rect.width)), height: Math.min(4096, Math.ceil(rect.height)), cacheBust: true, skipFonts: true, filter: node => !(node instanceof Element) || !privateNode(node) });
      const url = await Promise.race([capture, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('DOM image capture timed out.')), 5000); })]);
      const data = url.split(',')[1]; if (!data || data.length > 11 * 1024 * 1024) throw new Error('The rendered image exceeded its transport budget.');
      image = { mimeType: 'image/png', data };
    } catch { warnings.push('Page image unavailable; fresh DOM, visible text and layout are included. External resources or browser canvas restrictions may prevent DOM image rendering.'); }
    finally { if (timer) clearTimeout(timer); }
  }
  return { capturedAt: new Date().toISOString(), url: pageUrl(), title: document.title, viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY, devicePixelRatio }, text: combinedText.slice(0, 120000), elements, ...(image ? { image } : {}), ...(warnings.length ? { warnings } : {}) };
}
