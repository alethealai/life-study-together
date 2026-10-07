import type { User } from "firebase/auth";
import {
  collection, doc, getDoc, getDocs, onSnapshot, query,
  runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { EMOJIS, initial, type Garden } from "./garden";

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
  return onSnapshot(collection(db!,"users",uid,"gardens"),s=>callback(s.docs.map(d=>({id:d.id,name:String(d.data().name??'共讀花園'),role:d.data().role as Membership['role'],inviteCode:d.data().inviteCode?String(d.data().inviteCode):undefined}))),onError);
}
export async function createNewGarden(user:User,data:{name:string;book:string;lifeBook:string;bibleTarget:number;lifeTarget:number}){
  let code='';for(let i=0;i<5;i++){const candidate=makeJoinCode();if(!(await getDoc(doc(db!,"gardenInvites",candidate))).exists()){code=candidate;break}}
  if(!code)throw new Error('暫時無法產生邀請碼，請再試一次。');
  const ref=doc(collection(db!,"gardens")),batch=writeBatch(db!);
  const plan={...initial().plan,book:data.book,lifeBook:data.lifeBook,bibleTarget:data.bibleTarget,lifeTarget:data.lifeTarget};
  batch.set(ref,{...plan,name:data.name.trim(),inviteCode:code,ownerUid:user.uid,createdAt:serverTimestamp()});
  batch.set(memberRef(ref.id,user.uid),{uid:user.uid,name:user.displayName||user.email?.split('@')[0]||'花園主人',email:user.email,role:'developer',baseBible:0,baseLife:0,bibleProgress:0,lifeProgress:0,bibleRead:0,lifeRead:0,readingDates:[],joinedAt:serverTimestamp()});
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
    bibleRead: 0, lifeRead: 0, readingDates: [], joinedAt: serverTimestamp(),
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
  const emit = () => { if (root) callback({
    plan: { book: String(root.book), lifeBook: String(root.lifeBook), bibleTarget: Number(root.bibleTarget), lifeTarget: Number(root.lifeTarget), bibleStep: Number(root.bibleStep), lifeStep: Number(root.lifeStep) },
    members, logs, rewards,
  }); };
  const unsubs = [
    onSnapshot(gardenRef(gardenId), s => { root = s.exists() ? s.data() : null; emit(); }, onError),
    onSnapshot(collection(db!, "gardens", gardenId, "members"), s => { members = s.docs.map(d => { const x=d.data(); return { id:d.id, name:String(x.name), baseBible:Number(x.baseBible ?? 0), baseLife:Number(x.baseLife ?? 0) }; }); emit(); }, onError),
    onSnapshot(collection(db!, "gardens", gardenId, "logs"), s => { logs = s.docs.map(d => ({ id:d.id, member:String(d.data().uid), date:String(d.data().date), bible:Number(d.data().bible), life:Number(d.data().life), note:String(d.data().note ?? "") })); emit(); }, onError),
    onSnapshot(collection(db!, "gardens", gardenId, "rewards"), s => { rewards = s.docs.map(d => ({ id:d.id, member:String(d.data().uid), emoji:d.data().emoji == null ? null : String(d.data().emoji), source:String(d.data().source), date:String(d.data().date), x:d.data().x == null ? null : Number(d.data().x), y:d.data().y == null ? null : Number(d.data().y) })); emit(); }, onError),
  ];
  return () => unsubs.forEach(u => u());
}

function streakRewards(dates: string[]) {
  const sorted = [...new Set(dates)].sort(); let run=0, earned=0;
  for(let i=0;i<sorted.length;i++){run=i>0&&new Date(sorted[i]).getTime()-new Date(sorted[i-1]).getTime()===86400000?run+1:1;if(run%7===0)earned++;}
  return earned;
}

export async function recordReading(gardenId:string,uid:string, current:Garden, data:{bible:number;life:number;date:string;note:string;requestId:string}) {
  const mref=memberRef(gardenId,uid), lref=doc(db!,"gardens",gardenId,"logs",data.requestId);
  return runTransaction(db!,async tx=>{
    const ms=await tx.get(mref); if(!ms.exists())throw new Error("找不到你的帳號。");
    const m=ms.data(), oldB=Number(m.bibleProgress), oldL=Number(m.lifeProgress);
    if(data.bible<oldB||data.life<oldL)throw new Error("進度不能倒退。");
    const addB=data.bible-oldB,addL=data.life-oldL;if(!addB&&!addL)throw new Error("這次還沒有新增閱讀進度。");
    const oldBR=Number(m.bibleRead??0),oldLR=Number(m.lifeRead??0),newBR=oldBR+addB,newLR=oldLR+addL;
    const dates=[...new Set([...(m.readingDates??[]),data.date])];
    tx.set(lref,{uid,date:data.date,bible:addB,life:addL,note:data.note,createdAt:serverTimestamp()});
    tx.update(mref,{bibleProgress:data.bible,lifeProgress:data.life,bibleRead:newBR,lifeRead:newLR,readingDates:dates});
    let gained=0;
    for(const [kind,oldN,newN,step] of [["bible",oldBR,newBR,current.plan.bibleStep],["life",oldLR,newLR,current.plan.lifeStep]] as const){
      for(let i=Math.floor(oldN/step)+1;i<=Math.floor(newN/step);i++){gained++;const isBible=kind==="bible";tx.set(doc(db!,"gardens",gardenId,"rewards",`${uid}-${kind}-${i}`),{uid,emoji:EMOJIS[Math.floor(Math.random()*EMOJIS.length)],source:`${isBible?'聖經':'生命讀經'}累積閱讀 ${i*step} ${isBible?'章':'篇'}`,date:data.date,x:null,y:null});}
    }
    const oldComb=streakRewards(m.readingDates??[]),newComb=streakRewards(dates);for(let i=oldComb+1;i<=newComb;i++){gained++;tx.set(doc(db!,"gardens",gardenId,"rewards",`${uid}-combo-${i}`),{uid,emoji:null,source:"連續閱讀 7 天 · 自選獎勵",date:data.date,x:null,y:null});}
    return {gained};
  });
}

export async function mutateGarden(gardenId:string,uid:string, current:Garden, action:string, data:Record<string,unknown>) {
  if(action==="record") return recordReading(gardenId,uid,current,data as never);
  if(action==="profile") { const hasLogs=current.logs.some(l=>l.member===uid); const changes:Record<string,unknown>={name:String(data.name)}; if(!hasLogs){changes.baseBible=Number(data.bible);changes.baseLife=Number(data.life);changes.bibleProgress=Number(data.bible);changes.lifeProgress=Number(data.life);} await updateDoc(memberRef(gardenId,uid),changes); return {gained:0}; }
  if(action==="plan") { await updateDoc(gardenRef(gardenId),{book:data.book,lifeBook:data.lifeBook,bibleTarget:data.bibleTarget,lifeTarget:data.lifeTarget,bibleStep:data.bibleStep,lifeStep:data.lifeStep}); return {gained:0}; }
  if(action==="edit") { const log=current.logs.find(l=>l.id===data.id&&l.member===uid); if(!log)throw new Error("只能修改自己的閱讀紀錄。"); await updateDoc(doc(db!,"gardens",gardenId,"logs",String(data.id)),{note:String(data.note)}); return {gained:0}; }
  const reward=current.rewards.find(r=>r.id===data.id&&r.member===uid); if(!reward)throw new Error("只能修改自己的成就。"); const ref=doc(db!,"gardens",gardenId,"rewards",String(data.id));
  if(action==="choose"){if(reward.emoji)throw new Error("這個獎勵已經選過了。");await updateDoc(ref,{emoji:data.emoji});}
  else if(action==="collect")await updateDoc(ref,{x:null,y:null});
  else if(action==="place"){const placed=await getDocs(query(collection(db!,"gardens",gardenId,"rewards"),where("x","!=",null)));const collision=placed.docs.some(d=>d.id!==reward.id&&Math.hypot(Number(d.data().x)-Number(data.x),Number(d.data().y)-Number(data.y))<48);if(collision)throw new Error("這裡離另一個成就太近了，請選一個空位。");await updateDoc(ref,{x:Math.round(Number(data.x)),y:Math.round(Number(data.y))});}
  return {gained:0};
}
