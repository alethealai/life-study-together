import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { createRequire } from 'node:module';
const requireBackend=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp:adminApp,deleteApp:deleteAdmin}=requireBackend('firebase-admin/app');
const {getFirestore,Timestamp}=requireBackend('firebase-admin/firestore');

test('callable authenticates the SDK request and derives uid from its token',async()=>{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
  const projectId='demo-life-study', client=initializeApp({projectId,apiKey:'demo-key'},'callable-test');
  const admin=adminApp({projectId},'callable-test-admin'), db=getFirestore(admin);
  const auth=getAuth(client), functions=getFunctions(client,'asia-east1');
  connectAuthEmulator(auth,`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,{disableWarnings:true});
  connectFunctionsEmulator(functions,'127.0.0.1',Number(process.env.FUNCTIONS_TEST_PORT??5001));
  const record=httpsCallable(functions,'recordReading');
  try {
    const payload={gardenId:'endpoint',requestId:randomUUID(),expectedRevision:0,planRevision:0,bible:3,life:0,date:'2026-10-11',note:''};
    await assert.rejects(record(payload),{code:'functions/unauthenticated'});
    const {user}=await createUserWithEmailAndPassword(auth,`test-${randomUUID()}@example.com`,'emulator-only-password');
    await db.doc('gardens/endpoint').set({ownerUid:user.uid,book:'約翰福音',lifeBook:'約翰福音',bibleTarget:6,lifeTarget:16,bibleStep:3,lifeStep:3,schemaVersion:2,planRevision:0,readingStarted:false});
    await db.doc(`gardens/endpoint/members/${user.uid}`).set({uid:user.uid,name:'Test',baseBible:0,baseLife:0,bibleProgress:0,lifeProgress:0,bibleRead:0,lifeRead:0,readingDates:[],schemaVersion:2,revision:0,logCount:0,joinedAt:Timestamp.fromDate(new Date('2026-10-01'))});
    await assert.rejects(record({...payload,uid:'someone-else'}),{code:'functions/invalid-argument'});
    assert.deepEqual((await record(payload)).data,{gained:1,revision:1});
    assert.deepEqual((await record(payload)).data,{gained:1,revision:1});
    assert.equal((await db.doc(`gardens/endpoint/logs/${user.uid}-${payload.requestId}`).get()).data().uid,user.uid);
    const updatePlan=httpsCallable(functions,'updateReadingPlan');
    const change={gardenId:'endpoint',requestId:randomUUID(),expectedRevision:0,book:'使徒行傳',lifeBook:'約翰福音',bibleTarget:1,lifeTarget:16,bibleStep:3,lifeStep:3};
    assert.equal((await updatePlan(change)).data.revision,1);
    assert.equal((await updatePlan(change)).data.revision,1);
    assert.equal((await db.doc(`gardens/endpoint/members/${user.uid}`).get()).data().bibleProgress,0);
    assert.deepEqual((await record(payload)).data,{gained:1,revision:1});
    await assert.rejects(record({...payload,gardenId:'main',requestId:randomUUID()}),{code:'functions/permission-denied'});
  } finally {await deleteApp(client);await db.terminate();await deleteAdmin(admin);}
});
