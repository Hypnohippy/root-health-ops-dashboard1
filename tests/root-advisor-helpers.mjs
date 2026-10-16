import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
export function load(file, mocks = {}, globals = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { module: mod, exports: mod.exports, URL, URLSearchParams, AbortController, AbortSignal, Buffer, console, process, ...globals, require: name => name in mocks ? mocks[name] : name.startsWith('@/') ? load(name.replace('@/', '') + '.ts', mocks, globals) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name) + '.tsx', mocks, globals) : name.endsWith('.css') ? {} : require(name) }, { filename: file });
  return mod.exports;
}
