import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { createRequire } from 'node:module';
const requireBackend=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=requireBackend('firebase-admin/app');
const {getFirestore,Timestamp}=requireBackend('firebase-admin/firestore');
import { createGardenService } from '../functions/src/service.mjs';
import { auditGarden } from '../functions/src/audit.mjs';

const projectId = 'demo-life-study';
let env, app, db, service;
const plan = {name:'共讀',ownerUid:'owner',book:'約翰福音',lifeBook:'約翰福音',bibleTarget:6,lifeTarget:16,bibleStep:3,lifeStep:3,schemaVersion:2,planRevision:0,readingStarted:false};
const member = uid => ({uid,name:uid,email:`${uid}@example.com`,role:uid === 'owner' ? 'developer':'member',
  baseBible:0,baseLife:0,bibleProgress:0,lifeProgress:0,bibleRead:0,lifeRead:0,readingDates:[],schemaVersion:2,revision:0,logCount:0,lastReadDate:null,joinedAt:Timestamp.fromDate(new Date('2026-10-01T00:00:00Z'))});
const input = (extra = {}) => ({gardenId:'main',requestId:randomUUID(),expectedRevision:0,planRevision:0,bible:3,life:0,date:'2026-10-11',note:'',...extra});
const userDb = uid => env.authenticatedContext(uid, {email:`${uid}@example.com`}).firestore();
before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Tests must use the emulator');
  env = await initializeTestEnvironment({projectId,firestore:{rules:await readFile('firestore.rules','utf8')}});
  app = initializeApp({projectId}, 'integrity-tests'); db = getFirestore(app);
  service = createGardenService(db, () => new Date('2026-10-11T12:00:00Z'));
});
after(async () => {await env?.cleanup(); await db?.terminate(); if(app) await deleteApp(app);});
beforeEach(async () => {
  await env.clearFirestore();
  await db.doc('gardens/main').set(plan);
  await Promise.all(['owner','alice','bob'].map(uid => db.doc(`gardens/main/members/${uid}`).set(member(uid))));
});

test('atomically stores delta, book snapshot, summary and server-generated rewards; excludes baseline', async () => {
  await service.profile('alice',{planRevision:0,gardenId:'main',name:'Alice',bible:5,life:10,expectedRevision:0});
  const data = input({expectedRevision:1,bible:8,life:13});
  const result = await service.record('alice',data);
  assert.deepEqual(result,{gained:2,revision:2});
  const m = (await db.doc('gardens/main/members/alice').get()).data();
  assert.equal(m.baseBible,5); assert.equal(m.bibleRead,3); assert.equal(m.bibleProgress,8); assert.equal(m.logCount,1);
  const l = (await db.doc(`gardens/main/logs/alice-${data.requestId}`).get()).data();
  assert.equal(l.bible,3); assert.equal(l.life,3); assert.equal(l.book,plan.book); assert.equal(l.lifeBook,plan.lifeBook);
  assert.equal((await db.collection('gardens/main/rewards').get()).size,2);
});
test('same request retries concurrently return the original result and issue once', async () => {
  const data = input();
  const results = await Promise.all([service.record('alice',data),service.record('alice',data),service.record('alice',data)]);
  assert.ok(results.every(r => r.gained === 1 && r.revision === 1));
  assert.equal((await db.collection('gardens/main/logs').get()).size,1);
  assert.equal((await db.collection('gardens/main/rewards').get()).size,1);
  await assert.rejects(service.record('alice',{...data,note:'different'}),{code:'already-exists'});
});
test('two devices using the same revision cannot both advance progress', async () => {
  const results = await Promise.allSettled([service.record('alice',input()),service.record('alice',input({bible:6}))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'aborted');
  const m = (await db.doc('gardens/main/members/alice').get()).data();
  assert.equal(m.logCount,1); assert.equal(m.revision,1);
});
test('seven distinct days create one choice reward; same-day and replay do not add streak credit', async () => {
  for(let i=1;i<=7;i++) await service.record('alice',input({bible:i,date:`2026-10-0${i}`,expectedRevision:i-1}));
  const reward = (await db.doc('gardens/main/rewards/alice-combo-1').get()).data();
  assert.equal(reward.emoji,null);
  await service.record('alice',input({bible:8,date:'2026-10-07',expectedRevision:7}));
  assert.equal((await db.collection('gardens/main/rewards').where('kind','==','combo').get()).size,1);
});
test('rejects invalid fields, forged uid, fractions, future/impossible/pre-join dates and oversized notes', async () => {
  for(const bad of [{uid:'bob'},{bible:-1},{bible:1.5},{bible:22},{life:10001},{bible:NaN},{date:'2026-02-30'},{date:'2026-10-12'},{date:'2026-09-30'},{note:'x'.repeat(2001)},{requestId:'../x'}]) {
    await assert.rejects(service.record('alice',input(bad)),{code:'invalid-argument'});
  }
  await assert.rejects(service.record(undefined,input()),{code:'unauthenticated'});
  await assert.rejects(service.record('outsider',input()),{code:'permission-denied'});
  assert.equal((await db.collection('gardens/main/logs').get()).size,0);
});
test('reward collision rolls back log and summary without overwriting a placed reward', async () => {
  const ref=db.doc('gardens/main/rewards/alice-bible-1');
  await ref.set({uid:'alice',emoji:'🌷',x:100,y:100});
  await assert.rejects(service.record('alice',input()));
  assert.equal((await db.doc('gardens/main/members/alice').get()).data().revision,0);
  assert.equal((await db.collection('gardens/main/logs').get()).size,0);
  assert.equal((await ref.get()).data().x,100);
});
test('unreviewed or inconsistent legacy summaries block writes without modifying old records', async () => {
  await db.doc('gardens/main/members/alice').update({bibleRead:4});
  await assert.rejects(service.record('alice',input()),{code:'failed-precondition'});
  await db.doc('gardens/main/members/alice').set({...member('alice'),schemaVersion:1});
  await assert.rejects(service.record('alice',input()),{code:'failed-precondition'});
  assert.equal((await db.collection('gardens/main/logs').get()).size,0);
});
test('profile cannot reset earned progress or race a reading into an inconsistent baseline', async () => {
  const results=await Promise.allSettled([
    service.profile('alice',{planRevision:0,gardenId:'main',name:'Alice',bible:2,life:0,expectedRevision:0}),
    service.record('alice',input())
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  let m=(await db.doc('gardens/main/members/alice').get()).data();
  assert.equal(m.baseBible+m.bibleRead,m.bibleProgress);
  if(!m.logCount) await service.record('alice',input({expectedRevision:m.revision,bible:5}));
  m=(await db.doc('gardens/main/members/alice').get()).data();
  await assert.rejects(service.profile('alice',{planRevision:0,gardenId:'main',name:'Alice',bible:m.baseBible+1,life:0,expectedRevision:m.revision}),{code:'failed-precondition'});
});
test('members cannot forge summaries, create rewards/logs, delete readings or mutate others', async () => {
  const alice=userDb('alice'), bob=userDb('bob');
  await assertFails(setDoc(doc(alice,'gardens/main/rewards/forged'),{uid:'alice',emoji:'🌱',x:null,y:null}));
  await assertFails(setDoc(doc(alice,'gardens/main/logs/forged'),{uid:'alice',bible:3,life:0,date:'2026-10-11'}));
  await assertFails(updateDoc(doc(alice,'gardens/main/members/alice'),{bibleProgress:20}));
  const data=input(); await service.record('alice',data);
  const logPath=`gardens/main/logs/alice-${data.requestId}`;
  await assertFails(deleteDoc(doc(alice,logPath)));
  await assertFails(updateDoc(doc(bob,logPath),{note:'tampered'}));
  await assertSucceeds(updateDoc(doc(alice,logPath),{note:'my note'}));
  await assertFails(updateDoc(doc(alice,logPath),{bible:10}));
  await assertFails(updateDoc(doc(alice,logPath),{note:'x'.repeat(2001)}));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),logPath)));
});
test('choice is allowed once under concurrency; random rewards immutable; positions validated', async () => {
  await db.doc('gardens/main/rewards/alice-combo-1').set({uid:'alice',emoji:null,x:null,y:null});
  const alice=userDb('alice'), ref=doc(alice,'gardens/main/rewards/alice-combo-1');
  await assertFails(updateDoc(ref,{emoji:'anything'}));
  const chosen=await Promise.allSettled([updateDoc(ref,{emoji:'🌱'}),updateDoc(ref,{emoji:'🌷'})]);
  assert.equal(chosen.filter(r=>r.status==='fulfilled').length,1);
  await assertFails(updateDoc(ref,{emoji:'🌻'}));
  await assertSucceeds(updateDoc(ref,{x:100,y:-50}));
  await assertFails(updateDoc(ref,{x:1.5,y:0}));
  await assertFails(updateDoc(ref,{x:0,y:null}));
  await assertFails(updateDoc(ref,{x:1000001,y:0}));
  await assertSucceeds(updateDoc(ref,{x:null,y:null}));
  await assertFails(deleteDoc(ref));
  await service.record('alice',input());
  await assertFails(updateDoc(doc(alice,'gardens/main/rewards/alice-bible-1'),{emoji:'🎸'}));
});
test('membership create cannot smuggle progress, identity, history or rewards', async () => {
  await db.doc('gardenInvites/code').set({gardenId:'main',active:true});
  const alice=userDb('new');
  for(const patch of [{uid:'owner'},{bibleRead:100},{baseBible:100},{revision:1},{readingDates:['2026-10-01']},{logCount:2}]) {
    const data={...member('new'),joinedAt:serverTimestamp(),joinCode:'code',...patch};
    await assertFails(setDoc(doc(alice,'gardens/main/members/new'),data));
  }
  await assertSucceeds(setDoc(doc(alice,'gardens/main/members/new'),{...member('new'),joinedAt:serverTimestamp(),joinCode:'code'}));
});
test('atomic forged batch cannot bypass server-owned fields',async()=>{
  const alice=userDb('alice'),batch=writeBatch(alice);
  batch.update(doc(alice,'gardens/main/members/alice'),{bibleProgress:3,bibleRead:3});
  batch.set(doc(alice,'gardens/main/logs/forged'),{uid:'alice',bible:3,life:0});
  batch.set(doc(alice,'gardens/main/rewards/alice-bible-1'),{uid:'alice',emoji:'🌱',x:null,y:null});
  await assertFails(batch.commit());
});
test('audit preserves clean history and flags deleted logs or forged rewards',()=>{
  const m={...member('alice'),id:'alice',bibleRead:3,bibleProgress:3,readingDates:['2026-10-11'],schemaVersion:1};
  const logs=[{id:'old',uid:'alice',bible:3,life:0,date:'2026-10-11',note:''}];
  const rewards=[{id:'alice-bible-1',uid:'alice',emoji:'🌷',x:50,y:50}];
  const result=auditGarden(plan,[m],logs,rewards);
  assert.deepEqual(result.issues,[]); assert.equal(result.unlabeledLogs,1);
  assert.equal(result.patches[0].data.logCount,1); assert.equal(logs[0].book,undefined);
  assert.ok(auditGarden(plan,[m],[],rewards).issues.length);
  assert.ok(auditGarden(plan,[m],logs,[...rewards,{...rewards[0],id:'alice-bible-2'}]).issues.length);
});

const planInput=(extra={})=>({gardenId:'main',requestId:randomUUID(),expectedRevision:0,book:'使徒行傳',lifeBook:plan.lifeBook,bibleTarget:1,lifeTarget:plan.lifeTarget,bibleStep:3,lifeStep:3,...extra});

test('switch archives all members, resets only changed book, and carries reward remainder',async()=>{
  await service.profile('alice',{gardenId:'main',name:'Alice',bible:5,life:0,expectedRevision:0,planRevision:0});
  await service.record('alice',input({bible:7,life:3,expectedRevision:1}));
  await db.doc('gardens/main/rewards/alice-life-1').update({x:42,y:50});
  const request=planInput(); await service.updatePlan('owner',request);
  const ref=db.doc('gardens/main/members/alice');const m=(await ref.get()).data();
  assert.equal(m.bibleProgress,0);assert.equal(m.baseBible,0);assert.equal(m.bibleRead,2);assert.equal(m.archivedBibleRead,2);
  assert.equal(m.lifeProgress,3);assert.equal(m.revision,3);
  const old=(await ref.collection('readingPeriods').doc('bible-0').get()).data();
  assert.equal(old.book,'約翰福音');assert.equal(old.base,5);assert.equal(old.progress,7);assert.equal(old.read,2);
  assert.equal((await db.doc('gardens/main/members/bob').get()).data().bibleProgress,0);
  assert.equal((await db.doc('gardens/main/rewards/alice-life-1').get()).data().x,42);
  const result=await service.record('alice',input({bible:1,life:3,expectedRevision:3,planRevision:1}));
  assert.equal(result.gained,1);assert.equal((await ref.get()).data().bibleRead,3);
  assert.equal((await db.collection('gardens/main/logs').where('book','==','約翰福音').get()).size,1);
});
test('switch retry after new readings returns receipt without resetting again; changed payload rejected',async()=>{
  const request=planInput();
  const results=await Promise.all([service.updatePlan('owner',request),service.updatePlan('owner',request)]);
  assert.deepEqual(results[0],results[1]);
  await service.record('alice',input({bible:1,expectedRevision:1,planRevision:1}));
  await service.updatePlan('owner',request);
  assert.equal((await db.doc('gardens/main/members/alice').get()).data().bibleProgress,1);
  await assert.rejects(service.updatePlan('owner',{...request,book:'馬太福音'}),{code:'already-exists'});
});
test('switching back to an earlier book creates a distinct period and preserves both histories',async()=>{
  await service.record('alice',input());
  await service.updatePlan('owner',planInput());
  await service.record('alice',input({bible:2,expectedRevision:2,planRevision:1}));
  await service.updatePlan('owner',planInput({book:'約翰福音',expectedRevision:1}));
  const ref=db.doc('gardens/main/members/alice');
  assert.equal((await ref.get()).data().bibleProgress,0);
  const history=await ref.collection('readingPeriods').get();
  assert.deepEqual(history.docs.map(d=>[d.data().book,d.data().progress]),[['約翰福音',3],['使徒行傳',2]]);
  assert.equal((await ref.get()).data().bibleRead,5);
});
test('reading racing switch is either archived or rejected; never assigned to new book',async()=>{
  const results=await Promise.allSettled([service.record('alice',input()),service.updatePlan('owner',planInput())]);
  assert.equal(results[1].status,'fulfilled');
  const ref=db.doc('gardens/main/members/alice');
  assert.equal((await ref.get()).data().bibleProgress,0);
  const old=(await ref.collection('readingPeriods').doc('bible-0').get()).data();
  assert.equal(old.progress,results[0].status==='fulfilled'?3:0);
  const logs=await db.collection('gardens/main/logs').get();
  assert.ok(logs.docs.every(d=>d.data().book==='約翰福音'));
});
test('competing switches cannot overwrite one another, target edits do not reset progress',async()=>{
  await service.record('alice',input());
  const results=await Promise.allSettled([service.updatePlan('owner',planInput()),service.updatePlan('owner',planInput({book:'馬太福音'}))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'aborted');
  const g=(await db.doc('gardens/main').get()).data();
  await service.record('alice',input({bible:1,expectedRevision:2,planRevision:1}));
  await service.updatePlan('owner',planInput({book:g.book,expectedRevision:1,bibleTarget:5}));
  assert.equal((await db.doc('gardens/main/members/alice').get()).data().bibleProgress,1);
  assert.equal((await db.collection('gardens/main/members/alice/readingPeriods').get()).size,1);
});
test('life-only and simultaneous book switches reset only the appropriate tracks',async()=>{
  await service.record('alice',input({life:4}));
  await service.updatePlan('owner',planInput({book:plan.book,lifeBook:'使徒行傳'}));
  let m=(await db.doc('gardens/main/members/alice').get()).data();
  assert.equal(m.bibleProgress,3);assert.equal(m.lifeProgress,0);assert.equal(m.archivedLifeRead,4);
  await service.updatePlan('owner',planInput({book:'詩篇',lifeBook:'羅馬書',expectedRevision:1}));
  m=(await db.doc('gardens/main/members/alice').get()).data();
  assert.equal(m.bibleProgress,0);assert.equal(m.lifeProgress,0);
  assert.equal((await db.collection('gardens/main/members/alice/readingPeriods').get()).size,3);
});
test('fixed thresholds, stale profiles, pre-switch dates and direct owner plan edits are rejected',async()=>{
  await service.record('alice',input());
  await assert.rejects(service.updatePlan('owner',planInput({bibleStep:4})),{code:'failed-precondition'});
  await assert.rejects(service.updatePlan('alice',planInput()),{code:'permission-denied'});
  await service.updatePlan('owner',planInput());
  await assert.rejects(service.profile('alice',{gardenId:'main',name:'Alice',bible:0,life:0,expectedRevision:2,planRevision:0}),{code:'aborted'});
  await assert.rejects(service.record('alice',input({bible:1,expectedRevision:2,planRevision:1,date:'2026-10-10'})),{code:'invalid-argument'});
  const owner=userDb('owner');
  for(const patch of [{book:'詩篇'},{bibleStep:1},{planRevision:12},{readingStarted:false}])await assertFails(updateDoc(doc(owner,'gardens/main'),patch));
  await assertSucceeds(updateDoc(doc(owner,'gardens/main'),{name:'新花園名'}));
  await assertSucceeds(getDoc(doc(userDb('alice'),'gardens/main/members/alice/readingPeriods/bible-0')));
  await assertFails(getDoc(doc(userDb('bob'),'gardens/main/members/alice/readingPeriods/bible-0')));
  await assertFails(updateDoc(doc(userDb('alice'),'gardens/main/members/alice/readingPeriods/bible-0'),{progress:20}));
});
test('switch transaction aborts completely if any member summary is inconsistent',async()=>{
  await db.doc('gardens/main/members/bob').update({bibleRead:3});
  await assert.rejects(service.updatePlan('owner',planInput()),{code:'failed-precondition'});
  assert.equal((await db.doc('gardens/main').get()).data().book,plan.book);
  assert.equal((await db.collection('gardens/main/members/alice/readingPeriods').get()).size,0);
});
test('same uid in another garden keeps independent progress and rewards',async()=>{
  await db.doc('gardens/other').set(plan);await db.doc('gardens/other/members/alice').set(member('alice'));
  await service.record('alice',input({gardenId:'other',bible:6}));
  await service.updatePlan('owner',planInput());
  assert.equal((await db.doc('gardens/other/members/alice').get()).data().bibleProgress,6);
  assert.equal((await db.collection('gardens/other/rewards').get()).size,2);
});

test('audit reconciles lifetime totals with archived and current progress after switching',async()=>{
  await service.record('alice',input());await service.updatePlan('owner',planInput());
  await service.record('alice',input({bible:1,expectedRevision:2,planRevision:1}));
  const root=db.doc('gardens/main');
  const rows=await Promise.all(['members','logs','rewards'].map(async name=>(await root.collection(name).get()).docs.map(d=>({...d.data(),id:d.id}))));
  const periods=(await Promise.all(rows[0].map(async m=>(await root.collection('members').doc(m.id).collection('readingPeriods').get()).docs.map(d=>d.data())))).flat();
  assert.deepEqual(auditGarden((await root.get()).data(),...rows,periods).issues,[]);
  const corrupted=periods.map(p=>p.uid==='alice'?{...p,read:0}:p);
  assert.ok(auditGarden((await root.get()).data(),...rows,corrupted).issues.length);
});

// Catalog ids and upper bounds are shared by browser and trusted functions.
const {CWWL_BOOKS,cwwlLabel}=await import('../functions/src/cwwl.mjs');
const cwwlBooks=CWWL_BOOKS.filter(b=>b.count>=10).slice(0,2);
const cwwlPlan=(extra={})=>({gardenId:'main',requestId:randomUUID(),expectedRevision:0,book:plan.book,lifeBook:plan.lifeBook,bibleTarget:6,lifeTarget:16,bibleStep:3,lifeStep:3,enabledTracks:['cwwl'],cwwlBookId:cwwlBooks[0].id,cwwlTarget:1,...extra});
test('optional catalog selection rejects forged ids, empty tracks and non-owner changes',async()=>{
  for(const bad of [{cwwlBookId:'made-up'},{enabledTracks:[]},{enabledTracks:['cwwl','cwwl']},{cwwlTarget:cwwlBooks[0].count+1}])await assert.rejects(service.updatePlan('owner',cwwlPlan(bad)),{code:'invalid-argument'});
  await assert.rejects(service.updatePlan('alice',cwwlPlan()),{code:'permission-denied'});
  assert.equal((await db.doc('gardens/main').get()).data().planRevision,0);
});
test('CWWL baseline is excluded, limits enforced, atomic retries issue one reward',async()=>{
  await service.updatePlan('owner',cwwlPlan());
  await service.profile('alice',{gardenId:'main',name:'Alice',bible:0,life:0,cwwl:2,expectedRevision:1,planRevision:1});
  for(const bad of [{cwwl:1},{cwwl:2.5},{cwwl:cwwlBooks[0].count+1},{bible:1}])await assert.rejects(service.record('alice',input({bible:0,cwwl:5,expectedRevision:2,planRevision:1,...bad})),{code:'invalid-argument'});
  const data=input({bible:0,cwwl:5,expectedRevision:2,planRevision:1});
  const results=await Promise.all([service.record('alice',data),service.record('alice',data)]);
  assert.ok(results.every(r=>r.gained===1&&r.revision===3));
  const m=(await db.doc('gardens/main/members/alice').get()).data();
  assert.equal(m.cwwlRead,3);assert.equal(m.baseCwwl,2);assert.equal(m.cwwlProgress,5);
  const log=(await db.doc(`gardens/main/logs/alice-${data.requestId}`).get()).data();
  assert.equal(log.cwwl,3);assert.equal(log.cwwlBookId,cwwlBooks[0].id);assert.equal(log.cwwlBook,cwwlLabel(cwwlBooks[0].id));
  assert.equal((await db.collection('gardens/main/rewards').get()).size,1);
  await assert.rejects(service.profile('alice',{gardenId:'main',name:'Alice',bible:0,life:0,cwwl:0,expectedRevision:3,planRevision:1}),{code:'failed-precondition'});
  const alice=userDb('alice');
  await assertFails(updateDoc(doc(alice,'gardens/main/members/alice'),{cwwlRead:100,cwwlProgress:100}));
  await assertFails(updateDoc(doc(alice,`gardens/main/logs/alice-${data.requestId}`),{cwwl:9}));
  await assertFails(setDoc(doc(alice,'gardens/main/rewards/alice-cwwl-2'),{uid:'alice',emoji:'🌱',x:null,y:null}));
});
test('CWWL book changes archive all members, retain cumulative rewards and replay safely',async()=>{
  await service.updatePlan('owner',cwwlPlan());
  const first=input({bible:0,cwwl:3,expectedRevision:1,planRevision:1});
  await service.record('alice',first);
  await service.updatePlan('owner',cwwlPlan({expectedRevision:1,cwwlBookId:cwwlBooks[1].id}));
  const m=(await db.doc('gardens/main/members/alice').get()).data();
  assert.equal(m.cwwlProgress,0);assert.equal(m.archivedCwwlRead,3);assert.equal(m.cwwlRead,3);
  const archive=(await db.doc('gardens/main/members/alice/readingPeriods/cwwl-1').get()).data();
  assert.equal(archive.book,cwwlLabel(cwwlBooks[0].id));assert.equal(archive.progress,3);
  assert.equal((await service.record('alice',first)).revision,2);
  await assert.rejects(service.record('bob',input({bible:0,cwwl:1,expectedRevision:1,planRevision:1})),{code:'aborted'});
  await service.record('alice',input({bible:0,cwwl:3,expectedRevision:3,planRevision:2}));
  assert.equal((await db.collection('gardens/main/rewards').where('kind','==','cwwl').get()).size,2);
  const rows=async path=>(await db.collection(path).get()).docs.map(d=>({id:d.id,...d.data()}));
  const members=await rows('gardens/main/members');
  const periods=(await Promise.all(members.map(m=>rows(`gardens/main/members/${m.id}/readingPeriods`)))).flat();
  assert.deepEqual(auditGarden((await db.doc('gardens/main').get()).data(),members,await rows('gardens/main/logs'),await rows('gardens/main/rewards'),periods).issues,[]);
});
test('disabling a reading item preserves its progress and re-enabling resumes it',async()=>{
  await service.updatePlan('owner',cwwlPlan());
  await service.record('alice',input({bible:0,cwwl:2,expectedRevision:1,planRevision:1}));
  await service.updatePlan('owner',cwwlPlan({expectedRevision:1,enabledTracks:['bible']}));
  await assert.rejects(service.record('alice',input({bible:0,cwwl:3,expectedRevision:2,planRevision:2})),{code:'invalid-argument'});
  await service.record('alice',input({bible:1,cwwl:2,expectedRevision:2,planRevision:2}));
  await service.updatePlan('owner',cwwlPlan({expectedRevision:2}));
  assert.equal((await db.doc('gardens/main/members/alice').get()).data().cwwlProgress,2);
  assert.equal((await service.record('alice',input({bible:1,cwwl:3,expectedRevision:3,planRevision:3}))).gained,1);
});
