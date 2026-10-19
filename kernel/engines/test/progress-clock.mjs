export function fakeClock() {
  let now = Date.parse('2026-10-10T12:00:00Z'), id = 0;
  const jobs = new Map();
  return {
    now: () => now,
    setTimeout(callback, delay) { const key = ++id; jobs.set(key, { at: now + delay, callback }); return key; },
    clearTimeout(key) { jobs.delete(key); },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...jobs].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        now = next[1].at; jobs.delete(next[0]); next[1].callback();
      }
      now = end;
    },
    get pending() { return jobs.size; },
  };
}
