"use client";
import {useEffect,useState} from 'react';
import {onAuthStateChanged,signInWithPopup,signOut,type User} from 'firebase/auth';
import {Leaf,LogIn} from 'lucide-react';
import GardenApp from './garden-app';
import {auth,firebaseReady,googleProvider} from '@/lib/firebase';
import {claimInvitation,createGarden,findInvitation,watchMembership,type Membership} from '@/lib/firebase-garden';

export default function Home(){
 const [user,setUser]=useState<User|null>(null),[member,setMember]=useState<Membership|null>(null),[loading,setLoading]=useState(firebaseReady),[message,setMessage]=useState(''),[name,setName]=useState('');
 useEffect(()=>{
  if(!auth)return
  let stopMembership:(()=>void)|undefined;
  const stopAuth=onAuthStateChanged(auth,u=>{
   stopMembership?.();stopMembership=undefined;setUser(u);setMember(null);setLoading(!!u);
   if(!u){setLoading(false);return}
   stopMembership=watchMembership(u.uid,m=>{setMember(m);setLoading(false)},()=>{setMember(null);setLoading(false)});
  });
  return()=>{stopMembership?.();stopAuth()};
 },[]);
 async function login(){setMessage('');try{await signInWithPopup(auth!,googleProvider)}catch(e){const code=typeof e==='object'&&e&&'code' in e?String(e.code):'';setMessage(code==='auth/popup-closed-by-user'||code==='auth/popup-blocked'?'這個內建瀏覽器沒有完成 Google 登入。請用 Safari 或 Chrome 開啟本網站後再登入。':'Google 登入沒有完成，請稍後再試一次。')}}
 async function join(){if(!user)return;setLoading(true);setMessage('');try{const invite=await findInvitation(user);if(invite.exists())await claimInvitation(user);else await createGarden(user,name||user.displayName||'花園主人');}catch(e){setMessage(e instanceof Error?e.message:'無法加入花園。若花園已建立，請請管理員邀請你的 Gmail。')}finally{setLoading(false)}}
 if(!firebaseReady)return <Gate title="尚未連接 Firebase" detail="網站程式已準備好，完成 Firebase 專案設定後即可使用 Google 登入與共享進度。"/>;
 if(loading)return <Gate title="正在進入共讀花園…" detail="正在確認你的帳號與花園身分。"/>;
 if(!user)return <Gate title="一起讀，一起慢慢成長" detail="用 Google 帳號登入後，每個人只能更新自己的閱讀進度。"><button className="primary" onClick={login}><LogIn size={18}/> 使用 Google 帳號登入</button>{message&&<p className="gate-error">{message}</p>}</Gate>;
 if(!member)return <Gate title="加入共讀花園" detail="受邀的同伴可直接加入；若這是第一個帳號，輸入名字來建立花園。"><div className="gate-form"><label>你的顯示名稱<input value={name} maxLength={12} onChange={e=>setName(e.target.value)} placeholder={user.displayName??'我的名字'}/></label><button className="primary" onClick={join}>確認我的身分</button><button className="text-button" onClick={()=>signOut(auth!)}>換一個 Google 帳號</button></div>{message&&<p className="gate-error">{message}</p>}</Gate>;
 return <GardenApp uid={user.uid} email={user.email??''} isOwner={member.role==='owner'} onSignOut={()=>signOut(auth!)}/>;
}
function Gate({title,detail,children}:{title:string;detail:string;children?:React.ReactNode}){return <main className="auth-gate"><div className="gate-card"><div className="gate-mark"><Leaf size={28}/></div><p className="eyebrow">LIFE STUDY TOGETHER</p><h1>{title}</h1><p className="muted">{detail}</p>{children}</div></main>}
