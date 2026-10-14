'use client';
import {useRef,useState,type PointerEvent} from 'react';
import {Check} from 'lucide-react';
import {draggedPlacement} from '@/lib/placement-drag.mjs';

type Point={x:number;y:number};
type View=Point&{z:number};
export default function PlacementPreview({emoji,point,view,style,busy,canvas,onChange,onConfirm}:{
  emoji:string;point:Point;view:View;style:{left:number;top:number};busy:boolean;
  canvas:()=>HTMLDivElement|null;onChange:(point:Point)=>void;onConfirm:()=>void;
}) {
  const gesture=useRef<{id:number;start:Point;offset:Point}|null>(null);
  const [dragging,setDragging]=useState(false);
  function move(e:PointerEvent<HTMLButtonElement>){
    const g=gesture.current,rect=canvas()?.getBoundingClientRect();
    if(!g||e.pointerId!==g.id||!rect)return;
    onChange(draggedPlacement({x:e.clientX,y:e.clientY},g.offset,rect,view));
  }
  function cancel(){const g=gesture.current;if(!g)return;gesture.current=null;setDragging(false);onChange(g.start)}
  return <div className={`candidate${dragging?' dragging':''}`} style={style} onPointerDown={e=>e.stopPropagation()} onPointerMove={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
    <button type="button" className="placement-handle" disabled={busy} aria-label={`拖移 ${emoji}，也可使用方向鍵微調位置`} onContextMenu={e=>e.preventDefault()}
      onPointerDown={e=>{
        e.stopPropagation();if(busy||gesture.current||!e.isPrimary||e.button!==0)return;
        const rect=canvas()?.getBoundingClientRect();if(!rect)return;
        const under={x:view.x+(e.clientX-rect.left-rect.width/2)/view.z,y:view.y+(e.clientY-rect.top-rect.height/2)/view.z};
        gesture.current={id:e.pointerId,start:{...point},offset:{x:point.x-under.x,y:point.y-under.y}};
        e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);
      }}
      onPointerMove={move}
      onPointerUp={e=>{if(gesture.current?.id!==e.pointerId)return;move(e);gesture.current=null;setDragging(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}}
      onPointerCancel={e=>{if(gesture.current?.id===e.pointerId)cancel()}}
      onLostPointerCapture={cancel}
      onKeyDown={e=>{
        const delta:Record<string,Point>={ArrowLeft:{x:-10,y:0},ArrowRight:{x:10,y:0},ArrowUp:{x:0,y:-10},ArrowDown:{x:0,y:10}};
        const d=delta[e.key],rect=canvas()?.getBoundingClientRect();if(!d||!rect||busy)return;e.preventDefault();
        onChange(draggedPlacement({x:rect.left+style.left+d.x,y:rect.top+style.top+d.y},{x:0,y:0},rect,view));
      }}><span aria-hidden="true">{emoji}</span></button>
    <button type="button" disabled={busy||dragging} className="primary placement-confirm" onClick={onConfirm}>{busy?'儲存中…':'確認放置'} <Check size={14}/></button>
  </div>;
}
