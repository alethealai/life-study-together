"use client";
import {useState} from 'react';
import {CWWL_BOOKS,cwwlBook} from '@/functions/src/cwwl.mjs';

type Props={tracks:string[];onTracks:(tracks:string[])=>void;bookId:string|null;onBook:(id:string)=>void};
export default function ReadingOptions({tracks,onTracks,bookId,onBook}:Props){
 const [search,setSearch]=useState(''),[era,setEra]=useState('');
 const selected=cwwlBook(bookId),eras=[...new Set(CWWL_BOOKS.map(b=>b.era))];
 const matches=CWWL_BOOKS.filter(b=>(!era||b.era===era)&&(!search||`${b.era} ${b.title}`.includes(search.trim())));
 return <fieldset><legend>這座花園要讀什麼</legend><div className="reading-options">{[['bible','聖經'],['life','生命讀經'],['cwwl','李常受文集']].map(([kind,label])=><label key={kind}><input type="checkbox" checked={tracks.includes(kind)} onChange={e=>onTracks(e.target.checked?[...tracks,kind]:tracks.filter(t=>t!==kind))}/>{label}</label>)}</div>
 {tracks.length===0&&<p role="alert">請至少選擇一項。</p>}
 {tracks.includes('cwwl')&&<><label>文集年份／分類<select value={era} onChange={e=>setEra(e.target.value)}><option value="">全部年份／分類</option>{eras.map(e=><option key={e} value={e}>{e}</option>)}</select></label><label>搜尋文集書名<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="輸入書名或年份"/></label><label>文集書目<select value={bookId??''} required onChange={e=>onBook(e.target.value)}><option value="" disabled>選擇年份、冊與書名</option>{selected&&!matches.some(b=>b.id===selected.id)&&<option value={selected.id}>{selected.era} · 第 {selected.volume} 冊 · {selected.title}</option>}{matches.map(b=><option value={b.id} key={b.id} disabled={!b.count}>{b.era} · 第 {b.volume} 冊 · {b.title}（{b.count} 個閱讀單元）</option>)}</select></label>
 {selected&&<CwwlContents bookId={selected.id}/>}
 <p className="muted">按章篇目錄順序記錄已讀位置，序言等前置內容不計入。每個閱讀單元對應目錄中的一章、篇、課或期。<a href="https://cwwl.twgbr.org/catalog.html" target="_blank" rel="noreferrer">官方目錄</a></p></>}
 </fieldset>;
}
export function CwwlContents({bookId}:{bookId:string}){
 const [units,setUnits]=useState<{title:string;page:string}[]|null>(null),[error,setError]=useState('');
 const [loadedId,setLoadedId]=useState('');
 async function load(){try{const data=await import('@/functions/src/cwwl-data.json');setUnits(data.books.find(b=>b.id===bookId)?.units??[]);setLoadedId(bookId);setError('')}catch{setError('目錄載入失敗，請重試。')}}
 return <div><button type="button" className="text-button" onClick={load}>查看所選書目章篇目錄</button>{loadedId===bookId&&units&&<ol className="cwwl-contents">{units.map((u,i)=><li key={`${i}:${u.page}`}>{u.title} <span className="muted">（第 {u.page} 頁）</span></li>)}</ol>}{error&&<p role="alert">{error}</p>}</div>;
}
