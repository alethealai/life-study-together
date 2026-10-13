import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,updateDoc} from 'firebase/firestore';
import {createGardenService} from '../functions/src/service.mjs';
import {auditGarden} from '../functions/src/audit.mjs';
const requireBackend=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=requireBackend('firebase-admin/app');
const {getFirestore,Timestamp}=requireBackend('firebase-admin/firestore');
let env,app,db,service;
const plan={name:'Garden',ownerUid:'owner',book:'約翰福音',lifeBook:'約翰福音',bibleTarget:1,lifeTarget:1,bibleStep:3,lifeStep:3,schemaVersion:2,planRevision:0,readingStarted:false};
const member=uid=>({uid,name:uid,role:uid==='owner'?'developer':'member',baseBible:0,baseLife:0,bibleProgress:0,lifeProgress:0,bibleRead:0,lifeRead:0,readingDates:[],schemaVersion:2,revision:0,logCount:0,lastReadDate:null,joinedAt:Timestamp.fromDate(new Date('2026-10-01'))});
const input=(extra={})=>({gardenId:'main',requestId:randomUUID(),expectedRevision:0,planRevision:0,bible:3,life:0,date:'2026-10-11',note:'private',...extra});
const preview=()=>service.previewWithdrawal('alice',{gardenId:'main'});
const confirm=p=>({gardenId:'main',logId:p.logId,expectedRevision:p.expectedRevision,planRevision:p.planRevision,inventoryRevision:p.inventoryRevision});
const get=async path=>(await db.doc(`gardens/main/${path}`).get()).data();
before(async()=>{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
  env=await initializeTestEnvironment({projectId:'demo-life-study',firestore:{rules:await readFile('firestore.rules','utf8')}});
  app=initializeApp({projectId:'demo-life-study'},'withdrawal-tests');db=getFirestore(app);
  service=createGardenService(db,()=>new Date('2026-10-11T12:00:00Z'));
});
after(async()=>{await env?.cleanup();await db?.terminate();if(app)await deleteApp(app)});
beforeEach(async()=>{await env.clearFirestore();await db.doc('gardens/main').set(plan);for(const uid of ['owner','alice','bob'])await db.doc(`gardens/main/members/${uid}`).set(member(uid))});

test('withdraw restores baseline, removes only this reading rewards/placements and retains a private notice/archive',async()=>{
  await service.profile('alice',{gardenId:'main',name:'A',bible:5,life:0,expectedRevision:0,planRevision:0});
  const original=input({bible:8,life:3,expectedRevision:1});await service.record('alice',original);
  await service.record('bob',input());
  await service.reward('alice',{gardenId:'main',action:'place',id:'alice-bible-1',x:100,y:100});
  const p=await preview();assert.equal(p.afterBible,5);assert.equal(p.rewards.length,2);assert.equal(p.removedPlacements,1);
  const r=await service.withdraw('alice',confirm(p));
  assert.equal(r.removedRewards,2);assert.equal(r.removedPlacements,1);
  const m=await get('members/alice');assert.equal(m.bibleProgress,5);assert.equal(m.bibleRead,0);assert.equal(m.logCount,0);assert.deepEqual(m.readingDates,[]);
  assert.equal((await get('members/alice/private/progress')).lastCorrection.removedRewards,2);
  assert.equal((await get('memberSummaries/alice')).bibleProgress,5);
  assert.equal((await db.collection('gardens/main/placements').get()).size,0);
  assert.equal((await db.collection('gardens/main/rewards').get()).size,1);
  assert.equal((await db.doc('gardens/main').get()).data().hasPlacedEmoji,true);
  assert.equal((await get(`members/alice/withdrawnReadings/${p.logId}`)).note,'private');
  const own=env.authenticatedContext('alice').firestore(),other=env.authenticatedContext('owner').firestore();
  await assertSucceeds(getDoc(doc(own,`gardens/main/members/alice/withdrawnReadings/${p.logId}`)));
  await assertFails(getDoc(doc(other,`gardens/main/members/alice/withdrawnReadings/${p.logId}`)));
  await assertFails(updateDoc(doc(own,'gardens/main/members/alice'),{lastCorrection:null}));
});

test('concurrent withdrawal retries are idempotent; an old reading receipt cannot reissue withdrawn rewards',async()=>{
  const original=input();await service.record('alice',original);const request=confirm(await preview());
  const results=await Promise.all([service.withdraw('alice',request),service.withdraw('alice',request)]);assert.deepEqual(results[0],results[1]);
  await assert.rejects(service.record('alice',original),{code:'failed-precondition'});
  await service.record('alice',input({expectedRevision:2}));
  await service.withdraw('alice',request);
  assert.equal((await get('members/alice')).bibleProgress,3);assert.equal((await db.collection('gardens/main/rewards').get()).size,1);
});

test('same-day earlier reading remains; sequential undo keeps previous pointer and date until the last reading is withdrawn',async()=>{
  await service.record('alice',input({bible:1}));const first=(await get('members/alice')).lastLogId;
  await service.record('alice',input({bible:3,expectedRevision:1}));
  await service.withdraw('alice',confirm(await preview()));
  assert.deepEqual((await get('members/alice')).readingDates,['2026-10-11']);assert.equal((await get('members/alice')).lastLogId,first);
  await service.withdraw('alice',confirm(await preview()));
  assert.equal((await get('members/alice')).lastLogId,null);assert.deepEqual((await get('members/alice')).readingDates,[]);
});

test('withdrawing the seventh distinct day removes its chosen streak reward and recalculates streak',async()=>{
  for(let i=1;i<=7;i++)await service.record('alice',input({bible:i,date:`2026-10-0${i}`,expectedRevision:i-1}));
  await service.reward('alice',{gardenId:'main',action:'choose',id:'alice-combo-1',emoji:'⭐'});
  const p=await preview();assert.equal(p.rewards[0].emoji,'⭐');
  await service.withdraw('alice',confirm(p));
  assert.equal((await get('members/alice/private/progress')).streakLength,6);
  assert.equal((await db.doc('gardens/main/rewards/alice-combo-1').get()).exists,false);
  assert.equal((await db.collection('gardens/main/rewards').get()).size,2);
});

test('a backdated latest submission removes only its date and preserves a later reading date',async()=>{
  await service.record('alice',input({bible:1}));await service.record('alice',input({bible:3,date:'2026-10-10',expectedRevision:1}));
  await service.withdraw('alice',confirm(await preview()));
  const m=await get('members/alice');assert.equal(m.lastReadDate,'2026-10-11');assert.deepEqual(m.readingDates,['2026-10-11']);
});

test('changed placement invalidates confirmation; new reading racing withdrawal cannot corrupt progress',async()=>{
  await service.record('alice',input());const old=confirm(await preview());
  await service.reward('alice',{gardenId:'main',action:'place',id:'alice-bible-1',x:0,y:0});
  await assert.rejects(service.withdraw('alice',old),{code:'aborted'});
  const request=confirm(await preview());
  const race=await Promise.allSettled([service.withdraw('alice',request),service.record('alice',input({bible:6,expectedRevision:1}))]);
  assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
  const m=await get('members/alice');assert.ok([0,6].includes(m.bibleProgress));assert.equal(m.bibleRead,m.bibleProgress);
});

test('switching books retains rewards and blocks withdrawal of the old book, even with no new readings',async()=>{
  await service.record('alice',input());const p=await preview();
  await service.updatePlan('owner',{gardenId:'main',requestId:randomUUID(),expectedRevision:0,book:'使徒行傳',lifeBook:plan.lifeBook,bibleTarget:1,lifeTarget:1,bibleStep:3,lifeStep:3});
  await assert.rejects(service.withdraw('alice',confirm(p)),{code:'aborted'});
  await assert.rejects(preview(),{code:'failed-precondition'});
  assert.equal((await db.collection('gardens/main/rewards').get()).size,1);assert.equal((await get('members/alice')).bibleProgress,0);
});

test('tampered/missing reward aborts the complete withdrawal, and non-owner cannot withdraw',async()=>{
  const data=input();await service.record('alice',data);const p=await preview();
  await assert.rejects(service.withdraw('bob',confirm(p)),{code:'aborted'});
  await assert.rejects(service.previewWithdrawal(undefined,{gardenId:'main'}),{code:'unauthenticated'});
  await db.doc('gardens/main/rewards/alice-bible-1').update({logId:'wrong'});
  await assert.rejects(service.withdraw('alice',confirm(p)),{code:'failed-precondition'});
  assert.equal((await get('members/alice')).bibleProgress,3);assert.ok(await get(`logs/alice-${data.requestId}`));
});

test('old opaque placement links cannot mutate a newly earned reward with a reused ordinal',async()=>{
  await service.record('alice',input());await service.reward('alice',{gardenId:'main',action:'place',id:'alice-bible-1',x:0,y:0});
  const id=(await get('rewards/alice-bible-1')).placementId;
  await service.withdraw('alice',confirm(await preview()));await service.record('alice',input({expectedRevision:2}));
  await assert.rejects(service.reward('alice',{gardenId:'main',action:'place',id,placement:true,x:100,y:100}),{code:'failed-precondition'});
  assert.equal((await get('rewards/alice-bible-1')).x,null);
});

test('new members must finish onboarding; baseline is excluded from rewards',async()=>{
  await db.doc('gardens/main/members/alice').update({onboardingComplete:false});
  await assert.rejects(service.record('alice',input()),{code:'failed-precondition'});
  await service.profile('alice',{gardenId:'main',name:'暱稱',bible:5,life:2,cwwl:0,expectedRevision:0,planRevision:0});
  const m=await get('members/alice');assert.equal(m.onboardingComplete,true);assert.equal(m.bibleRead,0);
  assert.equal((await get('members/alice/private/progress')).onboardingComplete,true);
  assert.equal((await db.collection('gardens/main/rewards').get()).size,0);
  await service.record('alice',input({bible:8,life:2,expectedRevision:1}));
  assert.equal((await db.collection('gardens/main/rewards').get()).size,1);
});

test('audit still reconciles after withdrawal and never unfreezes the already-started reward thresholds',async()=>{
  await service.record('alice',input());await service.withdraw('alice',confirm(await preview()));
  const root=(await db.doc('gardens/main').get()).data();
  const rows=await Promise.all(['members','logs','rewards'].map(async c=>(await db.collection(`gardens/main/${c}`).get()).docs.map(d=>({...d.data(),id:d.id}))));
  const result=auditGarden(root,...rows);assert.deepEqual(result.issues,[]);assert.equal(result.gardenPatch.readingStarted,true);
});

test('CWWL withdrawal preserves its baseline and does not remove earlier Bible rewards',async()=>{
  const {CWWL_BOOKS}=await import('../functions/src/cwwl.mjs');
  const book=CWWL_BOOKS.find(b=>b.count>=10);
  await service.record('alice',input());
  await service.updatePlan('owner',{gardenId:'main',requestId:randomUUID(),expectedRevision:0,book:plan.book,lifeBook:plan.lifeBook,bibleTarget:1,lifeTarget:1,bibleStep:3,lifeStep:3,enabledTracks:['bible','life','cwwl'],cwwlBookId:book.id,cwwlTarget:1});
  await service.profile('alice',{gardenId:'main',name:'Alice',bible:0,life:0,cwwl:2,expectedRevision:2,planRevision:1});
  await service.record('alice',input({bible:3,cwwl:5,expectedRevision:3,planRevision:1}));
  const p=await preview();assert.equal(p.cwwl,3);assert.equal(p.afterCwwl,2);
  await service.withdraw('alice',confirm(p));
  const m=await get('members/alice');assert.equal(m.cwwlProgress,2);assert.equal(m.cwwlRead,0);assert.equal(m.bibleProgress,3);
  assert.equal((await db.collection('gardens/main/rewards').get()).size,1);assert.ok(await get('rewards/alice-bible-1'));
});
