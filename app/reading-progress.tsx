import {BookOpen,NotebookText,LibraryBig} from 'lucide-react';
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
export function ReadingProgressCard({row}:{row:ReadingRow}) {
  const unit=row.id==='cwwl'?'單元':row.unit;
  return <article className="card reading-progress-card" aria-label={`${row.label}閱讀進度`}>
    <ReadingIdentity row={row}/>
    <div className="reading-position">
      <div><span className="reading-position-label">已讀至</span><p><strong>{row.current}</strong><span>{unit}</span></p></div>
      <div className="reading-next"><span className="reading-position-label">接下來讀</span>
        <p>{row.current<row.max?<><span>第</span><strong>{row.current+1}</strong><span>{unit}</span></>:<span className="reading-complete">這本書已讀完</span>}</p>
      </div>
    </div>
    <StartReading kind={row.id} book={row.book} completed={row.current}/>
  </article>;
}
export function SharedReadingGoals({rows}:{rows:ReadingRow[]}) {
  return <ul className="shared-reading-goals">{rows.map(row=><li key={row.id}>
    <ReadingIdentity row={row} compact/>
    <div className="shared-reading-target"><span>今日讀至</span><strong>{row.target>0?`第 ${row.target} ${row.id==='cwwl'?'單元':row.unit}`:'尚未設定'}</strong></div>
  </li>)}</ul>;
}
