"use client";
import {useState} from 'react';
import {mutateGarden} from '@/lib/firebase-garden';
import {BOOKS,CHAPTERS,type Garden,type Member} from '@/lib/garden';
import {enabledTracks,cwwlBook,cwwlLabel} from '@/functions/src/cwwl.mjs';

export default function ReadingOnboarding({gardenId,gardenName,plan,member,onSignOut}:{gardenId:string;gardenName:string;plan:Garden['plan'];member:Member;onSignOut:()=>void}) {
  const [name,setName]=useState(['新同伴','花園主人'].includes(member.name)?'':member.name);
  const [bible,setBible]=useState(member.baseBible),[life,setLife]=useState(member.baseLife),[cwwl,setCwwl]=useState(member.baseCwwl??0);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const tracks=enabledTracks(plan);
  return <main className="auth-gate"><div className="gate-card"><p className="eyebrow">歡迎來到 {gardenName}</p><h1>從這裡開始共讀</h1>
    <p className="muted">先設定同伴看得到的暱稱，以及你加入前已讀完的位置。每座花園分開記錄。</p>
    <form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{
      await mutateGarden(gardenId,'profile',{name,bible,life,cwwl,expectedRevision:member.revision??0,planRevision:plan.revision??0});
    }catch(err){setError(err instanceof Error?err.message:'設定失敗，請重試。');setBusy(false)}}}>
      <label>你的暱稱<input value={name} required maxLength={12} onChange={e=>setName(e.target.value)} autoComplete="nickname"/></label>
      {tracks.includes('bible')&&<label>聖經 · {plan.book}：已讀完幾章<input type="number" min={0} max={CHAPTERS[BOOKS.indexOf(plan.book)]} required value={bible} onChange={e=>setBible(Number(e.target.value))}/></label>}
      {tracks.includes('life')&&<label>生命讀經 · {plan.lifeBook}：已讀完幾篇<input type="number" min={0} max={10000} required value={life} onChange={e=>setLife(Number(e.target.value))}/></label>}
      {tracks.includes('cwwl')&&<label>李常受文集 · {cwwlLabel(plan.cwwlBookId)}：已讀完幾個單元<input type="number" min={0} max={cwwlBook(plan.cwwlBookId)?.count??0} required value={cwwl} onChange={e=>setCwwl(Number(e.target.value))}/></label>}
      <p className="muted">還沒開始請填 0，接下來就從第 1 章／篇開始。起始進度不發獎，加入後新增的閱讀才會取得 emoji。</p>
      {error&&<p role="alert">{error}</p>}
      <button className="primary full" disabled={busy||!name.trim()}>{busy?'正在儲存…':'儲存並進入花園'}</button>
    </form><button className="text-button" onClick={onSignOut}>登出</button>
  </div></main>;
}
