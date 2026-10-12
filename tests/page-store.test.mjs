import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPageStore} from '../lib/page-store.mjs';
test('navigation reuses fresh pages and concurrent requests are coalesced',async()=>{
  let calls=0;
  const store=createPageStore(async cursor=>{calls++;return {rows:[{id:String(cursor??0)}],cursor:1,more:true}});
  await Promise.all([store.ensure(1),store.ensure(1)]);await store.ensure(1);
  assert.equal(calls,1);await store.more();assert.equal(store.getSnapshot().rows.length,2);
  await store.ensure(2);assert.equal(calls,3);assert.equal(store.getSnapshot().rows.length,1);
});
test('a stale in-flight page cannot overwrite refreshed data',async()=>{
  let resolveOld,calls=0;
  const store=createPageStore(()=>++calls===1?new Promise(resolve=>{resolveOld=resolve}):Promise.resolve({rows:[{id:'new'}],cursor:null,more:false}));
  const old=store.ensure(1);await store.ensure(2);
  resolveOld({rows:[{id:'old'}],cursor:null,more:false});await old;
  assert.deepEqual(store.getSnapshot().rows,[{id:'new'}]);
});
test('failed queries remain errors rather than an empty successful reading history',async()=>{
  const store=createPageStore(async()=>{throw new Error('permission-denied')});
  await store.ensure(1);assert.equal(store.getSnapshot().loaded,false);assert.ok(store.getSnapshot().error);
});
test('different account/garden stores never share private pages',async()=>{
  const first=createPageStore(async()=>({rows:[{id:'private-alice'}],cursor:null,more:false}));
  const second=createPageStore(async()=>({rows:[],cursor:null,more:false}));
  await first.ensure(1);await second.ensure(1);assert.equal(second.getSnapshot().rows.length,0);
});
