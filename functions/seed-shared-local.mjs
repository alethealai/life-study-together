import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {memberSummary,privateProgress} from './src/read-models.mjs';
import {CWWL_BOOKS} from './src/cwwl.mjs';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8180'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9199')throw new Error('Preview emulators only');
initializeApp({projectId:'demo-life-study'});
const db=getFirestore(),auth=getAuth(),uid='shared-preview';
try{await auth.createUser({uid,email:'preview@example.test',password:'GardenTest123!',displayName:'以樂'})}catch(e){if(e.code!=='auth/uid-already-exists'&&e.code!=='auth/email-already-exists')throw e}
const cwwl=CWWL_BOOKS.find(b=>b.title==='聖經要道（卷一）');
for(const [id,name,tracks] of [['preview-a','A 團體・晨光花園',['life']],['preview-b','B 團體・晚間共讀',['life']],['preview-c','C 團體・日日追求',['bible','cwwl']]]){
 const garden=db.doc(`gardens/${id}`);if((await garden.get()).exists)continue;
 const plan={name,ownerUid:uid,book:'約翰福音',lifeBook:'約翰福音',bibleTarget:6,lifeTarget:18,bibleStep:3,lifeStep:3,enabledTracks:tracks,cwwlBookId:id==='preview-c'?cwwl.id:null,cwwlTarget:id==='preview-c'?6:0,schemaVersion:2,planRevision:0,readingStarted:false};
 const batch=db.batch();batch.set(garden,plan);
 for(const [memberId,memberName,life,bible,cwwlProgress] of [[uid,'以樂',id==='preview-c'?0:16,id==='preview-c'?5:0,id==='preview-c'?3:0],['preview-companion','小安',id==='preview-c'?0:12,id==='preview-c'?3:0,id==='preview-c'?2:0]]){
  const m={uid:memberId,name:memberName,email:memberId===uid?'preview@example.test':'companion@example.test',role:memberId===uid?'developer':'member',baseBible:bible,baseLife:life,baseCwwl:cwwlProgress,bibleProgress:bible,lifeProgress:life,cwwlProgress,bibleRead:0,lifeRead:0,cwwlRead:0,readingDates:[],onboardingComplete:true,schemaVersion:2,revision:0,logCount:0,lastReadDate:null,joinedAt:Timestamp.fromDate(new Date('2026-10-01'))};
  const ref=garden.collection('members').doc(memberId);batch.set(ref,m);batch.set(ref.collection('private').doc('progress'),privateProgress(m));batch.set(garden.collection('memberSummaries').doc(memberId),memberSummary(m));
 }
 batch.set(db.doc(`users/${uid}/gardens/${id}`),{gardenId:id,name,role:'developer'});await batch.commit();
}
console.log('Shared preview ready: preview@example.test / GardenTest123!');
