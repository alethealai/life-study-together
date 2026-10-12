"use client";
import {useEffect,useState,useSyncExternalStore} from 'react';
import {getDocsFromServer,type QueryDocumentSnapshot} from 'firebase/firestore';
import {db} from '@/lib/firebase';
import {privatePageQuery} from '@/lib/reading-queries.mjs';
import {createPageStore} from '@/lib/page-store.mjs';
import type {Log,Reward} from '@/lib/garden';

export function usePrivatePages<T extends {id:string}>(gardenId:string,uid:string,kind:string,active:boolean,revision:number,map:(d:QueryDocumentSnapshot)=>T) {
  const [store] = useState(()=>createPageStore(async (cursor:QueryDocumentSnapshot|null)=>{
    const page = await getDocsFromServer(privatePageQuery(db!,gardenId,uid,kind,cursor));
    return {rows:page.docs.map(map),cursor:page.docs.at(-1)??cursor,more:page.size===(kind==='rewards'?24:12)};
  }));
  const state = useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot) as {rows:T[];busy:boolean;loaded:boolean;more:boolean;error:string};
  useEffect(()=>{if(active)void store.ensure(revision)},[active,revision,store]);
  return {...state,loadMore:store.more,refresh:store.refresh};
}

export function mapLog(d:QueryDocumentSnapshot):Log {
  const x=d.data();
  return {id:d.id,member:String(x.uid),date:String(x.date),bible:Number(x.bible),life:Number(x.life),
    note:String(x.note??''),book:x.book,lifeBook:x.lifeBook,cwwl:Number(x.cwwl??0),cwwlBook:x.cwwlBook};
}
export function mapReward(d:QueryDocumentSnapshot):Reward {
  const x=d.data();
  return {id:d.id,member:String(x.uid),emoji:x.emoji??null,source:String(x.source??''),date:String(x.date??''),x:x.x??null,y:x.y??null};
}
type Pager = {busy:boolean;loaded:boolean;more:boolean;error:string;loadMore:()=>unknown;refresh:()=>unknown};
export function PageControls({data,label='載入更多'}:{data:Pager;label?:string}) {
  return <div className="page-controls">
    {data.error&&<p role="alert">{data.error}</p>}
    {(data.more||data.error)&&<button className="outline" disabled={data.busy} onClick={()=>data.error?data.refresh():data.loadMore()}>{data.busy?'載入中…':data.error?'重試':label}</button>}
    {data.loaded&&!data.busy&&<button className="text-button" onClick={()=>data.refresh()}>重新整理</button>}
  </div>;
}

export function ReadingLogs({gardenId,uid,active,revision,onEdit,editRevision}:{gardenId:string;uid:string;active:boolean;revision:number;editRevision:number;onEdit:(l:Log)=>void}) {
  const [opened,setOpened]=useState(false);
  const data=usePrivatePages(gardenId,uid,'logs',active&&opened,revision+editRevision,mapLog);
  return <section className="section"><h2>閱讀紀錄</h2><p className="muted">閱讀明細與心得只有你能查看，每次載入 12 筆。</p>
    {!opened?<button className="outline" onClick={()=>setOpened(true)}>查看閱讀紀錄</button>:<>
      {data.rows.map(l=><div className="history row" key={l.id}><div><span className="date-label">{l.date}</span><span>{[l.bible?`聖經 · ${l.book??'書卷未記錄'} ${l.bible} 章`:'',l.life?`生命讀經 · ${l.lifeBook??'書卷未記錄'} ${l.life} 篇`:'',l.cwwl?`李常受文集 · ${l.cwwlBook} ${l.cwwl} 個閱讀單元`:''].filter(Boolean).join(' · ')}</span>{l.note&&<p className="muted history-note">{l.note}</p>}</div><button className="text-button" onClick={()=>onEdit(l)}>編輯</button></div>)}
      {data.loaded&&!data.rows.length&&<p className="empty">還沒有閱讀紀錄。</p>}
      <PageControls data={data}/>
    </>}
  </section>;
}
