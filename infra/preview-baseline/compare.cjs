// Catalog comparison only. Never rewrite captured definitions or migration bytes.
function functionLineEndings(definition) {
  // pg_get_functiondef uses an outer dollar-quoted body. Inside it, preserve
  // quoted SQL values/identifiers (including dynamic SQL) byte-for-byte: their
  // embedded newlines can be data, rather than source-code line separators.
  const outer = /^AS (\$[A-Za-z_0-9]*\$)/m.exec(definition);
  if (!outer) return definition; // Unsupported representation stays strict.
  const start = outer.index + outer[0].length;
  const end = definition.lastIndexOf(outer[1]);
  if (end < start) return definition;
  const body = definition.slice(start, end);
  let result = '', i = 0;
  while (i < body.length) {
    const rest = body.slice(i);
    const comment = /^(--[^\r\n]*|\/\*[\s\S]*?\*\/)/.exec(rest);
    if (comment) {
      result += comment[0].replaceAll('\r\n', '\n');
      i += comment[0].length;
      continue;
    }
    const dollar = /^\$[A-Za-z_0-9]*\$/.exec(rest);
    if (dollar) {
      const close = body.indexOf(dollar[0], i + dollar[0].length);
      if (close < 0) return definition;
      const next = close + dollar[0].length;
      result += body.slice(i, next); i = next; continue;
    }
    const quote = body[i];
    if (quote === "'" || quote === '"') {
      const from = i++;
      const escaped = quote === "'" && /(?:^|[^A-Za-z_0-9])[eE]$/.test(body.slice(0, from));
      let closed = false;
      while (i < body.length) {
        if (escaped && body[i] === '\\') { i += 2; continue; }
        if (body[i++] === quote) {
          if (body[i] === quote) { i++; continue; }
          closed = true; break;
        }
      }
      if (!closed) return definition;
      result += body.slice(from, i); continue;
    }
    if (body[i] === '\r' && body[i + 1] === '\n') { result += '\n'; i += 2; }
    else result += body[i++];
  }
  return definition.slice(0, start) + result + definition.slice(end);
}

function normalize(value, key = '') {
  if (Array.isArray(value)) {
    const items = value.filter(v => key !== 'constraints' || v.type !== 'n').map(v => normalize(v));
    if (['columns', 'labels'].includes(key)) return items;
    return items.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (value && typeof value === 'object') {
    const isFunction = typeof value.signature === 'string' && typeof value.definition === 'string';
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, normalize(
      k === 'definition' && isFunction ? functionLineEndings(value[k])
        : k === 'definition' && value.type === 'c' ? value[k].replace(/\n[ \t]+/g, '\n') : value[k], k)]));
  }
  if (typeof value === 'string' && ['qual', 'with_check'].includes(key)) return value.replace(/\n[ \t]+/g, '\n');
  return value;
}

function compare(expected, actual, prefix = '') {
  const mismatches = [];
  const walk = (a, b, p) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p + '.' + k);
    } else mismatches.push({ path: p, expected: a, actual: b });
  };
  walk(normalize(expected), normalize(actual), prefix);
  return mismatches;
}
module.exports = { compare, functionLineEndings };
