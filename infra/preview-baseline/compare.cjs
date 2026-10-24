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

// Only PL/pgSQL code indentation outside protected lexical regions is irrelevant.
// Keep the wrapper and protected lexical regions byte-strict. Unsupported or
// incomplete quoting fails closed; never dedent a whole definition/body.
function functionCodeIndentation(definition) {
  const outer = /^AS (\$[A-Za-z_0-9]*\$)/m.exec(definition);
  if (!outer || !/^ LANGUAGE plpgsql$/m.test(definition.slice(0, outer.index))) return definition;
  const start = outer.index + outer[0].length;
  const end = definition.lastIndexOf(outer[1]);
  if (end < start) return definition;
  const body = definition.slice(start, end);
  let result = '', i = 0, lineStart = false;
  const append = text => { result += text; lineStart = text.endsWith('\n'); };
  while (i < body.length) {
    if (lineStart && (body[i] === ' ' || body[i] === '\t')) {
      const from = i;
      while (body[i] === ' ' || body[i] === '\t') i++;
      // Whitespace before a quote is outside the literal, not part of its value.
      // A comment starts at -- or /*; indentation before it is outside its text.
      // Preserve blank-line formatting rather than widening scope.
      if (i === body.length || body[i] === '\r' || body[i] === '\n') append(body.slice(from, i));
      lineStart = false;
      continue;
    }
    if (body.startsWith('--', i)) {
      const next = body.indexOf('\n', i);
      const stop = next < 0 ? body.length : next + 1;
      append(body.slice(i, stop)); i = stop; continue;
    }
    if (body.startsWith('/*', i)) {
      const from = i; let depth = 1; i += 2;
      while (i < body.length && depth) {
        if (body.startsWith('/*', i)) { depth++; i += 2; }
        else if (body.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) return definition;
      append(body.slice(from, i)); continue;
    }
    const dollar = /^\$(?:[A-Za-z_][A-Za-z_0-9]*|)\$/.exec(body.slice(i));
    if (dollar) {
      const close = body.indexOf(dollar[0], i + dollar[0].length);
      if (close < 0) return definition;
      const next = close + dollar[0].length;
      append(body.slice(i, next)); i = next; continue;
    }
    const quote = body[i];
    if (quote === "'" || quote === '"') {
      const from = i++;
      const escaped = quote === "'" && /(?:^|[^A-Za-z_0-9$])[eE]$/.test(body.slice(0, from));
      let closed = false;
      while (i < body.length) {
        // Plain-string backslashes depend on session parsing settings; stay strict.
        if (body[i] === '\\' && quote === "'") {
          if (!escaped) return definition;
          i += 2; continue;
        }
        if (body[i++] === quote) {
          if (body[i] === quote) { i++; continue; }
          closed = true; break;
        }
      }
      if (!closed) return definition;
      append(body.slice(from, i)); continue;
    }
    // Consume complete identifiers so an embedded $tag$ is not a literal opener.
    const word = /^[A-Za-z_\u0080-\uFFFF][A-Za-z_0-9$\u0080-\uFFFF]*/.exec(body.slice(i));
    if (word) { append(word[0]); i += word[0].length; continue; }
    append(body[i++]);
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
      k === 'definition' && isFunction ? functionCodeIndentation(functionLineEndings(value[k]))
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
module.exports = { compare, functionLineEndings, functionCodeIndentation };
