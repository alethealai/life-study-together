"use client";
import {useEffect,useState} from 'react';
import {createUserWithEmailAndPassword,onAuthStateChanged,sendPasswordResetEmail,signInWithEmailAndPassword,signOut,type User} from 'firebase/auth';
import {Leaf} from 'lucide-react';
import GardenApp from './garden-app';
import {auth,firebaseReady} from '@/lib/firebase';
import {ensureLegacyGardenIndex,joinGarden,JOIN_EMOJIS,watchUserGardens,type GardenSummary} from '@/lib/firebase-garden';

export default function Home(){
 const [user,setUser]=useState<User|null>(null),[gardens,setGardens]=useState<GardenSummary[]>([]),[activeId,setActiveId]=useState(''),[loading,setLoading]=useState(firebaseReady),[message,setMessage]=useState('');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[creating,setCreating]=useState(false);
 useEffect(()=>{
  if(window.location.hostname==='alethealai.github.io'){window.location.replace('https://life-study-together.firebaseapp.com/');return}
  if(!auth)return;
  let stopGardens:(()=>void)|undefined,cancelled=false;
  const stopAuth=onAuthStateChanged(auth,async u=>{
   stopGardens?.();stopGardens=undefined;setUser(u);setGardens([]);setLoading(!!u);
   if(!u){setActiveId('');setLoading(false);return}
   try{await ensureLegacyGardenIndex(u)}catch{}
   if(cancelled)return;
   stopGardens=watchUserGardens(u.uid,rows=>{setGardens(rows);setActiveId(current=>{const remembered=localStorage.getItem('activeGardenId')??'';return rows.some(g=>g.id===current)?current:rows.some(g=>g.id===remembered)?remembered:rows[0]?.id??''});setLoading(false)},()=>{setGardens([]);setLoading(false)});
  });
  return()=>{cancelled=true;stopGardens?.();stopAuth()};
 },[]);
 async function authenticate(e:React.FormEvent){e.preventDefault();if(!auth)return;setMessage('');setLoading(true);try{if(creating)await createUserWithEmailAndPassword(auth,email.trim(),password);else await signInWithEmailAndPassword(auth,email.trim(),password)}catch(error){setLoading(false);setMessage(authMessage(error))}}
 async function resetPassword(){if(!auth)return;if(!email.trim()){setMessage('請先輸入你的 Email。');return}setMessage('');try{auth.languageCode='zh-TW';await sendPasswordResetEmail(auth,email.trim(),{url:'https://life-study-together.firebaseapp.com/'});setMessage('設定密碼的信已寄出，請開啟信件中的連結。')}catch(error){setMessage(authMessage(error))}}
 const selectGarden=(id:string)=>{setActiveId(id);localStorage.setItem('activeGardenId',id)};
 if(!firebaseReady)return <Gate title="尚未連接 Firebase" detail="網站程式已準備好，完成 Firebase 專案設定後即可登入並共享進度。"/>;
 if(loading)return <Gate title="正在進入共讀花園…" detail="正在確認你的帳號與花園身分。"/>;
 if(!user)return <Gate title="一起讀，一起慢慢成長" detail="用自己的 Email 登入，每個人只能更新自己的閱讀進度。"><form className="gate-form auth-form" onSubmit={authenticate}><label>Email<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label><label>密碼<input type="password" required minLength={6} autoComplete={creating?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="至少 6 個字元"/></label><button className="primary" type="submit">{creating?'建立帳號':'登入'}</button><div className="auth-actions"><button className="text-button" type="button" onClick={()=>{setCreating(!creating);setMessage('')}}>{creating?'已有帳號？返回登入':'第一次加入？建立帳號'}</button><button className="text-button" type="button" onClick={resetPassword}>設定／忘記密碼</button></div><p className="muted auth-note">原本曾使用 Google 的成員，請用同一個 Gmail 點「設定／忘記密碼」。</p></form>{message&&<p className="gate-error">{message}</p>}</Gate>;
 if(!gardens.length)return <JoinGate user={user} onJoined={selectGarden} onSignOut={()=>signOut(auth!)}/>;
 const active=gardens.find(g=>g.id===activeId)??gardens[0],isDeveloper=gardens.some(g=>g.role==='developer'||g.role==='owner');
 return <GardenApp key={active.id} user={user} garden={active} gardens={gardens} isDeveloper={isDeveloper} onSelectGarden={selectGarden} onSignOut={()=>signOut(auth!)}/>;
}
function JoinGate({user,onJoined,onSignOut}:{user:User;onJoined:(id:string)=>void;onSignOut:()=>void}){const [code,setCode]=useState<string[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');const submit=async()=>{if(code.length!==6)return;setBusy(true);setMessage('');try{onJoined(await joinGarden(user,code.join('')))}catch(e){setMessage(e instanceof Error?e.message:'無法加入花園。')}finally{setBusy(false)}};return <Gate title="加入共讀花園" detail="依序選擇花園主人給你的六個 emoji。"><EmojiCode value={code} onChange={setCode}/><button className="primary full" disabled={busy||code.length!==6} onClick={submit}>{busy?'正在加入…':'加入這座花園'}</button><button className="text-button full" onClick={onSignOut}>登出</button>{message&&<p className="gate-error">{message}</p>}</Gate>}
function EmojiCode({value,onChange}:{value:string[];onChange:(value:string[])=>void}){return <div className="emoji-code"><div className="emoji-code-slots">{Array.from({length:6},(_,i)=><button key={i} type="button" onClick={()=>onChange(value.slice(0,i))}>{value[i]??'·'}</button>)}</div><div className="emoji-code-picker">{JOIN_EMOJIS.map(emoji=><button key={emoji} type="button" disabled={value.includes(emoji)||value.length===6} onClick={()=>onChange([...value,emoji])}>{emoji}</button>)}</div><button className="text-button" type="button" disabled={!value.length} onClick={()=>onChange([])}>重新輸入</button></div>}
function Gate({title,detail,children}:{title:string;detail:string;children?:React.ReactNode}){return <main className="auth-gate"><div className="gate-card"><div className="gate-mark"><Leaf size={28}/></div><p className="eyebrow">LIFE STUDY TOGETHER</p><h1>{title}</h1><p className="muted">{detail}</p>{children}</div></main>}
function authMessage(error:unknown){const code=typeof error==='object'&&error&&'code' in error?String(error.code):'';if(code==='auth/invalid-credential'||code==='auth/wrong-password'||code==='auth/user-not-found')return 'Email 或密碼不正確。';if(code==='auth/email-already-in-use')return '這個 Email 已有帳號，請返回登入或設定密碼。';if(code==='auth/weak-password')return '密碼至少需要 6 個字元。';if(code==='auth/invalid-email')return 'Email 格式不正確。';if(code==='auth/too-many-requests')return '嘗試次數太多，請稍後再試。';return '目前無法完成登入，請稍後再試。'}
