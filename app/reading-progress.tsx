import {BookOpen,NotebookText,LibraryBig,Check} from 'lucide-react';
import StartReading from './start-reading';

export type ReadingRow={id:string;label:string;book:string;title:string;edition:string;current:number;target:number;unit:string;max:number};
const icons={bible:BookOpen,life:NotebookText,cwwl:LibraryBig};
function ReadingIdentity({row,compact=false}:{row:ReadingRow;compact?:boolean}) {
  const Icon=icons[row.id as keyof typeof icons];
  return <div className={`reading-identity${compact?' compact':''}`}>
    <div className={`reading-category reading-category-${row.id}`}>
      <span className="reading-category-icon" aria-hidden="true"><Icon size={compact?18:21}/></span>
      <h3>{row.label}</h3>
    </div>
    <p className="reading-book-title">{row.title}</p>
    {row.edition&&<p className="reading-edition">{row.edition}</p>}
  </div>;
}
export function ReadingProgressCard({row,busy,onComplete,onUpdate,onCatalog}:{row:ReadingRow;busy:boolean;onComplete:()=>void;onUpdate:()=>void;onCatalog:()=>void}) {
  const unit=row.id==='cwwl'?'單元':row.unit;
  return <article className="card reading-progress-card" aria-label={`${row.label}閱讀進度`}>
    <ReadingIdentity row={row}/>
    <p className="reading-current">{row.current>0?<>已讀至第 <strong>{row.current}</strong> {unit}</>:'尚未開始'}</p>
    {row.current<row.max?<div className="reading-session">
      <div className="reading-next-step">
        <div><span className="reading-position-label">接下來讀</span><p>第 <strong>{row.current+1}</strong> {unit}</p></div>
        <StartReading kind={row.id} book={row.book} completed={row.current}/>
      </div>
      <button className="text-button complete-reading" disabled={busy} onClick={onComplete}><Check size={16}/>{`我讀完第 ${row.current+1} ${unit}了`}</button>
    </div>:<p className="reading-complete"><Check size={18}/>這本書已讀完</p>}
    <div className="reading-card-links"><button className="text-button" onClick={onCatalog}>閱讀目錄</button><button className="text-button" disabled={busy} onClick={onUpdate}>更新進度／補登</button></div>
  </article>;
}
export function CompanionReadingProgress({rows,lastReadDate}:{rows:ReadingRow[];lastReadDate?:string|null}) {
  return <div className="companion-progress">
    <ul className="companion-reading-list">{rows.map(row=><li key={row.id}>
      <ReadingIdentity row={row} compact/>
      <div className="companion-position"><span>已讀至</span><strong>{row.current>0?`第 ${row.current} ${row.id==='cwwl'?'單元':row.unit}`:'尚未開始'}</strong></div>
    </li>)}</ul>
    <p className="companion-last-read"><span>最近閱讀</span>{lastReadDate?<time dateTime={lastReadDate}>{lastReadDate.replaceAll('-','／')}</time>:<span>尚未有閱讀紀錄</span>}</p>
  </div>;
}
