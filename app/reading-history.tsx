"use client";
import {useRef,useState} from 'react';
import {collection,getDocs,limit,orderBy,query,startAfter,type QueryDocumentSnapshot} from 'firebase/firestore';
import {db} from '@/lib/firebase';

type Period={id:string;book:string;kind:string;base:number;progress:number;read:number};
export default function ReadingHistory({gardenId,uid}:{gardenId:string;uid:string}){
  const [rows,setRows]=useState<Period[]>([]),[opened,setOpened]=useState(false),[busy,setBusy]=useState(false),[more,setMore]=useState(true),[error,setError]=useState('');
  const cursor=useRef<QueryDocumentSnapshot|null>(null),inFlight=useRef(false);
  async function load(){
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    try{
      const base=query(collection(db!, 'gardens',gardenId,'members',uid,'readingPeriods'),orderBy('endedAt','desc'),limit(12));
      const page=await getDocs(cursor.current?query(base,startAfter(cursor.current)):base);
      setRows(previous=>[...previous,...page.docs.map(d=>{const x=d.data();return {id:d.id,book:String(x.book),kind:String(x.kind),base:Number(x.base),progress:Number(x.progress),read:Number(x.read)}})]);
      cursor.current=page.docs.at(-1)??cursor.current;setMore(page.size===12);setOpened(true);
    }catch{setError('無法載入過往書卷，請重試。')}
    finally{inFlight.current=false;setBusy(false)}
  }
  return <section className="section"><h2>過往書卷</h2><p className="muted">換書時保存的個人進度，只有你能查看。</p>
    {rows.map(row=><div className="history" key={row.id}><strong>{row.kind==='cwwl'?'李常受文集 · ':''}{row.book}{row.kind==='life'?'生命讀經':''}</strong><p>已讀至第 {row.progress} {row.kind==='bible'?'章':row.kind==='cwwl'?'個閱讀單元':'篇'}</p><p className="muted">起始位置 {row.base} · 本輪新增閱讀 {row.read} {row.kind==='bible'?'章':row.kind==='cwwl'?'個閱讀單元':'篇'}</p></div>)}
    {opened&&!rows.length&&<p className="empty">換書後，舊書的進度會保存在這裡。</p>}
    {error&&<p role="alert">{error}</p>}
    {more&&<button className="outline" disabled={busy} onClick={load}>{busy?'載入中…':error?'重試':opened?'載入更多':'查看過往書卷'}</button>}
  </section>;
}
