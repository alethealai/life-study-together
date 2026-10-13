"use client";
import {useEffect,useState} from 'react';
import {httpsCallable} from 'firebase/functions';
import {functionsClient} from '@/lib/firebase';

type Impact={logId:string;date:string;expectedRevision:number;planRevision:number;inventoryRevision:number;bible:number;life:number;cwwl:number;book:string;lifeBook:string;cwwlBook:string;afterBible:number;afterLife:number;afterCwwl:number;rewards:{id:string;emoji:string|null;placed:boolean}[];removedPlacements:number};
export default function WithdrawReading({gardenId,onDone,onBusy}:{gardenId:string;onDone:()=>void;onBusy:(busy:boolean)=>void}) {
  const [impact,setImpact]=useState<Impact|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let cancelled=false;
    httpsCallable<{gardenId:string},Impact>(functionsClient!,'previewReadingWithdrawal')({gardenId}).then(r=>{if(!cancelled)setImpact(r.data)}).catch(e=>{if(!cancelled)setError(e.message)});
    return()=>{cancelled=true};
  },[gardenId,retry]);
  return <div>
    {!impact&&!error&&<p role="status">正在確認進度與獎勵…</p>}
    {impact&&<><p>將撤回最近提交的 {impact.date} 閱讀紀錄：</p><ul>
      {!!impact.bible&&<li>聖經 · {impact.book}：撤回 {impact.bible} 章，回到已讀 {impact.afterBible} 章。</li>}
      {!!impact.life&&<li>生命讀經 · {impact.lifeBook}：撤回 {impact.life} 篇，回到已讀 {impact.afterLife} 篇。</li>}
      {!!impact.cwwl&&<li>李常受文集 · {impact.cwwlBook}：撤回 {impact.cwwl} 單元，回到已讀 {impact.afterCwwl} 單元。</li>}
    </ul><p><strong>這次取得的 {impact.rewards.length} 個獎勵會一併撤回，其中 {impact.removedPlacements} 個已放入花園，也會從花園移除。</strong></p>
      {!!impact.rewards.length&&<p aria-label="將撤回的獎勵">{impact.rewards.map(r=>r.emoji??'🎁').join(' ')}</p>}
      <p className="muted">連續閱讀天數也會重新計算。撤回後可以重新填寫正確進度；原始紀錄會私密封存備查。換書不會撤回成果。</p>
      <button className="primary full" disabled={busy} onClick={async()=>{
        setBusy(true);onBusy(true);setError('');try{await httpsCallable(functionsClient!,'withdrawReading')({gardenId,logId:impact.logId,expectedRevision:impact.expectedRevision,planRevision:impact.planRevision,inventoryRevision:impact.inventoryRevision});onDone()}
        catch(e){setError(e instanceof Error?e.message:'撤回失敗，請重試。');setBusy(false)}finally{onBusy(false)}
      }}>{busy?'正在撤回…':'確認撤回這筆紀錄與上述獎勵'}</button>
    </>}
    {error&&<><p role="alert">{error}</p><button className="outline" disabled={busy} onClick={()=>{setImpact(null);setError('');setRetry(n=>n+1)}}>重新查看影響</button></>}
  </div>;
}
