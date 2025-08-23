export function parseJsonFromText(text) {
  const objStart = text.indexOf('{');
  const arrStart = text.indexOf('[');
  if (objStart === -1 && arrStart === -1) {
    throw new Error('No JSON content found in text');
  }
  const start = arrStart !== -1 && (arrStart < objStart || objStart === -1) ? arrStart : objStart;
  const open = text[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        return JSON.parse(candidate);
      }
    }
  }
  throw new Error('No complete JSON content found');
}

export default { parseJsonFromText };
