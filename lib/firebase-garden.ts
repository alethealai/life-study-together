import {JOIN_EMOJIS,parseInviteCode} from './invite-code.mjs';
export {JOIN_EMOJIS} from './invite-code.mjs';
import {memberSummary, privateProgress} from '../functions/src/read-models.mjs';
import type { User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  collection, doc, getDoc, onSnapshot, onSnapshotsInSync,
  serverTimestamp, setDoc, updateDoc, writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db, functionsClient } from "./firebase";
import { initial, type Garden } from "./garden";

export const GARDEN_ID = "main";
const gardenRef = (gardenId: string) => doc(db!, "gardens", gardenId);
const memberRef = (gardenId: string, uid: string) => doc(db!, "gardens", gardenId, "members", uid);
const userGardenRef = (uid:string,gardenId:string) => doc(db!,"users",uid,"gardens",gardenId);

export type Membership = { uid: string; name: string; email: string; role: "developer" | "owner" | "member" };
export type GardenSummary = { id:string; name:string; role:Membership['role']; inviteCode?:string };

function addInitialMember(batch:ReturnType<typeof writeBatch>,gardenId:string,uid:string,data:Record<string,unknown>){
  batch.set(memberRef(gardenId,uid),data);
  batch.set(doc(db!, 'gardens',gardenId,'memberSummaries',uid),memberSummary(data));
  batch.set(doc(db!, 'gardens',gardenId,'members',uid,'private','progress'),privateProgress(data));
}

function makeJoinCode(){return [...JOIN_EMOJIS].sort(()=>Math.random()-.5).slice(0,6).join('')}
export async function ensureLegacyGardenIndex(user:User){
  if((await getDoc(userGardenRef(user.uid,GARDEN_ID))).exists())return;
  const membership=await getDoc(memberRef(GARDEN_ID,user.uid));
  if(!membership.exists())return;
  const garden=await getDoc(gardenRef(GARDEN_ID));
  const m=membership.data() as Membership;
  await setDoc(userGardenRef(user.uid,GARDEN_ID),{gardenId:GARDEN_ID,name:String(garden.data()?.name??'共讀花園'),role:m.role,joinedAt:serverTimestamp()},{merge:true});
}
// Wait for membership/index writes to commit before subscribing to the new garden.
export function watchUserGardens(uid:string,callback:(gardens:GardenSummary[])=>void,onError:(e:Error)=>void){
  return onSnapshot(collection(db!,"users",uid,"gardens"),{includeMetadataChanges:true},s=>{if(s.metadata.fromCache||s.metadata.hasPendingWrites)return;callback(s.docs.map(d=>{
    const x=d.data();return {id:d.id,name:String(x.name??'共讀花園'),role:x.role as Membership['role'],inviteCode:x.inviteCode?String(x.inviteCode):undefined};
  }))},onError);
}
export async function renameGarden(gardenId:string,name:string){
  await callMutation('renameReadingGarden',{gardenId,name});
}
export async function createNewGarden(user:User,data:{name:string;book:string;lifeBook:string;bibleTarget:number;lifeTarget:number;enabledTracks?:string[];cwwlBookId?:string|null}){
  let code='';for(let i=0;i<5;i++){const candidate=makeJoinCode();if(!(await getDoc(doc(db!,"gardenInvites",candidate))).exists()){code=candidate;break}}
  if(!code)throw new Error('暫時無法產生邀請碼，請再試一次。');
  const ref=doc(collection(db!,"gardens")),batch=writeBatch(db!);
  const plan={...initial().plan,book:data.book,lifeBook:data.lifeBook,bibleTarget:data.bibleTarget,lifeTarget:data.lifeTarget,enabledTracks:data.enabledTracks??['bible','life'],cwwlBookId:data.cwwlBookId??null,cwwlTarget:data.cwwlBookId?1:0};
  batch.set(ref,{...plan,name:data.name.trim(),inviteCode:code,ownerUid:user.uid,schemaVersion:2,planRevision:0,readingStarted:false,createdAt:serverTimestamp()});
  addInitialMember(batch,ref.id,user.uid,{uid:user.uid,name:user.displayName||'花園主人',email:user.email,role:'developer',baseBible:0,baseLife:0,bibleProgress:0,lifeProgress:0,bibleRead:0,lifeRead:0,readingDates:[],schemaVersion:2,onboardingComplete:false,revision:0,logCount:0,lastReadDate:null,joinedAt:serverTimestamp()});
  batch.set(userGardenRef(user.uid,ref.id),{gardenId:ref.id,name:data.name.trim(),role:'developer',inviteCode:code,joinedAt:serverTimestamp()});
  batch.set(doc(db!,"gardenInvites",code),{gardenId:ref.id,name:data.name.trim(),active:true,createdAt:serverTimestamp()});
  await batch.commit();return ref.id;
}
export async function createGardenInvite(gardenId:string,uid:string,name:string){
  let code='';for(let i=0;i<5;i++){const candidate=makeJoinCode();if(!(await getDoc(doc(db!,"gardenInvites",candidate))).exists()){code=candidate;break}}
  if(!code)throw new Error('暫時無法產生邀請碼，請再試一次。');
  const batch=writeBatch(db!);
  batch.update(gardenRef(gardenId),{inviteCode:code});
  batch.set(userGardenRef(uid,gardenId),{inviteCode:code},{merge:true});
  batch.set(doc(db!,"gardenInvites",code),{gardenId,name,active:true,createdAt:serverTimestamp()});
  await batch.commit();return code;
}
export async function joinGarden(user:User,code:string){
  const parsed=parseInviteCode(code);if(!parsed.valid)throw new Error('請輸入六個不同的 emoji，並確認順序。');
  const normalized=parsed.emojis.join('');
  const invite=await getDoc(doc(db!,"gardenInvites",normalized));
  if(!invite.exists()||invite.data().active!==true)throw new Error('找不到這個花園，請確認六個 emoji 的順序。');
  const gardenId=String(invite.data().gardenId);
  const existingMember=await getDoc(memberRef(gardenId,user.uid));
  const batch = writeBatch(db!);
  if(!existingMember.exists())addInitialMember(batch,gardenId,user.uid, {
    uid:user.uid,name:user.displayName||'新同伴',email:user.email,role:'member',joinCode:normalized,
    baseBible: 0, baseLife: 0, bibleProgress: 0, lifeProgress: 0,
    bibleRead: 0, lifeRead: 0, readingDates: [], schemaVersion:2, onboardingComplete:false, revision:0, logCount:0, lastReadDate:null, joinedAt: serverTimestamp(),
  });
  batch.set(userGardenRef(user.uid,gardenId),{gardenId,name:String(invite.data().name??'共讀花園'),role:existingMember.data()?.role??'member',joinedAt:serverTimestamp()},{merge:true});
  await batch.commit();
  return gardenId;
}

export function watchGarden(gardenId:string,uid:string,callback:(garden:Garden)=>void,onError:(e:Error)=>void):Unsubscribe {
  let root:Record<string,unknown>|null=null, own:Garden['members'][number]|null=null;
  let members:Garden['members']=[];
  const ready=new Set<string>(); let stopped=false,failed=false;
  const fail=(e:Error)=>{if(!stopped){failed=true;onError(e)}};
  const emit=()=>{if(!stopped&&!failed&&root&&own&&ready.size===3){
    if(!members.some(m=>m.id===uid)){fail(new Error('同伴摘要尚未準備好，請聯絡花園管理者。'));return}
    callback({
    plan:{book:String(root.book),lifeBook:String(root.lifeBook),bibleTarget:Number(root.bibleTarget),lifeTarget:Number(root.lifeTarget),bibleStep:Number(root.bibleStep),lifeStep:Number(root.lifeStep),revision:Number(root.planRevision??0),readingStarted:root.readingStarted===true,enabledTracks:(root.enabledTracks as string[])??['bible','life'],cwwlBookId:root.cwwlBookId==null?null:String(root.cwwlBookId),cwwlTarget:Number(root.cwwlTarget??0)},
    hasPlacedEmoji:root.hasPlacedEmoji===true,placementRevision:Number(root.placementRevision??0),
    members:members.map(m=>m.id===uid?own!:m),logs:[],rewards:[],
  })}};
  const unsubs=[onSnapshotsInSync(db!,emit),
    onSnapshot(gardenRef(gardenId),{includeMetadataChanges:true},s=>{if(s.metadata.fromCache)return;root=s.exists()?s.data():null;ready.add('root');if(!root)fail(new Error('找不到這座花園。'))},fail),
    onSnapshot(collection(db!,'gardens',gardenId,'memberSummaries'),{includeMetadataChanges:true},s=>{
      if(s.metadata.fromCache)return;
      members=s.docs.map(d=>({id:d.id,...d.data()} as Garden['members'][number]));
      ready.add('members');
    },fail),
    onSnapshot(doc(db!,'gardens',gardenId,'members',uid,'private','progress'),{includeMetadataChanges:true},s=>{
      if(s.metadata.fromCache)return;
      if(!s.exists()){fail(new Error('進度摘要尚未準備好，請聯絡花園管理者。'));return}
      own={id:uid,...s.data()} as Garden['members'][number];ready.add('own');
    },fail),
  ];
  return()=>{stopped=true;unsubs.forEach(stop=>stop())};
}

type ReadingInput = {bible:number;life:number;cwwl?:number;date:string;note:string;requestId:string;expectedRevision:number;planRevision:number};
async function callMutation(name:string, data:Record<string,unknown>) {
  const call = httpsCallable<Record<string,unknown>,{gained:number;revision?:number}>(functionsClient!, name);
  return (await call(data)).data;
}
export async function recordReading(gardenId:string, data:ReadingInput) {
  return callMutation('recordReading', {gardenId,...data});
}

export async function mutateGarden(gardenId:string, action:string, data:Record<string,unknown>) {
  if(action==="record") return recordReading(gardenId,data as ReadingInput);
  if(action==="profile") return callMutation('updateReadingProfile', {gardenId,name:data.name,bible:data.bible,life:data.life,expectedRevision:data.expectedRevision,planRevision:data.planRevision,cwwl:data.cwwl??0});
  if(action==="plan") return callMutation('updateReadingPlan', {gardenId,...data});
  if(action==="edit") {
    await updateDoc(doc(db!,"gardens",gardenId,"logs",String(data.id)),{note:String(data.note)});
    return {gained:0};
  }
  return callMutation('updateGardenReward',{gardenId,action,...data});
}

// The personal overview needs only the plan and the signed-in reader's summary.
export function watchOwnReading(gardenId:string,uid:string,callback:(garden:Garden)=>void,onError:(error:Error)=>void):Unsubscribe {
  let root:Record<string,unknown>|null=null, own:Garden['members'][number]|null=null, stopped=false;
  const emit=()=>{if(!stopped&&root&&own)callback({
    plan:{book:String(root.book),lifeBook:String(root.lifeBook),bibleTarget:Number(root.bibleTarget),lifeTarget:Number(root.lifeTarget),bibleStep:Number(root.bibleStep),lifeStep:Number(root.lifeStep),revision:Number(root.planRevision??0),enabledTracks:(root.enabledTracks as string[])??['bible','life'],cwwlBookId:root.cwwlBookId==null?null:String(root.cwwlBookId),cwwlTarget:Number(root.cwwlTarget??0)},
    members:[own],logs:[],rewards:[],
  })};
  const stops=[onSnapshotsInSync(db!,emit),
    onSnapshot(gardenRef(gardenId),{includeMetadataChanges:true},snapshot=>{
      if(snapshot.metadata.fromCache)return;
      if(!snapshot.exists()){onError(new Error('找不到花園，請重新整理。'));return}root=snapshot.data();
    },onError),
    onSnapshot(doc(db!,'gardens',gardenId,'members',uid,'private','progress'),{includeMetadataChanges:true},snapshot=>{
      if(snapshot.metadata.fromCache)return;
      if(!snapshot.exists()){onError(new Error('個人進度尚未準備好，請重新整理。'));return}own={id:uid,...snapshot.data()} as Garden['members'][number];
    },onError),
  ];
  return()=>{stopped=true;stops.forEach(stop=>stop())};
}
