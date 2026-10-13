import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,query,where,limit,setDoc,writeBatch,serverTimestamp} from 'firebase/firestore';
import {createGardenService} from '../functions/src/service.mjs';
import {memberSummary,privateProgress} from '../functions/src/read-models.mjs';
import {migrateReadModels} from '../functions/src/migrate-read-models.mjs';
import {privatePageQuery,placementQuery} from '../lib/reading-queries.mjs';
const requireBackend=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=requireBackend('firebase-admin/app');
const {getFirestore,Timestamp}=requireBackend('firebase-admin/firestore');
let env,app,db,service;
const plan={name:'Garden',ownerUid:'owner',book:'約翰福音',lifeBook:'約翰福音',bibleTarget:1,lifeTarget:1,bibleStep:3,lifeStep:3,schemaVersion:2,planRevision:0,readingStarted:false};
const member=uid=>({uid,name:uid,email:`${uid}@example.com`,role:uid==='owner'?'developer':'member',baseBible:0,baseLife:0,bibleProgress:0,lifeProgress:0,bibleRead:0,lifeRead:0,readingDates:[],schemaVersion:2,revision:0,logCount:0,lastReadDate:null,joinedAt:Timestamp.fromDate(new Date('2026-10-01'))});
const input=(extra={})=>({gardenId:'main',requestId:randomUUID(),expectedRevision:0,planRevision:0,bible:3,life:0,date:'2026-10-11',note:'private thought',...extra});
const client=uid=>env.authenticatedContext(uid,{email:`${uid}@example.com`}).firestore();
before(async()=>{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
  env=await initializeTestEnvironment({projectId:'demo-life-study',firestore:{rules:await readFile('firestore.rules','utf8')}});
  app=initializeApp({projectId:'demo-life-study'},'privacy-tests');db=getFirestore(app);
  service=createGardenService(db,()=>new Date('2026-10-11T12:00:00Z'));
});
after(async()=>{await env?.cleanup();await db?.terminate();if(app)await deleteApp(app)});
beforeEach(async()=>{
  await env.clearFirestore();await db.doc('gardens/main').set(plan);
  for(const uid of ['owner','alice','bob'])await db.doc(`gardens/main/members/${uid}`).set(member(uid));
  await migrateReadModels(db,'main',true);
});

test('private documents and unfiltered queries are denied, including to garden owner',async()=>{
  const data=input();await service.record('alice',data);
  const paths=['members/alice','members/alice/private/progress',`logs/alice-${data.requestId}`,'rewards/alice-bible-1'];
  for(const uid of ['bob','owner','outsider'])for(const path of paths)await assertFails(getDoc(doc(client(uid),`gardens/main/${path}`)));
  const alice=client('alice');
  for(const path of paths)await assertSucceeds(getDoc(doc(alice,`gardens/main/${path}`)));
  for(const kind of ['members','logs','rewards'])await assertFails(getDocs(query(collection(alice,'gardens/main',kind),limit(12))));
  await assertFails(getDocs(query(collection(alice,'gardens/main/logs'),where('uid','==','bob'),limit(12))));
  await assertFails(getDocs(query(collection(alice,'gardens/main/logs'),where('uid','==','alice'))));
  await assertFails(getDocs(query(collection(alice,'gardens/main/logs'),where('uid','==','alice'),limit(25))));
  const summary=await assertSucceeds(getDoc(doc(client('bob'),'gardens/main/memberSummaries/alice')));
  assert.deepEqual(Object.keys(summary.data()).sort(),['uid','name','bibleProgress','lifeProgress','cwwlProgress','lastReadDate'].sort());
  assert.equal(summary.data().bibleProgress,3);assert.equal(summary.data().lastReadDate,'2026-10-11');
  await assertFails(getDoc(doc(client('outsider'),'gardens/main/memberSummaries/alice')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'gardens/main/memberSummaries/alice')));
});

test('reading, profile and plan transactions keep public and private summaries consistent',async()=>{
  await service.profile('alice',{gardenId:'main',name:'A',bible:2,life:0,expectedRevision:0,planRevision:0});
  await service.record('alice',input({bible:5,expectedRevision:1}));
  await service.updatePlan('owner',{gardenId:'main',requestId:randomUUID(),expectedRevision:0,book:'使徒行傳',lifeBook:plan.lifeBook,bibleTarget:1,lifeTarget:1,bibleStep:3,lifeStep:3});
  for(const uid of ['owner','alice','bob']){
    const m=(await db.doc(`gardens/main/members/${uid}`).get()).data();
    assert.deepEqual((await db.doc(`gardens/main/memberSummaries/${uid}`).get()).data(),memberSummary(m));
    const privateView=(await db.doc(`gardens/main/members/${uid}/private/progress`).get()).data();
    assert.deepEqual(privateView,privateProgress(m));assert.ok(!('readingDates' in privateView));assert.ok(!('email' in privateView));
  }
  const bob=client('bob');
  await assertFails(getDocs(privatePageQuery(bob,'main','alice','periods')));
  await assertSucceeds(getDocs(privatePageQuery(client('alice'),'main','alice','periods')));
});

test('projection forgery fails and initial membership requires an atomic safe projection',async()=>{
  await db.doc('gardenInvites/code').set({gardenId:'main',active:true});
  const c=client('new'),m={...member('new'),onboardingComplete:false,joinedAt:serverTimestamp(),joinCode:'code'};
  await assertFails(setDoc(doc(c,'gardens/main/members/new'),m));
  for(const extra of [{email:'leaked@example.com'},{bibleProgress:100}]){
    const batch=writeBatch(c);
    batch.set(doc(c,'gardens/main/members/new'),m);
    batch.set(doc(c,'gardens/main/memberSummaries/new'),{...memberSummary(m),...extra});
    batch.set(doc(c,'gardens/main/members/new/private/progress'),privateProgress(m));
    await assertFails(batch.commit());
    assert.equal((await db.doc('gardens/main/members/new').get()).exists,false);
  }
  await assertFails(setDoc(doc(client('alice'),'gardens/main/memberSummaries/alice'),{...memberSummary(member('alice')),bibleProgress:100}));
});

test('private pagination handles equal dates, no duplicates, and excludes placed or other-user rewards',async()=>{
  const batch=db.batch();
  for(let i=0;i<31;i++)for(const uid of ['alice','bob']){
    const id=`${uid}-${String(i).padStart(3,'0')}`;
    batch.set(db.doc(`gardens/main/logs/${id}`),{uid,date:'2026-10-11',note:'private'});
    batch.set(db.doc(`gardens/main/rewards/${id}`),{uid,date:'2026-10-11',x:i===30?5:null,y:i===30?5:null,emoji:'🌱'});
  }
  await batch.commit();
  for(const [kind,total,size] of [['logs',31,12],['rewards',30,24]]){
    let cursor=null,ids=[];
    for(let i=0;i<4;i++){
      const page=await getDocs(privatePageQuery(client('alice'),'main','alice',kind,cursor));
      assert.ok(page.size<=size);assert.ok(page.docs.every(d=>d.data().uid==='alice'));
      ids.push(...page.docs.map(d=>d.id));cursor=page.docs.at(-1);
      if(page.size<size)break;
    }
    assert.equal(ids.length,total);assert.equal(new Set(ids).size,total);
  }
});

test('placement publishes no reward source or predictable reward id; collect preserves the first-placement flag',async()=>{
  await service.record('alice',input());
  const place={gardenId:'main',action:'place',id:'alice-bible-1',x:100,y:100};
  await service.reward('alice',place);
  const r=(await db.doc('gardens/main/rewards/alice-bible-1').get()).data(),id=r.placementId;
  assert.ok(id&&!id.includes('alice')&&!id.includes('bible'));
  assert.deepEqual((await getDoc(doc(client('bob'),`gardens/main/placements/${id}`))).data(),{uid:'alice',emoji:r.emoji,x:100,y:100});
  await assertFails(getDoc(doc(client('bob'),`gardens/main/placementLinks/${id}`)));
  await assertFails(setDoc(doc(client('alice'),'gardens/main/placements/forged'),{uid:'alice',emoji:'⭐',x:0,y:0}));
  await assert.rejects(service.reward('bob',{gardenId:'main',action:'collect',id,placement:true}),{code:'permission-denied'});
  await service.reward('alice',{...place,id,placement:true,x:200});
  const visible=await assertSucceeds(getDocs(placementQuery(client('bob'),'main',{left:150,right:250,top:50,bottom:150})));
  assert.equal(visible.size,1);
  assert.equal((await getDocs(placementQuery(client('bob'),'main',{left:0,right:50,top:0,bottom:50}))).size,0);
  await service.reward('alice',{gardenId:'main',action:'collect',id,placement:true});
  await service.reward('alice',{gardenId:'main',action:'collect',id,placement:true});
  assert.equal((await db.doc(`gardens/main/placements/${id}`).get()).exists,false);
  assert.equal((await db.doc('gardens/main').get()).data().hasPlacedEmoji,true);
  assert.equal((await getDocs(privatePageQuery(client('alice'),'main','alice','rewards'))).size,1);
});

test('concurrent overlapping placements only save one; no private/public divergence',async()=>{
  await service.record('alice',input({bible:6}));
  const results=await Promise.allSettled([1,2].map(n=>service.reward('alice',{gardenId:'main',action:'place',id:`alice-bible-${n}`,x:100,y:100})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await db.collection('gardens/main/placements').get()).size,1);
  assert.equal((await db.collection('gardens/main/rewards').where('x','==',null).get()).size,1);
});

test('view migration preserves original readings/rewards and reuses opaque placement identity on rerun',async()=>{
  await service.record('alice',input());
  const reward=db.doc('gardens/main/rewards/alice-bible-1');await reward.update({x:50,y:50});
  const original=(await reward.get()).data();
  const preview=await migrateReadModels(db,'main');assert.equal(preview.placed,1);
  assert.equal((await db.collection('gardens/main/placements').get()).size,0);
  await migrateReadModels(db,'main',true);
  const id=(await reward.get()).data().placementId;
  await migrateReadModels(db,'main',true);
  assert.deepEqual((await reward.get()).data(),{...original,placementId:id});
  assert.equal((await db.collection('gardens/main/placements').get()).size,1);
  assert.equal((await db.collection('gardens/main/logs').get()).size,1);
  assert.equal((await db.doc('users/bob/gardens/main').get()).data().name,'Garden');
  await service.rename('owner',{gardenId:'main',name:'New name'});
  assert.equal((await db.doc('users/bob/gardens/main').get()).data().name,'New name');
});

test('membership in another garden does not grant access to this garden or its private queries',async()=>{
  await db.doc('gardens/other').set(plan);await db.doc('gardens/other/members/alice').set(member('alice'));
  await service.record('alice',input({gardenId:'other'}));
  await assertFails(getDocs(privatePageQuery(client('bob'),'other','bob','logs')));
  await assertFails(getDoc(doc(client('bob'),'gardens/other/memberSummaries/alice')));
  await assert.rejects(service.reward('bob',{gardenId:'other',action:'place',id:'alice-bible-1',x:0,y:0}),{code:'permission-denied'});
});

test('full create/join batches support safe summaries and indexes, while ordinary member cannot create a garden',async()=>{
  const owner=client('owner'),batch=writeBatch(owner),gardenId='new-garden';
  const m={...member('owner'),onboardingComplete:false,joinedAt:serverTimestamp()};
  batch.set(doc(owner,`gardens/${gardenId}`),{...plan,inviteCode:'🌱🌷🌻🌳🍀🦋'});
  batch.set(doc(owner,`gardens/${gardenId}/members/owner`),m);
  batch.set(doc(owner,`gardens/${gardenId}/memberSummaries/owner`),memberSummary(m));
  batch.set(doc(owner,`gardens/${gardenId}/members/owner/private/progress`),privateProgress(m));
  batch.set(doc(owner,`users/owner/gardens/${gardenId}`),{gardenId,name:'New garden',role:'developer'});
  batch.set(doc(owner,'gardenInvites/🌱🌷🌻🌳🍀🦋'),{gardenId,active:true});
  await assertSucceeds(batch.commit());
  const bob=client('bob'),join=writeBatch(bob),newMember={...member('bob'),onboardingComplete:false,joinedAt:serverTimestamp(),joinCode:'🌱🌷🌻🌳🍀🦋'};
  join.set(doc(bob,`gardens/${gardenId}/members/bob`),newMember);
  join.set(doc(bob,`gardens/${gardenId}/memberSummaries/bob`),memberSummary(newMember));
  join.set(doc(bob,`gardens/${gardenId}/members/bob/private/progress`),privateProgress(newMember));
  join.set(doc(bob,`users/bob/gardens/${gardenId}`),{gardenId,name:'New garden',role:'member'});
  await assertSucceeds(join.commit());
  assert.equal((await assertSucceeds(getDocs(collection(bob,`gardens/${gardenId}/memberSummaries`)))).size,2);
  await assertSucceeds(getDoc(doc(bob,`gardens/${gardenId}/members/bob/private/progress`)));
  await assertFails(setDoc(doc(bob,'gardens/forged-garden'),{...plan,ownerUid:'bob'}));
});
