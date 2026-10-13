"use client";
import {useState} from 'react';
import type {User} from 'firebase/auth';
import {joinGarden} from '@/lib/firebase-garden';
import {JOIN_EMOJIS,parseInviteCode} from '@/lib/invite-code.mjs';

export default function JoinGardenForm({user,onJoined}:{user:User;onJoined:(id:string)=>void}) {
  const [code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const parsed=parseInviteCode(code),selected=parsed.emojis;
  return <form onSubmit={async e=>{
    e.preventDefault();if(!parsed.valid||busy)return;setBusy(true);setError('');
    try{onJoined(await joinGarden(user,selected.join('')))}catch(err){setError(err instanceof Error?err.message:'無法加入，請重試。')}finally{setBusy(false)}
  }}>
    <label>花園邀請碼<input value={code} onChange={e=>setCode(e.target.value)} placeholder="貼上六個 emoji，或在下方依序選擇" autoComplete="off"/></label>
    <div className="emoji-code"><div className="emoji-code-slots">{Array.from({length:6},(_,i)=><button key={i} type="button" aria-label={`邀請碼第 ${i+1} 格`} onClick={()=>setCode(selected.slice(0,i).join(''))}>{selected[i]??'·'}</button>)}</div>
      <div className="emoji-code-picker">{JOIN_EMOJIS.map(emoji=><button key={emoji} type="button" disabled={selected.includes(emoji)||selected.length>=6} onClick={()=>setCode([...selected,emoji].join(''))}>{emoji}</button>)}</div>
      <button className="text-button" type="button" onClick={()=>setCode('')}>重新輸入</button>
    </div>
    {code&&!parsed.valid&&<p className="muted">邀請碼是六個不同的 emoji，順序也要相同。</p>}
    <button className="primary full" disabled={busy||!parsed.valid}>{busy?'正在加入…':'加入這座花園'}</button>
    {error&&<p role="alert" className="gate-error">{error}</p>}
  </form>;
}
