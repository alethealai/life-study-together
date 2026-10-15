'use client';
import {useEffect,useRef,useState} from 'react';
import {httpsCallable} from 'firebase/functions';
import {BookOpen,Layers,Check} from 'lucide-react';
import {functionsClient} from '@/lib/firebase';
import {watchOwnReading,type GardenSummary} from '@/lib/firebase-garden';
import {BOOKS,CHAPTERS,today,type Garden} from '@/lib/garden';
import {enabledTracks,cwwlBook} from '@/functions/src/cwwl.mjs';
import {readingBook} from '@/functions/src/reading-identity.mjs';
import {lifeStudyLength} from '@/lib/reading-links.mjs';
import {ReadingProgressCard,type ReadingRow} from './reading-progress';
import ReadingCatalog from './reading-catalog';
import SharedWithdrawal from './shared-withdrawal';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
type Target={gardenId:string;name:string;revision:number;planRevision:number;current:number;ready:boolean};
type Group={key:string;row:ReadingRow;book:string;targets:Target[]};
type Request={requestId:string;kind:string;book:string;from:number;to:number;date:string;note:string;merge:boolean;targets:{gardenId:string;revision:number;planRevision:number}[]};
export default function SharedReading({uid,gardens,onlyGarden,onSelectGarden}:{uid:string;gardens:GardenSummary[];onlyGarden?:string;onSelectGarden:(id:string)=>void}) {
 const [states,setStates]=useState<Record<string,Garden>>({}),[loadError,setLoadError]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [editor,setEditor]=useState<Group|null>(null),[catalog,setCatalog]=useState<Group|null>(null),[withdraw,setWithdraw]=useState<string|null>(null);
 const [to,setTo]=useState(0),[date,setDate]=useState(today),[note,setNote]=useState(''),[merge,setMerge]=useState(false),[busy,setBusy]=useState(false),[pending,setPending]=useState<Request|null>(()=>{if(typeof window==='undefined')return null;try{return JSON.parse(sessionStorage.getItem(`reading-request:shared:${uid}`)??'null')}catch{return null}});
 const inFlight=useRef(false),storageKey=`reading-request:shared:${uid}`;
 const ids=gardens.map(g=>g.id).sort().join(',');
 useEffect(()=>{
   const rows:Record<string,Garden>={};
   const stops=ids.split(',').filter(Boolean).map(id=>watchOwnReading(id,uid,g=>{rows[id]=g;setStates({...rows})},e=>setLoadError(e.message)));
   return()=>stops.forEach(stop=>stop());
 },[uid,ids]);
 const ready=!loadError&&gardens.every(g=>states[g.id]);
 const grouped=new Map<string,Group>();
 for(const garden of gardens){
  const state=states[garden.id];if(!state)continue;const m=state.members[0],plan=state.plan;
  for(const kind of enabledTracks(plan)){
   const book=readingBook(plan,kind);if(!book)continue;
   const key=JSON.stringify([kind,book]),cwwl=kind==='cwwl'?cwwlBook(book):null;
   const current=kind==='bible'?m.bibleProgress??0:kind==='life'?m.lifeProgress??0:m.cwwlProgress??0;
   const group:Group=grouped.get(key)??{key,book,row:{id:kind,label:kind==='bible'?'聖經':kind==='life'?'生命讀經':'李常受文集',book:kind==='cwwl'?cwwl?.title??book:book,title:cwwl?.title??book,edition:cwwl?`${cwwl.era} · 第 ${cwwl.volume} 冊`:'',current:0,target:0,unit:kind==='bible'?'章':kind==='life'?'篇':'單元',max:kind==='bible'?CHAPTERS[BOOKS.indexOf(book)]:kind==='life'?lifeStudyLength(book)??0:cwwl?.count??0},targets:[]};
   group.row.current=Math.max(group.row.current,current);
   group.targets.push({gardenId:garden.id,name:garden.name,revision:m.revision??0,planRevision:plan.revision??0,current,ready:m.onboardingComplete!==false});grouped.set(key,group);
  }
 }
 const groups=[...grouped.values()].filter(g=>!onlyGarden||g.targets.some(t=>t.gardenId===onlyGarden));
 function openEditor(group:Group,advance=false){setEditor(group);setTo(Math.min(group.row.max,group.row.current+(advance?1:0)));setDate(today());setNote('');setMerge(false);setError('');}
 function request(group:Group,end:number,confirmed=false):Request{return {requestId:crypto.randomUUID(),kind:group.row.id,book:group.book,from:group.row.current,to:end,date:today(),note:'',merge:confirmed,targets:group.targets.map(({gardenId,revision,planRevision})=>({gardenId,revision,planRevision}))};}
 async function submit(data:Request){
   if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setMessage('');sessionStorage.setItem(storageKey,JSON.stringify(data));setPending(data);
   try{const result=await httpsCallable<Request,{gained:number;gardens:{name:string}[]}>(functionsClient!,'recordSharedReading')(data);sessionStorage.removeItem(storageKey);setPending(null);setEditor(null);setMessage(`已同步至 ${result.data.gardens.map(g=>g.name).join('、')}。${result.data.gained?`共獲得 ${result.data.gained} 個花園獎勵。`:''}`)}
   catch(e){const err=e as {code?:string;message?:string};setError(err.message??'儲存失敗，請重試。');if(['functions/aborted','functions/invalid-argument','functions/permission-denied','functions/failed-precondition','functions/unauthenticated','functions/already-exists'].includes(err.code??'')){sessionStorage.removeItem(storageKey);setPending(null);setEditor(null)}}
   finally{inFlight.current=false;setBusy(false)}
 }
 const editorDiffers=editor?.targets.some(t=>t.current!==editor.row.current);
 return <section className="shared-reading" aria-label={onlyGarden?'我的共讀進度':'所有花園的閱讀進度'}>
 {!onlyGarden&&<><div className="reading-overview"><div><span className="overview-icon"><BookOpen size={22}/></span><strong>{groups.length}</strong><span>項閱讀</span></div><div><span className="overview-icon"><Layers size={22}/></span><strong>{gardens.length}</strong><span>座共讀花園</span></div><p>讀一次，記一次。<br/>相同書目的進度，一起更新。</p></div><p className="muted shared-intro">依書目整理所有共讀進度；每張卡片會列出同步的花園。</p></>}
 {!ready&&!loadError&&<p role="status">正在彙整所有花園的進度…</p>}{loadError&&<div className="error-card" role="alert">{loadError}<button className="outline" onClick={()=>window.location.reload()}>重新載入</button></div>}
 {message&&<p className="shared-success" role="status"><Check size={18}/>{message}</p>}{error&&<p className="error-card" role="alert">{error}</p>}
 {pending&&!busy&&<div className="shared-pending"><p>有一筆閱讀尚待確認。重送會確認原本結果，不會重複計算。</p><button className="outline" disabled={busy} onClick={()=>submit(pending)}>重試同步</button></div>}
 <div className="grid progress-grid shared-progress-grid">{groups.map(group=>{
   const differs=group.targets.some(t=>t.current!==group.row.current),unready=group.targets.filter(t=>!t.ready);
   return <div className="shared-reading-item" key={group.key}>
    <div className="shared-gardens"><span>同步花園</span>{group.targets.map(t=><span className="garden-chip" key={t.gardenId}>{t.name}</span>)}</div>
    <ReadingProgressCard row={group.row} busy={!ready||busy||!!pending||unready.length>0||!group.row.max} onComplete={()=>differs?openEditor(group,true):submit(request(group,group.row.current+1))} onUpdate={()=>openEditor(group)} onCatalog={()=>setCatalog(group)}/>
    {differs&&<div className="shared-difference"><strong>舊進度不同，更新前需確認合併</strong><p>{group.targets.map(t=>`${t.name}：${t.current} ${group.row.unit}`).join(' · ')}</p></div>}
    {!!unready.length&&<div className="shared-difference"><p>先完成起始位置設定，再一起同步：</p>{unready.map(t=><button className="text-button" key={t.gardenId} onClick={()=>onSelectGarden(t.gardenId)}>{t.name} →</button>)}</div>}
    <button className="text-button shared-correction" disabled={busy||!!pending} onClick={()=>setWithdraw(group.targets[0].gardenId)}>更正最近一次登記</button>
   </div>;
 })}</div>
 {ready&&!groups.length&&<p className="empty">還沒有正在共讀的書目。</p>}
 <Dialog open={!!editor} onOpenChange={open=>{if(!open&&!busy)setEditor(null)}}><DialogContent className="modal max-h-[88svh] overflow-y-auto"><DialogTitle>更新閱讀進度</DialogTitle><DialogDescription>將讀完的位置同步到這本書的所有共讀花園。</DialogDescription>{editor&&<form onSubmit={e=>{e.preventDefault();submit({...request(editor,to,merge),date,note})}}>
 <h3>{editor.row.label} · {editor.row.title}</h3><p className="muted">同步至 {editor.targets.map(t=>t.name).join('、')}</p>
 {editorDiffers&&<div className="shared-difference"><p>{editor.targets.map(t=>`${t.name}：${t.current} ${editor.row.unit}`).join(' · ')}</p><label className="merge-confirm"><input type="checkbox" checked={merge} required onChange={e=>setMerge(e.target.checked)}/><span>這是同一次閱讀，將舊進度統一到第 {editor.row.current} {editor.row.unit}。差額只作為起始位置，不補發獎勵。</span></label></div>}
 <label>已讀至第幾{editor.row.unit}<input type="number" min={editor.row.current} max={editor.row.max} required value={to} onChange={e=>setTo(Number(e.target.value))}/></label>
 <p className="muted">{to>editor.row.current?`這次新增第 ${editor.row.current+1}–${to} ${editor.row.unit}，包含中間所有內容。`:editorDiffers?'只合併既有進度，不新增閱讀。':'請選擇這次讀完的位置。'}</p>
 <label>閱讀日期<input type="date" required max={today()} value={date} onChange={e=>setDate(e.target.value)}/></label>
 <label>私人心得（選填）<textarea maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label>
 <button className="primary full" disabled={busy||!!pending||to<editor.row.current||to>editor.row.max||(!editorDiffers&&to===editor.row.current)||(!!editorDiffers&&!merge)}>{busy?'正在同步…':'儲存並同步到所有相關花園'}</button>
 </form>}</DialogContent></Dialog>
 <Dialog open={!!catalog} onOpenChange={open=>{if(!open)setCatalog(null)}}><DialogContent className="modal max-h-[88svh] overflow-y-auto"><DialogTitle>閱讀目錄</DialogTitle><DialogDescription>已讀狀態依合併後的閱讀位置顯示。</DialogDescription>{catalog&&<ReadingCatalog row={catalog.row} cwwlId={catalog.row.id==='cwwl'?catalog.book:null}/>}</DialogContent></Dialog>
 <Dialog open={!!withdraw} onOpenChange={open=>{if(!open&&!busy)setWithdraw(null)}}><DialogContent className="modal max-h-[88svh] overflow-y-auto"><DialogTitle>更正最近一次閱讀</DialogTitle><DialogDescription>同步閱讀會一起撤回相關花園，請確認以下影響。</DialogDescription><label>選擇要更正的花園<select value={withdraw??''} disabled={busy} onChange={e=>setWithdraw(e.target.value)}>{gardens.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>{withdraw&&<SharedWithdrawal key={withdraw} gardenId={withdraw} onBusy={setBusy} onDone={()=>{setWithdraw(null);setMessage('相關花園的閱讀已一起更正。')}}/>}</DialogContent></Dialog>
 </section>;
}
