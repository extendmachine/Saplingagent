import { createHash } from 'node:crypto';

export function toolFingerprint(tool, args) {
  if (typeof args === 'string') args = JSON.parse(args);
  function ordered(value) {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, ordered(value[key])]));
    return value;
  }
  const normalized = { ...args };
  if (typeof normalized.reason === 'string') normalized.reason = normalized.reason.trim();
  if (typeof normalized.key === 'string') normalized.key = normalized.key.trim();
  if (typeof normalized.evidence === 'string') normalized.evidence = normalized.evidence.trim();
  return createHash('sha256').update(tool + '\n' + JSON.stringify(ordered(normalized))).digest('hex');
}
