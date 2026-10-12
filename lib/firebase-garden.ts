import type { User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  collection, doc, getDoc, getDocs, onSnapshot, onSnapshotsInSync, query,
  runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db, functionsClient } from "./firebase";
import { initial, type Garden } from "./garden";

export const GARDEN_ID = "main";
export const JOIN_EMOJIS=['🌱','🌷','🌻','🌳','🍀','🦋','🐈','🐢','🐇','⛵','🪐','⭐'];
const gardenRef = (gardenId: string) => doc(db!, "gardens", gardenId);
const memberRef = (gardenId: string, uid: string) => doc(db!, "gardens", gardenId, "members", uid);
const userGardenRef = (uid:string,gardenId:string) => doc(db!,"users",uid,"gardens",gardenId);

export type Membership = { uid: string; name: string; email: string; role: "developer" | "owner" | "member" };
export type GardenSummary = { id:string; name:string; role:Membership['role']; inviteCode?:string };

function makeJoinCode(){return [...JOIN_EMOJIS].sort(()=>Math.random()-.5).slice(0,6).join('')}
export async function ensureLegacyGardenIndex(user:User){
  if((await getDoc(userGardenRef(user.uid,GARDEN_ID))).exists())return;
  const membership=await getDoc(memberRef(GARDEN_ID,user.uid));
  if(!membership.exists())return;
  const garden=await getDoc(gardenRef(GARDEN_ID));
  const m=membership.data() as Membership;
  await setDoc(userGardenRef(user.uid,GARDEN_ID),{gardenId:GARDEN_ID,name:String(garden.data()?.name??'共讀花園'),role:m.role,joinedAt:serverTimestamp()},{merge:true});
}
export function watchUserGardens(uid:string,callback:(gardens:GardenSummary[])=>void,onError:(e:Error)=>void){
  const rows=new Map<string,GardenSummary>(),listeners=new Map<string,Unsubscribe>();
  const emit=()=>callback([...rows.values()]);
  const stop=onSnapshot(collection(db!,"users",uid,"gardens"),s=>{
    const ids=new Set(s.docs.map(d=>d.id));
    for(const [id,unsubscribe] of listeners)if(!ids.has(id)){unsubscribe();listeners.delete(id);rows.delete(id)}
    for(const d of s.docs){
      if(listeners.has(d.id))continue;
      listeners.set(d.id,onSnapshot(gardenRef(d.id),root=>{
        if(root.exists()){const data=root.data();rows.set(d.id,{id:d.id,name:String(data.name??'共讀花園'),role:d.data().role as Membership['role'],inviteCode:data.inviteCode?String(data.inviteCode):undefined})}else rows.delete(d.id);
        emit();
      },onError));
    }
    if(!s.docs.length)emit();
  },onError);
  return ()=>{stop();listeners.forEach(unsubscribe=>unsubscribe())};
}
export async function renameGarden(gardenId:string,name:string){
  const trimmed=name.trim();
  if(!trimmed||trimmed.length>30)throw new Error('花園名稱請填寫 1–30 個字。');
  await runTransaction(db!,async tx=>{
    const root=await tx.get(gardenRef(gardenId));
    if(!root.exists())throw new Error('找不到這座花園。');
    const code=root.data().inviteCode;
    tx.update(root.ref,{name:trimmed});
    if(code)tx.update(doc(db!,"gardenInvites",String(code)),{name:trimmed});
  });
}
export async function createNewGarden(user:User,data:{name:string;book:string;lifeBook:string;bibleTarget:number;lifeTarget:number;enabledTracks?:string[];cwwlBookId?:string|null}){
  let code='';for(let i=0;i<5;i++){const candidate=makeJoinCode();if(!(await getDoc(doc(db!,"gardenInvites",candidate))).exists()){code=candidate;break}}
  if(!code)throw new Error('暫時無法產生邀請碼，請再試一次。');
  const ref=doc(collection(db!,"gardens")),batch=writeBatch(db!);
  const plan={...initial().plan,book:data.book,lifeBook:data.lifeBook,bibleTarget:data.bibleTarget,lifeTarget:data.lifeTarget,enabledTracks:data.enabledTracks??['bible','life'],cwwlBookId:data.cwwlBookId??null,cwwlTarget:data.cwwlBookId?1:0};
  batch.set(ref,{...plan,name:data.name.trim(),inviteCode:code,ownerUid:user.uid,schemaVersion:2,planRevision:0,readingStarted:false,createdAt:serverTimestamp()});
  batch.set(memberRef(ref.id,user.uid),{uid:user.uid,name:user.displayName||user.email?.split('@')[0]||'花園主人',email:user.email,role:'developer',baseBible:0,baseLife:0,bibleProgress:0,lifeProgress:0,bibleRead:0,lifeRead:0,readingDates:[],schemaVersion:2,revision:0,logCount:0,lastReadDate:null,joinedAt:serverTimestamp()});
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
  const normalized=[...code].filter(x=>JOIN_EMOJIS.includes(x)).join('');
  const invite=await getDoc(doc(db!,"gardenInvites",normalized));
  if(!invite.exists()||invite.data().active!==true)throw new Error('找不到這個花園，請確認六個 emoji 的順序。');
  const gardenId=String(invite.data().gardenId);
  const existingMember=await getDoc(memberRef(gardenId,user.uid));
  const batch = writeBatch(db!);
  if(!existingMember.exists())batch.set(memberRef(gardenId,user.uid), {
    uid:user.uid,name:user.displayName||user.email?.split('@')[0]||'新同伴',email:user.email,role:'member',joinCode:normalized,
    baseBible: 0, baseLife: 0, bibleProgress: 0, lifeProgress: 0,
    bibleRead: 0, lifeRead: 0, readingDates: [], schemaVersion:2, revision:0, logCount:0, lastReadDate:null, joinedAt: serverTimestamp(),
  });
  batch.set(userGardenRef(user.uid,gardenId),{gardenId,name:String(invite.data().name??'共讀花園'),role:existingMember.data()?.role??'member',joinedAt:serverTimestamp()},{merge:true});
  await batch.commit();
  return gardenId;
}

export function watchGarden(gardenId:string,callback: (garden: Garden) => void, onError: (e: Error) => void): Unsubscribe {
  let root: Record<string, unknown> | null = null;
  let members: Garden["members"] = [];
  let logs: Garden["logs"] = [];
  let rewards: Garden["rewards"] = [];
  const ready = new Set<string>();
  let failed = false;
  const fail = (e:Error) => { failed = true; onError(e); };
  const emit = () => { if (!failed && root && ready.size === 4) callback({
    plan: { book: String(root.book), lifeBook: String(root.lifeBook), bibleTarget: Number(root.bibleTarget), lifeTarget: Number(root.lifeTarget), bibleStep: Number(root.bibleStep), lifeStep: Number(root.lifeStep), revision:Number(root.planRevision ?? 0), readingStarted:root.readingStarted === true, enabledTracks:(root.enabledTracks as string[])??['bible','life'],cwwlBookId:root.cwwlBookId==null?null:String(root.cwwlBookId),cwwlTarget:Number(root.cwwlTarget??0) },
    members, logs, rewards,
  }); };
  const unsubs = [
    onSnapshotsInSync(db!, emit),
    onSnapshot(gardenRef(gardenId), s => { root = s.exists() ? s.data() : null; ready.add("root"); if (!root) fail(new Error("找不到這座花園。")); }, fail),
    onSnapshot(collection(db!, "gardens", gardenId, "members"), s => { members = s.docs.map(d => { const x=d.data(); return { id:d.id, name:String(x.name), baseBible:Number(x.baseBible ?? 0), baseLife:Number(x.baseLife ?? 0), archivedBibleRead:Number(x.archivedBibleRead ?? 0), archivedLifeRead:Number(x.archivedLifeRead ?? 0), bibleProgress:Number(x.bibleProgress ?? 0), lifeProgress:Number(x.lifeProgress ?? 0), bibleRead:Number(x.bibleRead ?? 0), lifeRead:Number(x.lifeRead ?? 0), revision:Number(x.revision ?? 0),baseCwwl:Number(x.baseCwwl??0),cwwlProgress:Number(x.cwwlProgress??0),cwwlRead:Number(x.cwwlRead??0),archivedCwwlRead:Number(x.archivedCwwlRead??0), logCount:Number(x.logCount ?? 0), lastReadDate:x.lastReadDate == null ? null : String(x.lastReadDate) }; }); ready.add("members"); }, fail),
    onSnapshot(collection(db!, "gardens", gardenId, "logs"), s => { logs = s.docs.map(d => ({ id:d.id, member:String(d.data().uid), date:String(d.data().date), bible:Number(d.data().bible), life:Number(d.data().life), note:String(d.data().note ?? ""),cwwl:Number(d.data().cwwl??0),cwwlBook:String(d.data().cwwlBook??""), book:d.data().book == null ? undefined : String(d.data().book), lifeBook:d.data().lifeBook == null ? undefined : String(d.data().lifeBook) })); ready.add("logs"); }, fail),
    onSnapshot(collection(db!, "gardens", gardenId, "rewards"), s => { rewards = s.docs.map(d => ({ id:d.id, member:String(d.data().uid), emoji:d.data().emoji == null ? null : String(d.data().emoji), source:String(d.data().source), date:String(d.data().date), x:d.data().x == null ? null : Number(d.data().x), y:d.data().y == null ? null : Number(d.data().y) })); ready.add("rewards"); }, fail),
  ];
  return () => unsubs.forEach(u => u());
}

type ReadingInput = {bible:number;life:number;cwwl?:number;date:string;note:string;requestId:string;expectedRevision:number;planRevision:number};
async function callMutation(name:string, data:Record<string,unknown>) {
  const call = httpsCallable<Record<string,unknown>,{gained:number;revision?:number}>(functionsClient!, name);
  return (await call(data)).data;
}
export async function recordReading(gardenId:string, data:ReadingInput) {
  return callMutation('recordReading', {gardenId,...data});
}

export async function mutateGarden(gardenId:string,uid:string, current:Garden, action:string, data:Record<string,unknown>) {
  if(action==="record") return recordReading(gardenId,data as ReadingInput);
  if(action==="profile") return callMutation('updateReadingProfile', {gardenId,name:data.name,bible:data.bible,life:data.life,expectedRevision:data.expectedRevision,planRevision:data.planRevision,cwwl:data.cwwl??0});
  if(action==="plan") return callMutation('updateReadingPlan', {gardenId,...data});
  if(action==="edit") { const log=current.logs.find(l=>l.id===data.id&&l.member===uid); if(!log)throw new Error("只能修改自己的閱讀紀錄。"); await updateDoc(doc(db!,"gardens",gardenId,"logs",String(data.id)),{note:String(data.note)}); return {gained:0}; }
  const reward=current.rewards.find(r=>r.id===data.id&&r.member===uid); if(!reward)throw new Error("只能修改自己的成就。"); const ref=doc(db!,"gardens",gardenId,"rewards",String(data.id));
  if(action==="choose"){if(reward.emoji)throw new Error("這個獎勵已經選過了。");await updateDoc(ref,{emoji:data.emoji});}
  else if(action==="collect")await updateDoc(ref,{x:null,y:null});
  else if(action==="place"){const placed=await getDocs(query(collection(db!,"gardens",gardenId,"rewards"),where("x","!=",null)));const collision=placed.docs.some(d=>d.id!==reward.id&&Math.hypot(Number(d.data().x)-Number(data.x),Number(d.data().y)-Number(data.y))<48);if(collision)throw new Error("這裡離另一個成就太近了，請選一個空位。");await updateDoc(ref,{x:Math.round(Number(data.x)),y:Math.round(Number(data.y))});}
  return {gained:0};
}
