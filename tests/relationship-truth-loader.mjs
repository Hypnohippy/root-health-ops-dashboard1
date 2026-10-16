import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
export function loadTruthModule(file, overrides={}) {
  const cache=new Map();
  function load(path) {
    if(cache.has(path))return cache.get(path).exports;
    const mod={exports:{}};cache.set(path,mod);
    const output=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(output,{module:mod,exports:mod.exports,URL,Date,Map,Set,JSON,require:name=>{
      if(name in overrides)return overrides[name];
      if(name.startsWith('@/lib/'))return load(name.replace('@/','')+'.ts');
      throw Error('Forbidden dependency in shadow audit: '+name);
    }},{filename:path});return mod.exports;
  }
  return load(file);
}
