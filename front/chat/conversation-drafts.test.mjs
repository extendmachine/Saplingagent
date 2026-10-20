import test from 'node:test';
import assert from 'node:assert/strict';
import { captureConversationDraft, restoreConversationDraft } from './conversation-drafts.ts';
import { CHAT_LAUNCHER_KEY, clampChatLauncherTop, readChatLauncherTop } from './chat-launcher.ts';

test('conversation drafts preserve finished upload IDs and keep unfinished original files for their own session',async()=>{
 const file=new File(['fixture'],'pending.txt'), content=[{type:'file',data:'/api/attachments/finished/content',mimeType:'text/plain',sourceType:'url'}];
 const a=captureConversationDraft({text:'draft A',attachments:[{id:'finished',name:'finished.txt',type:'file',contentType:'text/plain',content,status:{type:'requires-action',reason:'composer-send'}},{id:'pending',name:'pending.txt',type:'file',file,status:{type:'running'}}]});
 const b=captureConversationDraft({text:'draft B',attachments:[]});const composer={text:'',files:[],setText(text){this.text=text},async addAttachment(value){this.files.push(value)}};
 await restoreConversationDraft(composer,b);assert.equal(composer.text,'draft B');assert.equal(composer.files.length,0);
 await restoreConversationDraft(composer,a);assert.equal(composer.text,'draft A');assert.equal(composer.files[0].id,'finished');assert.equal(composer.files[0].content,content);assert.equal(composer.files[1],file);
});
test('chat launcher stays visible and handles unavailable or malformed preference storage',()=>{
 assert.equal(clampChatLauncherTop(-10,800),80);assert.equal(clampChatLauncherTop(10000,800),690);assert.equal(readChatLauncherTop({getItem:key=>key===CHAT_LAUNCHER_KEY?'350':null},800),350);
 for(const value of ['broken','0','-5',null])assert.equal(readChatLauncherTop({getItem:()=>value},800),null);
 assert.equal(readChatLauncherTop({getItem(){throw Error('denied')}},800),null);
});
