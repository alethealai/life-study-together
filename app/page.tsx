"use client";
import {useEffect,useState} from 'react';
import {GoogleAuthProvider,onAuthStateChanged,signInWithCredential,signOut,type User} from 'firebase/auth';
import {Leaf} from 'lucide-react';
import GardenApp from './garden-app';
import {auth,firebaseReady} from '@/lib/firebase';
import {claimInvitation,createGarden,findInvitation,watchMembership,type Membership} from '@/lib/firebase-garden';

const GOOGLE_CLIENT_ID='205885223248-aovdevm1oh6crsl8lpvs8ecfhec0h0hq.apps.googleusercontent.com';
type GoogleIdentity={accounts:{id:{initialize:(options:{client_id:string;callback:(response:{credential:string})=>void;auto_select?:boolean})=>void;renderButton:(element:HTMLElement,options:Record<string,string|number>)=>void}}};
declare global{interface Window{google?:GoogleIdentity}}

export default function Home(){
 const [user,setUser]=useState<User|null>(null),[member,setMember]=useState<Membership|null>(null),[loading,setLoading]=useState(firebaseReady),[message,setMessage]=useState(''),[name,setName]=useState('');
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
 useEffect(()=>{
  if(loading||user||!auth)return;
  const currentAuth=auth;
  let cancelled=false;
  const render=()=>{
   const host=document.getElementById('google-sign-in');
   if(cancelled||!host||!window.google)return;
   host.replaceChildren();
   window.google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,auto_select:false,callback:async response=>{
    setMessage('');setLoading(true);
    try{await signInWithCredential(currentAuth,GoogleAuthProvider.credential(response.credential));}
    catch{setLoading(false);setMessage('Google 登入沒有完成，請稍後再試一次。');}
   }});
   window.google.accounts.id.renderButton(host,{type:'standard',theme:'filled_blue',size:'large',text:'continue_with',shape:'pill',logo_alignment:'left',width:300,locale:'zh_TW'});
  };
  const existing=document.querySelector<HTMLScriptElement>('script[data-google-identity]');
  if(window.google)render();
  else if(existing)existing.addEventListener('load',render,{once:true});
  else{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client?hl=zh_TW';script.async=true;script.dataset.googleIdentity='true';script.onload=render;script.onerror=()=>setMessage('Google 登入服務載入失敗，請重新整理後再試。');document.head.appendChild(script);}
  return()=>{cancelled=true;existing?.removeEventListener('load',render)};
 },[loading,user]);
 async function join(){if(!user)return;setLoading(true);setMessage('');try{const invite=await findInvitation(user);if(invite.exists())await claimInvitation(user);else await createGarden(user,name||user.displayName||'花園主人');}catch(e){setMessage(e instanceof Error?e.message:'無法加入花園。若花園已建立，請請管理員邀請你的 Gmail。')}finally{setLoading(false)}}
 if(!firebaseReady)return <Gate title="尚未連接 Firebase" detail="網站程式已準備好，完成 Firebase 專案設定後即可使用 Google 登入與共享進度。"/>;
 if(loading)return <Gate title="正在進入共讀花園…" detail="正在確認你的帳號與花園身分。"/>;
 if(!user)return <Gate title="一起讀，一起慢慢成長" detail="用 Google 帳號登入後，每個人只能更新自己的閱讀進度。"><div className="google-login-wrap"><div id="google-sign-in"/></div>{message&&<p className="gate-error">{message}</p>}</Gate>;
 if(!member)return <Gate title="加入共讀花園" detail="受邀的同伴可直接加入；若這是第一個帳號，輸入名字來建立花園。"><div className="gate-form"><label>你的顯示名稱<input value={name} maxLength={12} onChange={e=>setName(e.target.value)} placeholder={user.displayName??'我的名字'}/></label><button className="primary" onClick={join}>確認我的身分</button><button className="text-button" onClick={()=>signOut(auth!)}>換一個 Google 帳號</button></div>{message&&<p className="gate-error">{message}</p>}</Gate>;
 return <GardenApp uid={user.uid} email={user.email??''} isOwner={member.role==='owner'} onSignOut={()=>signOut(auth!)}/>;
}
function Gate({title,detail,children}:{title:string;detail:string;children?:React.ReactNode}){return <main className="auth-gate"><div className="gate-card"><div className="gate-mark"><Leaf size={28}/></div><p className="eyebrow">LIFE STUDY TOGETHER</p><h1>{title}</h1><p className="muted">{detail}</p>{children}</div></main>}
