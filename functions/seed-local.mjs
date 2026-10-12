import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw new Error('Local emulators only');
initializeApp({projectId:'demo-life-study'});
const auth=getAuth(),db=getFirestore();
for(const [uid,email,name,role] of [['local-owner','owner@example.test','測試管理者','developer'],['local-reader','reader@example.test','測試同伴','member']]){
  try{await auth.createUser({uid,email,password:'GardenTest123!',displayName:name})}catch(e){if(e.code!=='auth/uid-already-exists'&&e.code!=='auth/email-already-exists')throw e}
  const ref=db.doc(`gardens/main/members/${uid}`);
  if(!(await ref.get()).exists)await ref.set({uid,email,name,role,baseBible:0,baseLife:0,bibleProgress:0,lifeProgress:0,bibleRead:0,lifeRead:0,readingDates:[],schemaVersion:2,revision:0,logCount:0,lastReadDate:null,joinedAt:Timestamp.fromDate(new Date('2026-10-01'))});
  await db.doc(`users/${uid}/gardens/main`).set({gardenId:'main',name:'本機測試花園',role});
}
if(!(await db.doc('gardens/main').get()).exists)await db.doc('gardens/main').set({name:'本機測試花園',ownerUid:'local-owner',book:'約翰福音',lifeBook:'約翰福音',bibleTarget:1,lifeTarget:1,bibleStep:3,lifeStep:3,schemaVersion:2,planRevision:0,readingStarted:false});
console.log('Local test garden ready. owner@example.test / GardenTest123!');
