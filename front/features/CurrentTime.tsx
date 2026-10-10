import { useEffect, useMemo, useState } from 'react';

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});

export function CurrentTime() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const dateTime = useMemo(() => now.toISOString(), [now]);

  return (
    <time className="current-time" dateTime={dateTime} aria-label={`当前时间 ${timeFormatter.format(now)}`}>
      <span className="current-time__date">{dateFormatter.format(now)}</span>
      <span className="current-time__clock">{timeFormatter.format(now)}</span>
    </time>
  );
}
