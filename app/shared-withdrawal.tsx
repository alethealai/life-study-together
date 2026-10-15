'use client';
import {useEffect,useState} from 'react';
import {httpsCallable} from 'firebase/functions';
import {functionsClient} from '@/lib/firebase';
type Item={gardenId:string;name:string;logId:string;expectedRevision:number;planRevision:number;inventoryRevision:number;date:string;bible:number;life:number;cwwl:number;afterBible:number;afterLife:number;afterCwwl:number;rewards:{emoji:string|null}[];removedPlacements:number};
type Impact={requestId:string|null;items:Item[]};
export default function SharedWithdrawal({gardenId,onDone,onBusy}:{gardenId:string;onDone:()=>void;onBusy:(busy:boolean)=>void}) {
 const [impact,setImpact]=useState<Impact|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let cancelled=false;httpsCallable<{gardenId:string},Impact>(functionsClient!,'previewSharedWithdrawal')({gardenId}).then(r=>{if(!cancelled)setImpact(r.data)}).catch(e=>{if(!cancelled)setError(e.message)});return()=>{cancelled=true}},[gardenId,retry]);
 return <div>{!impact&&!error&&<p role="status">正在確認所有相關花園的撤回影響…</p>}{impact&&<>
 <p>將一起撤回以下花園的閱讀紀錄，進度與連續天數會重新計算。</p>
 {impact.items.map(item=><div className="shared-impact" key={item.gardenId}><strong>{item.name}</strong><p>{item.date} · {item.bible?`聖經撤回 ${item.bible} 章，回到第 ${item.afterBible} 章。`:''}{item.life?`生命讀經撤回 ${item.life} 篇，回到第 ${item.afterLife} 篇。`:''}{item.cwwl?`文集撤回 ${item.cwwl} 單元，回到第 ${item.afterCwwl} 單元。`:''}</p><p>收回 {item.rewards.length} 個獎勵，其中 {item.removedPlacements} 個已放入花園。</p></div>)}
 <p className="muted">合併舊進度的起始位置會保留。原始閱讀紀錄會私密封存。</p>
 <button className="primary full" disabled={busy} onClick={async()=>{setBusy(true);onBusy(true);setError('');try{await httpsCallable(functionsClient!,'withdrawSharedReading')({requestId:impact.requestId,items:impact.items.map(({gardenId,logId,expectedRevision,planRevision,inventoryRevision})=>({gardenId,logId,expectedRevision,planRevision,inventoryRevision}))});onDone()}catch(e){setError(e instanceof Error?e.message:'撤回失敗，請重試。')}finally{setBusy(false);onBusy(false)}}}>{busy?'正在一起撤回…':'確認撤回以上花園的閱讀與獎勵'}</button></>}
 {error&&<p role="alert">{error}</p>}{error&&<button className="outline" disabled={busy} onClick={()=>{setImpact(null);setError('');setRetry(n=>n+1)}}>重新查看影響</button>}</div>;
}
