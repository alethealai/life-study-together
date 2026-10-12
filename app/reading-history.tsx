"use client";
import {useState} from 'react';
import {type QueryDocumentSnapshot} from 'firebase/firestore';
import {usePrivatePages,PageControls} from './private-reading';

type Period={id:string;book:string;kind:string;base:number;progress:number;read:number};
function mapPeriod(d:QueryDocumentSnapshot):Period {const x=d.data();return {id:d.id,book:String(x.book),kind:String(x.kind),base:Number(x.base),progress:Number(x.progress),read:Number(x.read)}}
export default function ReadingHistory({gardenId,uid,active,revision}:{gardenId:string;uid:string;active:boolean;revision:number}){
  const [opened,setOpened]=useState(false);
  const data=usePrivatePages(gardenId,uid,'periods',active&&opened,revision,mapPeriod),rows=data.rows;
  return <section className="section"><h2>過往書卷</h2><p className="muted">換書時保存的個人進度，只有你能查看。</p>
    {rows.map(row=><div className="history" key={row.id}><strong>{row.kind==='cwwl'?'李常受文集 · ':''}{row.book}{row.kind==='life'?'生命讀經':''}</strong><p>已讀至第 {row.progress} {row.kind==='bible'?'章':row.kind==='cwwl'?'個閱讀單元':'篇'}</p><p className="muted">起始位置 {row.base} · 本輪新增閱讀 {row.read} {row.kind==='bible'?'章':row.kind==='cwwl'?'個閱讀單元':'篇'}</p></div>)}
    {opened&&data.loaded&&!rows.length&&<p className="empty">換書後，舊書的進度會保存在這裡。</p>}
    {opened?<PageControls data={data}/>:<button className="outline" onClick={()=>setOpened(true)}>查看過往書卷</button>}
  </section>;
}
