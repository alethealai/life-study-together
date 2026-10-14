import {readingRange} from '@/lib/reading-ui.mjs';

export type RecordBooks = {
  book:string; lifeBook:string; maxBible:number; cwwlBook:string; maxCwwl:number;
  maxLife?:number; startBible?:number; startLife?:number; startCwwl?:number;
  tracks?:string[]; focus?:string;
};
export default function ReadingUpdateFields({books,values,onChange,disabled}:{
  books:RecordBooks;values:Record<string,number>;onChange:(kind:string,value:number)=>void;disabled:boolean;
}) {
  const rows=[
    {id:'bible',label:`聖經 · ${books.book}`,unit:'章',max:books.maxBible,start:books.startBible??values.bible},
    {id:'life',label:`生命讀經 · ${books.lifeBook}`,unit:'篇',max:books.maxLife??10000,start:books.startLife??values.life},
    {id:'cwwl',label:`李常受文集 · ${books.cwwlBook}`,unit:'個閱讀單元',max:books.maxCwwl,start:books.startCwwl??values.cwwl},
  ].filter(r=>(books.tracks??['bible','life']).includes(r.id)&&(!books.focus||books.focus===r.id));
  return <div className="reading-update-fields">{rows.map(r=><div key={r.id} className="reading-update-item">
    <label>{r.label}<span className="reading-update-label">讀完至</span>
      {r.max<=500&&r.start<=r.max?<select aria-label={`${r.label}讀完至`} value={values[r.id]} disabled={disabled} onChange={e=>onChange(r.id,Number(e.target.value))}>
        {Array.from({length:r.max-r.start+1},(_,i)=>r.start+i).map(n=><option key={n} value={n}>{n===0?'尚未開始':`第 ${n} ${r.unit}`}{n===r.start?'（目前位置）':''}</option>)}
      </select>:<input aria-label={`${r.label}讀完至`} type="number" min={r.start} max={Math.max(r.max,r.start)} value={values[r.id]} required disabled={disabled} onChange={e=>onChange(r.id,Number(e.target.value))}/>}
    </label>
    <p className="reading-range" aria-live="polite">{readingRange(r.start,values[r.id],r.unit)??'這項進度尚未增加。'}</p>
  </div>)}</div>;
}
