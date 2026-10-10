// A confirmation can only grant this one form action, never session-wide access.
export function confirmationContent(schema) {
  if (schema?.type !== 'object' || !schema.properties || typeof schema.properties !== 'object') return null;
  const content = {};
  for (const [key, field] of Object.entries(schema.properties)) {
    if (field.type === 'boolean') {
      if (/session|always|remember/i.test(key)) { if (schema.required?.includes(key)) content[key] = false; }
      else if (/confirm|approve|accept|allow|consent/i.test(key)) content[key] = true;
      else if (schema.required?.includes(key)) return null;
    }
    else if (field.type === 'string') {
      const options = field.enum || field.oneOf?.map(option => option.const);
      const choice = options?.find(option => typeof option === 'string' && /^(accept|approve|allow|yes|once)(\b|$)/i.test(option) && !/session|always|remember/i.test(option));
      if (choice) content[key] = choice;
      else if (schema.required?.includes(key)) return null;
    } else if (schema.required?.includes(key)) return null;
  }
  return content;
}
