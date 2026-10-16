import test from 'node:test';import assert from 'node:assert/strict';import {createPageBroker} from '../page-broker.mjs';
const registration=(pageId,visible=true)=>({pageId,visible,url:'http://127.0.0.1:5173/',title:'Project'});
const snapshot=()=>({capturedAt:new Date().toISOString(),text:'Updated visible heading',elements:[{tag:'h1',text:'Updated visible heading'}],viewport:{width:1280,height:720}});
test('page read requests a fresh capture from the visible page and preserves DOM when image unavailable',async()=>{
 const broker=createPageBroker();broker.heartbeat(registration('background',false));broker.heartbeat(registration('current'));
 const waiting=broker.next('current');const read=broker.read({selector:'.application-content'});const {request}=await waiting;assert.equal(request.selector,'.application-content');assert.equal(request.includeImage,true);
 assert.throws(()=>broker.complete({pageId:'background',requestId:request.requestId,snapshot:snapshot()}),{code:'PAGE_REQUEST_NOT_FOUND'});
 broker.complete({pageId:'current',requestId:request.requestId,snapshot:{...snapshot(),warnings:['Image unavailable']}});assert.equal((await read).snapshot.text,'Updated visible heading');assert.throws(()=>broker.complete({pageId:'current',requestId:request.requestId,snapshot:snapshot()}),{code:'PAGE_REQUEST_NOT_FOUND'});broker.close();
});
test('closed, stale, failed and cancelled pages never return an old snapshot as fresh',async()=>{
 const broker=createPageBroker({timeoutMs:20,pollMs:10});assert.throws(()=>broker.read(),{code:'PAGE_UNAVAILABLE'});broker.heartbeat(registration('current'));
 await assert.rejects(broker.read(),{code:'PAGE_CAPTURE_TIMEOUT'});const controller=new AbortController(),read=broker.read({}, {signal:controller.signal});controller.abort();await assert.rejects(read,{code:'PAGE_CAPTURE_CANCELLED'});
 const failure=broker.read(),{request}=await broker.next('current');broker.complete({pageId:'current',requestId:request.requestId,error:'Selector was not found'});await assert.rejects(failure,{code:'PAGE_CAPTURE_FAILED'});broker.close();assert.throws(()=>broker.read(),{code:'PAGE_UNAVAILABLE'});
});
test('pending long poll and reads close cleanly, and stale registrations expire',async()=>{
 let now=Date.now();const broker=createPageBroker({now:()=>now,ttlMs:100});broker.heartbeat(registration('current'));now+=101;assert.throws(()=>broker.read(),{code:'PAGE_UNAVAILABLE'});broker.heartbeat(registration('current'));
 const poll=broker.next('other'),read=broker.read();broker.close();assert.deepEqual(await poll,{request:null});await assert.rejects(read,{code:'PAGE_UNAVAILABLE'});
});
