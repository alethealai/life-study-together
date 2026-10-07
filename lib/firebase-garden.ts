import type { User } from "firebase/auth";
import {
  collection, doc, getDoc, getDocs, onSnapshot, query,
  runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { EMOJIS, initial, type Garden } from "./garden";

export const GARDEN_ID = "main";
const gardenRef = () => doc(db!, "gardens", GARDEN_ID);
const memberRef = (uid: string) => doc(db!, "gardens", GARDEN_ID, "members", uid);
const emailId = (email: string) => email.trim().toLowerCase();

export type Membership = { uid: string; name: string; email: string; role: "developer" | "owner" | "member" };

export async function findInvitation(user: User) {
  return getDoc(doc(db!, "gardens", GARDEN_ID, "allowedEmails", emailId(user.email ?? "")));
}

export async function createGarden(user: User, name: string) {
  const batch = writeBatch(db!);
  batch.set(gardenRef(), { ...initial().plan, ownerUid: user.uid, createdAt: serverTimestamp() });
  batch.set(memberRef(user.uid), {
    uid: user.uid, name: name.trim(), email: user.email, role: "developer",
    baseBible: 0, baseLife: 0, bibleProgress: 0, lifeProgress: 0,
    bibleRead: 0, lifeRead: 0, readingDates: [], joinedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function claimInvitation(user: User) {
  const invite = await findInvitation(user);
  if (!invite.exists()) throw new Error("這個 Google 帳號尚未受邀加入共讀花園。");
  const data = invite.data();
  if(data.claimedUid && data.claimedUid!==user.uid) throw new Error("這個邀請已綁定其他帳號。");
  const batch=writeBatch(db!);
  batch.set(memberRef(user.uid), {
    uid: user.uid, name: data.name, email: user.email, role: "member",
    baseBible: 0, baseLife: 0, bibleProgress: 0, lifeProgress: 0,
    bibleRead: 0, lifeRead: 0, readingDates: [], joinedAt: serverTimestamp(),
  });
  batch.update(invite.ref,{claimedUid:user.uid,claimedAt:serverTimestamp()});
  await batch.commit();
}

export function watchMembership(uid: string, callback: (member: Membership | null) => void, onError: (e: Error) => void) {
  return onSnapshot(memberRef(uid), snap => callback(snap.exists() ? snap.data() as Membership : null), onError);
}

export function watchGarden(callback: (garden: Garden) => void, onError: (e: Error) => void): Unsubscribe {
  let root: Record<string, unknown> | null = null;
  let members: Garden["members"] = [];
  let logs: Garden["logs"] = [];
  let rewards: Garden["rewards"] = [];
  const emit = () => { if (root) callback({
    plan: { book: String(root.book), lifeBook: String(root.lifeBook), bibleTarget: Number(root.bibleTarget), lifeTarget: Number(root.lifeTarget), bibleStep: Number(root.bibleStep), lifeStep: Number(root.lifeStep) },
    members, logs, rewards,
  }); };
  const unsubs = [
    onSnapshot(gardenRef(), s => { root = s.exists() ? s.data() : null; emit(); }, onError),
    onSnapshot(collection(db!, "gardens", GARDEN_ID, "members"), s => { members = s.docs.map(d => { const x=d.data(); return { id:d.id, name:String(x.name), baseBible:Number(x.baseBible ?? 0), baseLife:Number(x.baseLife ?? 0) }; }); emit(); }, onError),
    onSnapshot(collection(db!, "gardens", GARDEN_ID, "logs"), s => { logs = s.docs.map(d => ({ id:d.id, member:String(d.data().uid), date:String(d.data().date), bible:Number(d.data().bible), life:Number(d.data().life), note:String(d.data().note ?? "") })); emit(); }, onError),
    onSnapshot(collection(db!, "gardens", GARDEN_ID, "rewards"), s => { rewards = s.docs.map(d => ({ id:d.id, member:String(d.data().uid), emoji:d.data().emoji == null ? null : String(d.data().emoji), source:String(d.data().source), date:String(d.data().date), x:d.data().x == null ? null : Number(d.data().x), y:d.data().y == null ? null : Number(d.data().y) })); emit(); }, onError),
  ];
  return () => unsubs.forEach(u => u());
}

function streakRewards(dates: string[]) {
  const sorted = [...new Set(dates)].sort(); let run=0, earned=0;
  for(let i=0;i<sorted.length;i++){run=i>0&&new Date(sorted[i]).getTime()-new Date(sorted[i-1]).getTime()===86400000?run+1:1;if(run%7===0)earned++;}
  return earned;
}

export async function recordReading(uid:string, current:Garden, data:{bible:number;life:number;date:string;note:string;requestId:string}) {
  const mref=memberRef(uid), lref=doc(db!,"gardens",GARDEN_ID,"logs",data.requestId);
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
      for(let i=Math.floor(oldN/step)+1;i<=Math.floor(newN/step);i++){gained++;const isBible=kind==="bible";tx.set(doc(db!,"gardens",GARDEN_ID,"rewards",`${uid}-${kind}-${i}`),{uid,emoji:EMOJIS[Math.floor(Math.random()*EMOJIS.length)],source:`${isBible?'聖經':'生命讀經'}累積閱讀 ${i*step} ${isBible?'章':'篇'}`,date:data.date,x:null,y:null});}
    }
    const oldComb=streakRewards(m.readingDates??[]),newComb=streakRewards(dates);for(let i=oldComb+1;i<=newComb;i++){gained++;tx.set(doc(db!,"gardens",GARDEN_ID,"rewards",`${uid}-combo-${i}`),{uid,emoji:null,source:"連續閱讀 7 天 · 自選獎勵",date:data.date,x:null,y:null});}
    return {gained};
  });
}

export async function mutateGarden(uid:string, current:Garden, action:string, data:Record<string,unknown>) {
  if(action==="record") return recordReading(uid,current,data as never);
  if(action==="profile") { const hasLogs=current.logs.some(l=>l.member===uid); const changes:Record<string,unknown>={name:String(data.name)}; if(!hasLogs){changes.baseBible=Number(data.bible);changes.baseLife=Number(data.life);changes.bibleProgress=Number(data.bible);changes.lifeProgress=Number(data.life);} await updateDoc(memberRef(uid),changes); return {gained:0}; }
  if(action==="plan") { await updateDoc(gardenRef(),{book:data.book,lifeBook:data.lifeBook,bibleTarget:data.bibleTarget,lifeTarget:data.lifeTarget,bibleStep:data.bibleStep,lifeStep:data.lifeStep}); return {gained:0}; }
  if(action==="edit") { const log=current.logs.find(l=>l.id===data.id&&l.member===uid); if(!log)throw new Error("只能修改自己的閱讀紀錄。"); await updateDoc(doc(db!,"gardens",GARDEN_ID,"logs",String(data.id)),{note:String(data.note)}); return {gained:0}; }
  const reward=current.rewards.find(r=>r.id===data.id&&r.member===uid); if(!reward)throw new Error("只能修改自己的成就。"); const ref=doc(db!,"gardens",GARDEN_ID,"rewards",String(data.id));
  if(action==="choose"){if(reward.emoji)throw new Error("這個獎勵已經選過了。");await updateDoc(ref,{emoji:data.emoji});}
  else if(action==="collect")await updateDoc(ref,{x:null,y:null});
  else if(action==="place"){const placed=await getDocs(query(collection(db!,"gardens",GARDEN_ID,"rewards"),where("x","!=",null)));const collision=placed.docs.some(d=>d.id!==reward.id&&Math.hypot(Number(d.data().x)-Number(data.x),Number(d.data().y)-Number(data.y))<48);if(collision)throw new Error("這裡離另一個成就太近了，請選一個空位。");await updateDoc(ref,{x:Math.round(Number(data.x)),y:Math.round(Number(data.y))});}
  return {gained:0};
}

export async function saveInvitation(email:string,name:string){
  const ref=doc(db!,"gardens",GARDEN_ID,"allowedEmails",emailId(email));
  const existing=await getDoc(ref);
  if(existing.data()?.claimedUid)throw new Error("這個 Gmail 已經完成綁定，不能改派給其他人。");
  await setDoc(ref,{email:emailId(email),name:name.trim(),claimedUid:null,createdAt:serverTimestamp()});
}
export type Invitation={id:string;email:string;name:string;claimedUid:string|null};
export function watchInvitations(callback:(rows:Invitation[])=>void,onError:(e:Error)=>void){return onSnapshot(collection(db!,"gardens",GARDEN_ID,"allowedEmails"),s=>callback(s.docs.map(d=>({id:d.id,email:String(d.data().email),name:String(d.data().name),claimedUid:d.data().claimedUid?String(d.data().claimedUid):null}))),onError)}
