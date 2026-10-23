import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {transformSync} from 'rolldown/utils';

// Execute real TSX helpers/catalogs while substituting only explicit browser/React adapters.
export async function loadComponentModule(entry,{context,mocks}) {
 const modules=new Map();
 async function load(name,referrer=new URL('./',import.meta.url).href){
  if(Object.hasOwn(mocks,name)){
   const id='mock:'+name;if(modules.has(id))return modules.get(id);
   const value=mocks[name],module=new vm.SyntheticModule(Object.keys(value),function(){for(const [key,item]of Object.entries(value))this.setExport(key,item);},{context,identifier:id});modules.set(id,module);return module;
  }
  let url=new URL(name,referrer);if(!/\.(?:[cm]?js|tsx?)$/.test(url.pathname))url=new URL(url.href+(name.endsWith('localization')?'.tsx':'.ts'));
  if(modules.has(url.href))return modules.get(url.href);
  const source=await readFile(url,'utf8'),code=/\.mjs$/.test(url.pathname)?source:transformSync(url.pathname,source,{jsx:{runtime:'automatic'}}).code;
  const module=new vm.SourceTextModule(code,{context,identifier:url.href});modules.set(url.href,module);
  await module.link((specifier,referencing)=>load(specifier,referencing.identifier));return module;
 }
 return load(entry);
}
