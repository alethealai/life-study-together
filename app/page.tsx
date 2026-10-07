"use client";
import {useEffect,useState} from 'react';
import {createUserWithEmailAndPassword,onAuthStateChanged,sendPasswordResetEmail,signInWithEmailAndPassword,signOut,type User} from 'firebase/auth';
import {Leaf} from 'lucide-react';
import GardenApp from './garden-app';
import {auth,firebaseReady} from '@/lib/firebase';
import {claimInvitation,createGarden,findInvitation,watchMembership,type Membership} from '@/lib/firebase-garden';

export default function Home(){
 const [user,setUser]=useState<User|null>(null),[member,setMember]=useState<Membership|null>(null),[loading,setLoading]=useState(firebaseReady),[message,setMessage]=useState(''),[name,setName]=useState('');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[creating,setCreating]=useState(false);
 useEffect(()=>{
  if(window.location.hostname==='alethealai.github.io'){
   window.location.replace('https://life-study-together.firebaseapp.com/');
   return;
  }
  if(!auth)return
  let stopMembership:(()=>void)|undefined;
  const stopAuth=onAuthStateChanged(auth,u=>{
   stopMembership?.();stopMembership=undefined;setUser(u);setMember(null);setLoading(!!u);
   if(!u){setLoading(false);return}
   stopMembership=watchMembership(u.uid,m=>{setMember(m);setLoading(false)},()=>{setMember(null);setLoading(false)});
  });
  return()=>{stopMembership?.();stopAuth()};
 },[]);
 async function authenticate(e:React.FormEvent){e.preventDefault();if(!auth)return;setMessage('');setLoading(true);try{if(creating)await createUserWithEmailAndPassword(auth,email.trim(),password);else await signInWithEmailAndPassword(auth,email.trim(),password);}catch(error){setLoading(false);setMessage(authMessage(error));}}
 async function resetPassword(){if(!auth)return;if(!email.trim()){setMessage('請先輸入你的 Email。');return}setMessage('');try{auth.languageCode='zh-TW';await sendPasswordResetEmail(auth,email.trim(),{url:'https://life-study-together.firebaseapp.com/'});setMessage('設定密碼的信已寄出，請開啟信件中的連結。')}catch(error){setMessage(authMessage(error));}}
 async function join(){if(!user)return;setLoading(true);setMessage('');try{const invite=await findInvitation(user);if(invite.exists())await claimInvitation(user);else await createGarden(user,name||user.displayName||'花園主人');}catch(e){setMessage(e instanceof Error?e.message:'無法加入花園。若花園已建立，請請管理員邀請你的 Gmail。')}finally{setLoading(false)}}
 if(!firebaseReady)return <Gate title="尚未連接 Firebase" detail="網站程式已準備好，完成 Firebase 專案設定後即可登入並共享進度。"/>;
 if(loading)return <Gate title="正在進入共讀花園…" detail="正在確認你的帳號與花園身分。"/>;
 if(!user)return <Gate title="一起讀，一起慢慢成長" detail="用自己的 Email 登入，每個人只能更新自己的閱讀進度。"><form className="gate-form auth-form" onSubmit={authenticate}><label>Email<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label><label>密碼<input type="password" required minLength={6} autoComplete={creating?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="至少 6 個字元"/></label><button className="primary" type="submit">{creating?'建立帳號':'登入'}</button><div className="auth-actions"><button className="text-button" type="button" onClick={()=>{setCreating(!creating);setMessage('')}}>{creating?'已有帳號？返回登入':'第一次加入？建立帳號'}</button><button className="text-button" type="button" onClick={resetPassword}>設定／忘記密碼</button></div><p className="muted auth-note">原本曾使用 Google 的成員，請用同一個 Gmail 點「設定／忘記密碼」。</p></form>{message&&<p className="gate-error">{message}</p>}</Gate>;
 if(!member)return <Gate title="加入共讀花園" detail="受邀的同伴可直接加入；若這是第一個帳號，輸入名字來建立花園。"><div className="gate-form"><label>你的顯示名稱<input value={name} maxLength={12} onChange={e=>setName(e.target.value)} placeholder={user.displayName??'我的名字'}/></label><button className="primary" onClick={join}>確認我的身分</button><button className="text-button" onClick={()=>signOut(auth!)}>登出</button></div>{message&&<p className="gate-error">{message}</p>}</Gate>;
 const isDeveloper=member.role==='developer'||member.role==='owner';
 return <GardenApp uid={user.uid} email={user.email??''} isDeveloper={isDeveloper} onSignOut={()=>signOut(auth!)}/>;
}
function Gate({title,detail,children}:{title:string;detail:string;children?:React.ReactNode}){return <main className="auth-gate"><div className="gate-card"><div className="gate-mark"><Leaf size={28}/></div><p className="eyebrow">LIFE STUDY TOGETHER</p><h1>{title}</h1><p className="muted">{detail}</p>{children}</div></main>}
function authMessage(error:unknown){const code=typeof error==='object'&&error&&'code' in error?String(error.code):'';if(code==='auth/invalid-credential'||code==='auth/wrong-password'||code==='auth/user-not-found')return 'Email 或密碼不正確。';if(code==='auth/email-already-in-use')return '這個 Email 已有帳號，請返回登入或設定密碼。';if(code==='auth/weak-password')return '密碼至少需要 6 個字元。';if(code==='auth/invalid-email')return 'Email 格式不正確。';if(code==='auth/too-many-requests')return '嘗試次數太多，請稍後再試。';return '目前無法完成登入，請稍後再試。'}
