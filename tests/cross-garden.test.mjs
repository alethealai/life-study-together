import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc} from 'firebase/firestore';
import {readFile} from 'node:fs/promises';
import {createCrossGardenService} from '../functions/src/cross-garden.mjs';
import {CWWL_BOOKS} from '../functions/src/cwwl.mjs';
import {createGardenService} from '../functions/src/service.mjs';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
let app,db,env,service,legacy;
const plan={name:'共讀',book:'約翰福音',lifeBook:'約翰福音',bibleTarget:1,lifeTarget:1,bibleStep:3,lifeStep:3,schemaVersion:2,planRevision:0,readingStarted:false};
const member={uid:'alice',name:'Alice',baseBible:0,baseLife:0,bibleProgress:0,lifeProgress:0,bibleRead:0,lifeRead:0,readingDates:[],schemaVersion:2,onboardingComplete:true,revision:0,logCount:0,lastReadDate:null};
const input=(extra={})=>({requestId:randomUUID(),kind:'life',book:'約翰福音',from:0,to:3,date:'2026-10-15',note:'private',merge:false,targets:['a','b'].map(gardenId=>({gardenId,revision:0,planRevision:0})),...extra});
const get=async path=>(await db.doc(path).get()).data();
before(async()=>{assert.ok(process.env.FIRESTORE_EMULATOR_HOST);env=await initializeTestEnvironment({projectId:'demo-life-study-cross',firestore:{rules:await readFile('firestore.rules','utf8')}});app=initializeApp({projectId:'demo-life-study-cross'},'cross-garden-tests');db=getFirestore(app);service=createCrossGardenService(db,()=>new Date('2026-10-15T10:00:00Z'));legacy=createGardenService(db,()=>new Date('2026-10-15T10:00:00Z'));});
after(async()=>{await env?.cleanup();await db?.terminate();if(app)await deleteApp(app)});
beforeEach(async()=>{await env.clearFirestore();for(const id of ['a','b','c']){await db.doc(`gardens/${id}`).set({...plan,name:id,...(id==='c'?{lifeBook:'馬太福音'}:{})});await db.doc(`gardens/${id}/members/alice`).set({...member,joinedAt:Timestamp.fromDate(new Date('2026-10-01'))});await db.doc(`users/alice/gardens/${id}`).set({gardenId:id,name:id,role:'member'});}});
test('one reading updates matching gardens, private/public summaries and rewards; concurrent retry counts once',async()=>{
 const data=input();const results=await Promise.all([service.record('alice',data),service.record('alice',data)]);assert.deepEqual(results[0],results[1]);
 for(const id of ['a','b']){assert.equal((await get(`gardens/${id}/members/alice`)).lifeProgress,3);assert.equal((await get(`gardens/${id}/memberSummaries/alice`)).lifeProgress,3);assert.equal((await get(`gardens/${id}/members/alice/private/progress`)).lifeProgress,3);assert.equal((await db.collection(`gardens/${id}/rewards`).get()).size,1);assert.equal((await db.collection(`gardens/${id}/logs`).get()).size,1);}
 assert.equal((await get('gardens/c/members/alice')).lifeProgress,0);
 await assert.rejects(service.record('alice',{...data,to:4}),{code:'already-exists'});
});
test('explicit merging aligns old differences without awarding old gaps or changing other tracks',async()=>{
 await db.doc('gardens/a/members/alice').update({baseLife:5,lifeProgress:5});
 await assert.rejects(service.record('alice',input({from:5,to:6})),{code:'failed-precondition'});
 await service.record('alice',input({from:5,to:6,merge:true}));
 for(const id of ['a','b']){const m=await get(`gardens/${id}/members/alice`);assert.equal(m.lifeProgress,6);assert.equal(m.baseLife,5);assert.equal(m.lifeRead,1);assert.equal(m.bibleProgress,0);assert.equal((await db.collection(`gardens/${id}/rewards`).get()).size,0);}
});
test('alignment only creates no reading log, date, or reward',async()=>{
 await db.doc('gardens/a/members/alice').update({baseLife:5,lifeProgress:5});await service.record('alice',input({from:5,to:5,merge:true}));
 const m=await get('gardens/b/members/alice');assert.equal(m.lifeProgress,5);assert.equal(m.lifeRead,0);assert.deepEqual(m.readingDates,[]);assert.equal((await db.collection('gardens/b/logs').get()).size,0);
});
test('stale revision, omitted target, new membership and changed book abort everything',async()=>{
 for(const data of [input({targets:[{gardenId:'a',revision:0,planRevision:0}]}),input({targets:[{gardenId:'a',revision:0,planRevision:0},{gardenId:'b',revision:1,planRevision:0}]})])await assert.rejects(service.record('alice',data),{code:'aborted'});
 await db.doc('gardens/b').update({lifeBook:'馬可福音',planRevision:1});await assert.rejects(service.record('alice',input()),{code:'aborted'});assert.equal((await get('gardens/a/members/alice')).lifeRead,0);
});
test('failure on last participant rolls back every earlier reward and log',async()=>{
 await db.doc('gardens/b/rewards/alice-life-1').set({uid:'alice',emoji:'🌷'});await assert.rejects(service.record('alice',input()));assert.equal((await get('gardens/a/members/alice')).revision,0);assert.equal((await db.collection('gardens/a/logs').get()).size,0);
});
test('two devices cannot concurrently count the same next article twice',async()=>{
 const results=await Promise.allSettled([service.record('alice',input()),service.record('alice',input())]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await get('gardens/b/members/alice')).lifeRead,3);
});
test('validates authentication, bounds, target membership, dates, and onboarding',async()=>{
 await assert.rejects(service.record(null,input()),{code:'unauthenticated'});await assert.rejects(service.record('outsider',input()),{code:'aborted'});
 for(const extra of [{to:52},{to:1.5},{date:'2026-10-16'},{date:'2026-09-01'}])await assert.rejects(service.record('alice',input(extra)),{code:'invalid-argument'});
 await db.doc('gardens/b/members/alice').update({onboardingComplete:false});await assert.rejects(service.record('alice',input()),{code:'failed-precondition'});assert.equal((await get('gardens/a/members/alice')).lifeRead,0);
});
const withdrawalInput=impact=>({requestId:impact.requestId,items:impact.items.map(({gardenId,logId,expectedRevision,planRevision,inventoryRevision})=>({gardenId,logId,expectedRevision,planRevision,inventoryRevision}))});
test('shared withdrawal is atomic, idempotent, removes rewards and prevents replay',async()=>{
 const data=input();await service.record('alice',data);const impact=await service.previewWithdrawal('alice',{gardenId:'b'});assert.equal(impact.items.length,2);
 await assert.rejects(legacy.previewWithdrawal('alice',{gardenId:'a'}),{code:'failed-precondition'});
 const undo=withdrawalInput(impact);await assert.rejects(service.withdraw('alice',{...undo,items:undo.items.slice(0,1)}));
 await service.withdraw('alice',undo);await service.withdraw('alice',undo);
 for(const id of ['a','b']){const m=await get(`gardens/${id}/members/alice`);assert.equal(m.lifeProgress,0);assert.equal(m.lifeRead,0);assert.deepEqual(m.readingDates,[]);assert.equal((await db.collection(`gardens/${id}/rewards`).get()).size,0);}
 await assert.rejects(service.record('alice',data),{code:'failed-precondition'});
});
test('withdrawal preserves alignment baseline and detects newer reading in any garden',async()=>{
 await db.doc('gardens/a/members/alice').update({baseLife:5,lifeProgress:5});await service.record('alice',input({from:5,to:6,merge:true}));
 const impact=await service.previewWithdrawal('alice',{gardenId:'a'});await service.withdraw('alice',withdrawalInput(impact));assert.equal((await get('gardens/b/members/alice')).lifeProgress,5);
 await service.record('alice',input({from:5,to:8,targets:['a','b'].map(gardenId=>({gardenId,revision:2,planRevision:0}))}));
 await legacy.record('alice',{gardenId:'b',requestId:randomUUID(),expectedRevision:3,planRevision:0,bible:1,life:8,cwwl:0,date:'2026-10-15',note:''});
 await assert.rejects(service.previewWithdrawal('alice',{gardenId:'a'}),{code:'failed-precondition'});
});
test('shared request receipts are server-only',async()=>{
 const data=input();await service.record('alice',data);const client=env.authenticatedContext('alice').firestore();await assertFails(getDoc(doc(client,`users/alice/readingRequests/${data.requestId}`)));await assertFails(setDoc(doc(client,'users/alice/readingRequests/forged'),{payload:'forged'}));
});

test('Bible sync stays separate from Life-study of the same book',async()=>{
 await service.record('alice',input({kind:'bible',to:2,targets:['a','b','c'].map(gardenId=>({gardenId,revision:0,planRevision:0}))}));
 for(const id of ['a','b','c']){const m=await get(`gardens/${id}/members/alice`);assert.equal(m.bibleProgress,2);assert.equal(m.lifeProgress,0);}
});
test('CWWL sync matches exact catalogue ID and respects different reward thresholds',async()=>{
 const book=CWWL_BOOKS.find(b=>b.count>=6),other=CWWL_BOOKS.find(b=>b.id!==book.id&&b.count>=6);
 for(const id of ['a','b','c'])await db.doc(`gardens/${id}`).update({enabledTracks:['cwwl'],cwwlBookId:id==='c'?other.id:book.id,cwwlTarget:3});
 await service.record('alice',input({kind:'cwwl',book:book.id,to:3}));
 for(const id of ['a','b']){assert.equal((await get(`gardens/${id}/members/alice`)).cwwlProgress,3);assert.equal((await db.collection(`gardens/${id}/rewards`).get()).size,1);}
 assert.equal((await get('gardens/c/members/alice')).cwwlProgress??0,0);
 await service.withdraw('alice',withdrawalInput(await service.previewWithdrawal('alice',{gardenId:'a'})));
 assert.equal((await get('gardens/b/members/alice')).cwwlProgress,0);
});
test('each garden applies its own reward threshold and withdrawing removes placed rewards together',async()=>{
 await db.doc('gardens/b').update({lifeStep:2});const data=input({to:6});await service.record('alice',data);
 assert.equal((await db.collection('gardens/a/rewards').get()).size,2);assert.equal((await db.collection('gardens/b/rewards').get()).size,3);
 await legacy.reward('alice',{gardenId:'b',action:'place',id:'alice-life-1',x:0,y:0});
 const impact=await service.previewWithdrawal('alice',{gardenId:'a'});assert.equal(impact.items.find(i=>i.gardenId==='b').removedPlacements,1);
 await service.withdraw('alice',withdrawalInput(impact));assert.equal((await db.collection('gardens/b/placements').get()).size,0);
});
