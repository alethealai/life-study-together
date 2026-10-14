'use client';
import {useEffect,useRef,useState} from 'react';
import {Check,ArrowUpRight} from 'lucide-react';
import {nextReadingLink,lifeStudyNumber} from '@/lib/reading-links.mjs';
import {shortenReadingTitle} from '@/lib/reading-ui.mjs';
import type {ReadingRow} from './reading-progress';

type Entry={title:string;href?:string};
export default function ReadingCatalog({row,cwwlId}:{row:ReadingRow;cwwlId?:string|null}) {
  const [entries,setEntries]=useState<Entry[]|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[expanded,setExpanded]=useState<number|null>(null);
  const next=useRef<HTMLLIElement>(null);
  useEffect(()=>{
    let cancelled=false;
    async function load(){
      if(row.id==='life'){
        const data=await import('@/lib/life-study-titles.json');
        const book=data.books.find(b=>b.bookNumber===lifeStudyNumber(row.book));
        if(!book)throw new Error('這個書名尚無對應目錄，仍可用更新進度記錄閱讀。');
        return book.titles.map((title,i)=>({title,href:nextReadingLink('life',row.book,i)?.href}));
      }
      if(row.id==='cwwl'){
        const data=await import('@/functions/src/cwwl-data.json');
        return (data.books.find(b=>b.id===cwwlId)?.units??[]).map(u=>({title:u.title}));
      }
      return Array.from({length:row.max},(_,i)=>({title:`${row.book}第 ${i+1} 章`,href:nextReadingLink('bible',row.book,i)?.href}));
    }
    load().then(rows=>{if(!cancelled){setEntries(rows);setError('')}}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'目錄載入失敗，請重試。')});
    return()=>{cancelled=true};
  },[row.id,row.book,row.max,cwwlId,retry]);
  useEffect(()=>{if(entries)next.current?.scrollIntoView({block:'nearest'})},[entries]);
  if(error)return <div role="alert"><p>{error}</p><button className="outline" onClick={()=>setRetry(n=>n+1)}>重試目錄</button></div>;
  if(!entries)return <p role="status">正在載入目錄…</p>;
  const unit=row.id==='cwwl'?'單元':row.unit;
  return <div className="reading-catalog">
    <p className="catalog-overview">{row.label} · {row.title}{row.edition&&` · ${row.edition}`}<br/>{row.current>0?`已讀至第 ${row.current} ${unit}`:'尚未開始'} · 共 {entries.length} {unit}</p>
    <p className="muted">依目前進度標示已讀；點較長的篇題可展開完整名稱。</p>
    <ol className="reading-catalog-list">{entries.map((entry,i)=>{
      const n=i+1,short=shortenReadingTitle(entry.title),done=n<=row.current;
      return <li key={n} ref={n===row.current+1?next:undefined} className={done?'catalog-done':n===row.current+1?'catalog-next':''}>
        <div className="catalog-entry-heading"><span>第 {n} {unit}</span><span className="catalog-status">{done?<><Check size={14}/>已讀</>:n===row.current+1?'接下來':'未讀'}</span></div>
        <div className="catalog-entry-body">{short!==entry.title?<button type="button" className="catalog-title" aria-expanded={expanded===n} aria-label={`第 ${n} ${unit}篇題：${entry.title}`} onClick={()=>setExpanded(expanded===n?null:n)}>{expanded===n?entry.title:short}</button>:<span className="catalog-title">{entry.title}</span>}
        {entry.href&&<a className="catalog-read" href={entry.href} target="_blank" rel="noopener noreferrer" aria-label={`閱讀第 ${n} ${unit}：${entry.title}（另開分頁）`}>閱讀<ArrowUpRight size={14}/></a>}</div>
      </li>;
    })}</ol>
  </div>;
}
