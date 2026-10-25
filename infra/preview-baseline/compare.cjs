// Catalog comparison only. Never rewrite captured definitions or migration bytes.
// Classify ORIGINAL text completely before rendering any compatibility changes.
// null means unsupported/ambiguous: callers must return the original definition.
function classify(text) {
  const spans = [];
  let i = 0, codeStart = 0;
  const protect = (start, end) => {
    if (start > codeStart) spans.push({ code: true, text: text.slice(codeStart, start) });
    spans.push({ code: false, text: text.slice(start, end) });
    i = end; codeStart = end;
  };
  const quotedEnd = (from, quote, escaped) => {
    let at = from + 1;
    while (at < text.length) {
      if (quote === "'" && text[at] === '\\') {
        if (escaped) {
          if (at + 1 >= text.length) return null;
          at += 2; continue;
        }
        // An even run has the same quote boundary with standard strings on/off.
        // Odd runs are deliberately unsupported, even before a non-quote.
        let end = at;
        while (text[end] === '\\') end++;
        if ((end - at) % 2) return null;
        at = end; continue;
      }
      if (text[at++] === quote) {
        if (text[at] === quote) { at++; continue; }
        return at;
      }
    }
    return null;
  };
  while (i < text.length) {
    if (text.startsWith('--', i)) {
      let end = i + 2;
      while (end < text.length && text[end] !== '\r' && text[end] !== '\n') end++;
      // The terminating newline is code whitespace, not comment content.
      protect(i, end); continue;
    }
    if (text.startsWith('/*', i)) {
      const start = i; let end = i + 2, depth = 1;
      while (end < text.length && depth) {
        if (text.startsWith('/*', end)) { depth++; end += 2; }
        else if (text.startsWith('*/', end)) { depth--; end += 2; }
        else end++;
      }
      if (depth) return null;
      protect(start, end); continue;
    }
    const word = /^[A-Za-z_\u0080-\uFFFF][A-Za-z_0-9$\u0080-\uFFFF]*/.exec(text.slice(i));
    if (word) {
      const end = i + word[0].length;
      // Unicode escape syntax/custom UESCAPE is outside this compatibility grammar.
      if (/^u$/i.test(word[0]) && text[end] === '&' && /['"]/.test(text[end + 1] || '')) return null;
      if (/^e$/i.test(word[0]) && text[end] === "'") {
        const close = quotedEnd(end, "'", true);
        if (close === null) return null;
        protect(i, close); continue;
      }
      i = end; continue; // Identifier-internal $tag$ is not a literal delimiter.
    }
    if (text[i] === "'" || text[i] === '"') {
      const end = quotedEnd(i, text[i], false);
      if (end === null) return null;
      protect(i, end); continue;
    }
    if (text[i] === '$') {
      const dollar = /^\$(?:[A-Za-z_][A-Za-z_0-9]*|)\$/.exec(text.slice(i));
      if (dollar) {
        const close = text.indexOf(dollar[0], i + dollar[0].length);
        if (close < 0) return null;
        protect(i, close + dollar[0].length); continue;
      }
      const parameter = /^\$[0-9]+/.exec(text.slice(i));
      if (!parameter) return null;
      i += parameter[0].length; continue;
    }
    // Bare CR has uncertain line-boundary behavior; only CRLF code EOL is supported.
    if (text[i] === '\r' && text[i + 1] !== '\n') return null;
    i++;
  }
  if (codeStart < text.length) spans.push({ code: true, text: text.slice(codeStart) });
  return spans;
}

function functionRepresentation(definition, eol, indentation) {
  const outer = /^AS (\$(?:[A-Za-z_][A-Za-z_0-9]*|)\$)/m.exec(definition);
  if (!outer) return definition;
  const start = outer.index + outer[0].length;
  const end = definition.indexOf(outer[1], start);
  if (end < start || end !== definition.lastIndexOf(outer[1])) return definition;
  // Classifying the prefix also rejects an apparent AS marker inside a quoted
  // default/config value. Language recognition must be outside protected tokens.
  const prefix = classify(definition.slice(0, outer.index));
  if (!prefix || !/^ LANGUAGE plpgsql\r?$/m.test(prefix.filter(s => s.code).map(s => s.text).join(''))) return definition;
  const spans = classify(definition.slice(start, end));
  if (!spans) return definition; // No transformation has happened before this point.
  let result = '', lineStart = false;
  for (let part = 0; part < spans.length; part++) {
    const span = spans[part];
    if (!span.code) {
      result += span.text; // Quotes, dynamic SQL and complete comments stay byte-strict.
      lineStart = span.text.endsWith('\n');
      continue;
    }
    const code = eol ? span.text.replaceAll('\r\n', '\n') : span.text;
    let i = 0;
    while (i < code.length) {
      if (indentation && lineStart && (code[i] === ' ' || code[i] === '\t')) {
        const from = i;
        while (code[i] === ' ' || code[i] === '\t') i++;
        // Preserve blank lines and final trailing indentation. A following
        // protected token starts AFTER this whitespace; its own bytes never change.
        if (code[i] === '\r' || code[i] === '\n' || i === code.length && part === spans.length - 1) result += code.slice(from, i);
        lineStart = false; continue;
      }
      const char = code[i++]; result += char; lineStart = char === '\n';
    }
  }
  return definition.slice(0, start) + result + definition.slice(end);
}

const functionLineEndings = definition => functionRepresentation(definition, true, false);
const functionCodeIndentation = definition => functionRepresentation(definition, false, true);

function normalize(value, key = '') {
  if (Array.isArray(value)) {
    const items = value.filter(v => key !== 'constraints' || v.type !== 'n').map(v => normalize(v));
    if (['columns', 'labels'].includes(key)) return items;
    return items.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (value && typeof value === 'object') {
    const isFunction = typeof value.signature === 'string' && typeof value.definition === 'string';
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, normalize(
      k === 'definition' && isFunction ? functionRepresentation(value[k], true, true)
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
