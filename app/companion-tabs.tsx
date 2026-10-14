'use client';
import {useRef} from 'react';

export default function CompanionTabs({members,selectedId,ownId,onSelect}:{
  members:{id:string;name:string}[];selectedId:string;ownId:string;onSelect:(id:string)=>void;
}) {
  const buttons=useRef(new Map<string,HTMLButtonElement>());
  return <div className="members" role="tablist" aria-label="同伴閱讀進度">{members.map((member,i)=><button
    key={member.id} ref={element=>{if(element)buttons.current.set(member.id,element);else buttons.current.delete(member.id)}}
    id={`companion-tab-${member.id}`} role="tab" aria-selected={member.id===selectedId}
    aria-controls="companion-progress-panel" tabIndex={member.id===selectedId?0:-1}
    className={'member '+(member.id===selectedId?'selected':'')}
    onClick={()=>onSelect(member.id)}
    onKeyDown={e=>{
      const next=e.key==='ArrowRight'?(i+1)%members.length:e.key==='ArrowLeft'?(i+members.length-1)%members.length:e.key==='Home'?0:e.key==='End'?members.length-1:null;
      if(next===null)return;e.preventDefault();onSelect(members[next].id);buttons.current.get(members[next].id)?.focus();
    }}>
    <span className={'avatar tone-'+i} aria-hidden="true">{member.name.slice(0,1)}</span>{member.name}{member.id===ownId&&<span className="badge">我</span>}
  </button>)}</div>;
}
