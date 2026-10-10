export type ServerEvent = { type: string; [key: string]: unknown };

/** SSE lines and UTF-8 characters may each span network chunks. */
export class EventParser {
  private buffer = '';
  private data: string[] = [];
  private readonly receive: (event: ServerEvent) => void;
  constructor(receive: (event: ServerEvent) => void) { this.receive = receive; }

  push(chunk: string, final = false) {
    this.buffer += chunk;
    let start = 0;
    for (let index = 0; index < this.buffer.length; index++) {
      const char = this.buffer[index];
      if (char !== '\n' && char !== '\r') continue;
      if (char === '\r' && index === this.buffer.length - 1 && !final) break;
      this.line(this.buffer.slice(start, index));
      if (char === '\r' && this.buffer[index + 1] === '\n') index++;
      start = index + 1;
    }
    this.buffer = this.buffer.slice(start);
    if (final) {
      if (this.buffer) this.line(this.buffer);
      this.buffer = '';
      this.line('');
    }
  }

  private line(line: string) {
    if (!line) {
      if (!this.data.length) return;
      const raw = this.data.join('\n');
      this.data = [];
      let event: unknown;
      try { event = JSON.parse(raw); } catch { throw new Error('Invalid response stream format. Please try again.'); }
      if (!event || typeof event !== 'object' || !('type' in event) || typeof event.type !== 'string') {
        throw new Error('Response stream is missing an event type. Please try again.');
      }
      this.receive(event as ServerEvent);
      return;
    }
    if (line.startsWith(':')) return;
    const separator = line.indexOf(':');
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') this.data.push(value);
  }
}

export async function consumeEvents(response: Response, receive: (event: ServerEvent) => void) {
  if (!response.body) throw new Error('Service did not return a response stream. Please try again.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new EventParser(receive);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode(), true);
  } finally {
    reader.releaseLock();
  }
}
