import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseAst} from 'rolldown/parseAst';
import {setupMessages} from '../../localization/setup-messages.mjs';
import {formatMessage} from '../../localization/public.mjs';
const placeholders=value=>[...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(match=>match[1]).sort();
test('every setup message has both languages and matching interpolation fields',()=>{
 assert.deepEqual(Object.keys(setupMessages.en).sort(),Object.keys(setupMessages.zh).sort());
 for(const key of Object.keys(setupMessages.en)){assert.ok(setupMessages.en[key].trim(),key);assert.ok(setupMessages.zh[key].trim(),key);assert.deepEqual(placeholders(setupMessages.en[key]),placeholders(setupMessages.zh[key]),key);}
 assert.equal(formatMessage(setupMessages,'zh','setup.found.value1.models.select.one.or.enter',{value1:7}),'找到 7 个模型，可以选择或手动填写。');
});
test('setup renderers use existing catalog keys, with no inline bilingual call pairs',async()=>{
 let checked=0;
 for(const file of ['main.tsx','ProjectSetup.tsx','McpAccess.tsx','localization.tsx']){
  const source=await readFile(new URL(file,import.meta.url),'utf8'),ast=parseAst(source,{lang:'tsx'},file);
  function checkKey(node){if(node?.type==='Literal'&&typeof node.value==='string'){assert.ok(Object.hasOwn(setupMessages.en,node.value),file+': '+node.value);checked++;}else if(node?.type==='ConditionalExpression'){checkKey(node.consequent);checkKey(node.alternate);}}
  function walk(node){if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&['t','msg','setupError'].includes(node.callee.name)){assert.notEqual(node.arguments[1]?.type,'Literal',file+' must not contain t(en,zh)');checkKey(node.arguments[0]);}for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}}
  walk(ast);
 }
 assert.ok(checked>200);
});
