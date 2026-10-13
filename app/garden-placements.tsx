"use client";
import {useEffect,useState} from 'react';
import {getDocsFromServer,type QueryDocumentSnapshot} from 'firebase/firestore';
import {db} from '@/lib/firebase';
import {placementQuery,gardenOccupancyQuery} from '@/lib/reading-queries.mjs';
import type {Reward} from '@/lib/garden';

export function useGardenOccupancy(gardenId:string,active:boolean,revision:number) {
  const [attempt,setAttempt]=useState(0);
  const key=`${gardenId}:${revision}:${attempt}`;
  const [result,setResult]=useState({key:'',empty:false,error:''});
  useEffect(()=>{
    if(!active)return;
    let cancelled=false;
    getDocsFromServer(gardenOccupancyQuery(db!,gardenId)).then(snapshot=>{
      if(!cancelled)setResult({key,empty:snapshot.empty,error:''});
    }).catch(()=>{
      if(!cancelled)setResult({key,empty:false,error:'無法確認花園擺設，請重試。'});
    });
    return()=>{cancelled=true};
  },[active,gardenId,key]);
  const current=active&&result.key===key;
  return {empty:current&&result.empty,loading:active&&!current,error:current?result.error:'',refresh:()=>setAttempt(n=>n+1)};
}

// Only the visible rectangle (+ padding). No listener or scan over all earned rewards.
export function usePlacements(gardenId:string,active:boolean,revision:number,view:{x:number;y:number;z:number},size:{w:number;h:number}) {
  const [request,setRequest]=useState({key:'',page:0});
  const [result,setResult]=useState<{key:string;rows:Reward[];more:boolean;busy:boolean;error:string}>({key:'',rows:[],more:false,busy:false,error:''});
  const left=Math.floor((view.x-(size.w/2+100)/view.z)/300)*300;
  const right=Math.ceil((view.x+(size.w/2+100)/view.z)/300)*300;
  const top=Math.floor((view.y-(size.h/2+100)/view.z)/300)*300;
  const bottom=Math.ceil((view.y+(size.h/2+100)/view.z)/300)*300;
  const key=`${gardenId}:${left}:${right}:${top}:${bottom}:${revision}`;
  const page=request.key===key?request.page:0;
  const [cache] = useState(()=>new Map<string,{rows:Reward[];cursor:QueryDocumentSnapshot|null;more:boolean;page:number;time:number}>());
  useEffect(()=>{
    if(!active)return;
    let cancelled=false;
    const timer=setTimeout(async()=>{
      const previous=cache.get(key),fresh=previous&&Date.now()-previous.time<60000;
      if(fresh&&previous.page>=page){setResult({key,rows:previous.rows,more:previous.more,busy:false,error:''});return}
      // A rectangle/version change always starts at its first page.
      const append=!!fresh&&page>previous.page;
      setResult({key,rows:append?previous.rows:[],more:false,busy:true,error:''});
      try {
        const snapshot=await getDocsFromServer(placementQuery(db!,gardenId,{left,right,top,bottom},append?previous.cursor:null));
        if(cancelled)return;
        const rows=snapshot.docs.map(d=>{const x=d.data();return {id:d.id,member:String(x.uid),emoji:String(x.emoji),x:Number(x.x),y:Number(x.y),source:'',date:'',placement:true}});
        const value={rows:append?[...previous.rows,...rows]:rows,cursor:snapshot.docs.at(-1)??null,more:snapshot.size===200,page,time:Date.now()};
        cache.set(key,value);
        while(cache.size>8)cache.delete(cache.keys().next().value!);
        setResult({key,rows:value.rows,more:value.more,busy:false,error:''});
      }catch{if(!cancelled)setResult({key,rows:[],more:false,busy:false,error:'無法載入這個區域的擺設，請重試。'})}
    },250);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[active,gardenId,key,left,right,top,bottom,page,cache]);
  return {...result,rows:result.key===key?result.rows:[],more:result.key===key&&result.more,error:result.key===key?result.error:'',loadMore:()=>setRequest({key,page:(cache.get(key)?.page??0)+1}),refresh:()=>{cache.delete(key);setRequest(r=>({key,page:r.page+1}))}};
}
