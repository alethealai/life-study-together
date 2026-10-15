import {FieldValue} from 'firebase-admin/firestore';
import {createGardenService} from './service.mjs';
import {enabledTracks,cwwlBook} from './cwwl.mjs';
import {BOOKS,CHAPTERS} from './catalog.mjs';
import {readingBook,readingKinds,readingCaps} from './reading-identity.mjs';
import {fields,requireThat,integer,text,validDate,dateKey,validatePlan,validateMember} from './validation.mjs';
import {writeMemberViews} from './read-models.mjs';
import lifeLengths from './life-lengths.json' with {type:'json'};

// Existing mutation routines share one transaction. Delay writes until every
// participant has been read and validated (Firestore requires reads first).
function bufferedTransaction(tx) {
  const writes=[];
  const proxy={get:ref=>tx.get(ref),getAll:(...refs)=>tx.getAll(...refs)};
  for(const method of ['create','set','update','delete'])proxy[method]=(...args)=>writes.push([method,args]);
  return {tx:proxy,flush(){
    requireThat(writes.length<=450,'本次同步影響的獎勵太多，請縮小新增閱讀範圍。');
    for(const [method,args] of writes)tx[method](...args);
  }};
}
function authenticated(uid) { requireThat(typeof uid==='string'&&uid.length>0,'請先登入。','unauthenticated'); }
function requestId(id) {requireThat(typeof id==='string'&&/^[0-9a-f-]{36}$/.test(id),'請求代碼不正確。');}
export function createCrossGardenService(db,now=()=>new Date()) {
  const service=createGardenService(db,now);
  const receiptRef=(uid,id)=>db.doc(`users/${uid}/readingRequests/${id}`);
  async function record(uid,data) {
    authenticated(uid);
    fields(data,['requestId','kind','book','from','to','date','note','merge','targets']);requestId(data.requestId);
    requireThat(readingKinds.includes(data.kind)&&text(data.book,1,200)&&integer(data.from)&&integer(data.to,data.from)
      &&validDate(data.date)&&data.date<=dateKey(now())&&text(data.note,0,2000)&&typeof data.merge==='boolean','閱讀資料格式不正確。');
    const max=data.kind==='bible'?CHAPTERS[BOOKS.indexOf(data.book)]:data.kind==='life'?lifeLengths[data.book]:cwwlBook(data.book)?.count;
    requireThat(integer(max,1)&&data.to<=max,'閱讀位置超出書目範圍。');
    requireThat(Array.isArray(data.targets)&&data.targets.length>0&&data.targets.length<=40,'同步花園數量須介於 1 到 40。');
    for(const t of data.targets){fields(t,['gardenId','revision','planRevision']);requireThat(text(t.gardenId,1,128)&&/^[\w-]+$/.test(t.gardenId)&&integer(t.revision,0,Number.MAX_SAFE_INTEGER)&&integer(t.planRevision,0,Number.MAX_SAFE_INTEGER),'同步花園資料不正確。');}
    const targets=[...data.targets].sort((a,b)=>a.gardenId.localeCompare(b.gardenId));
    requireThat(new Set(targets.map(t=>t.gardenId)).size===targets.length,'同步花園不可重複。');
    const payload=JSON.stringify([data.kind,data.book,data.from,data.to,data.date,data.note,data.merge,targets]);
    return db.runTransaction(async raw=>{
      const buffer=bufferedTransaction(raw),tx=buffer.tx,receipt=receiptRef(uid,data.requestId),previous=await tx.get(receipt);
      if(previous.exists){requireThat(!previous.data().withdrawn,'這筆同步已撤回，請重新登記。','failed-precondition');requireThat(previous.data().payload===payload,'同一請求不能用於不同閱讀內容。','already-exists');return previous.data().result;}
      const index=await tx.get(db.collection(`users/${uid}/gardens`).limit(101));
      requireThat(index.size<=100,'花園數量超出本次支援範圍。','failed-precondition');
      const rows=[];
      for(const entry of index.docs){
        const garden=db.doc(`gardens/${entry.id}`),member=garden.collection('members').doc(uid);
        const [gs,ms]=await tx.getAll(garden,member);
        requireThat(gs.exists&&ms.exists&&ms.data().uid===uid,'花園身分已改變，請重新載入。','permission-denied');
        const g=gs.data(),m=ms.data();
        if(enabledTracks(g).includes(data.kind)&&readingBook(g,data.kind)===data.book)rows.push({garden,member,g,m,name:g.name??entry.id});
      }
      requireThat(JSON.stringify(rows.map(r=>r.garden.id).sort())===JSON.stringify(targets.map(t=>t.gardenId).sort()),'相關花園或書目已變更，請重新查看同步範圍。','aborted');
      requireThat(rows.length>0,'沒有符合的共讀花園。');
      for(const row of rows){
        const {g,m}=row,t=targets.find(t=>t.gardenId===row.garden.id);
        requireThat(g.schemaVersion===2&&m.schemaVersion===2,'花園資料尚待核對。','failed-precondition');validatePlan(g);validateMember(m,g);
        requireThat(m.onboardingComplete!==false,'請先完成每個相關花園的起始位置設定。','failed-precondition');
        requireThat(m.revision===t.revision&&g.planRevision===t.planRevision,'進度已更新，請重新查看後再登記。','aborted');
      }
      const current=Math.max(...rows.map(r=>r.m[`${data.kind}Progress`]??0));
      requireThat(data.from===current,'閱讀位置已改變，請重新查看進度。','aborted');
      const differs=rows.some(r=>(r.m[`${data.kind}Progress`]??0)!==current);
      requireThat(!differs||data.merge,'各花園的舊進度不同，請先確認合併。','failed-precondition');
      requireThat(data.to>current||differs,'這次沒有新增閱讀或需合併的進度。');
      const results=[];
      for(const {garden,member,g,m,name} of rows){
        const kind=data.kind,cap=readingCaps[kind],gap=current-(m[`${kind}Progress`]??0);
        if(data.to===current){
          if(gap){const changes={[`base${cap}`]:(m[`base${cap}`]??0)+gap,[`${kind}Progress`]:current,revision:m.revision+1};tx.update(member,changes);writeMemberViews(tx,garden,{...m,...changes});}
          results.push({gardenId:garden.id,name,gained:0});continue;
        }
        const values={bible:m.bibleProgress,life:m.lifeProgress,cwwl:m.cwwlProgress??0,[kind]:data.to};
        const result=await service.record(uid,{gardenId:garden.id,requestId:data.requestId,expectedRevision:m.revision,planRevision:g.planRevision,...values,date:data.date,note:data.note},
          {tx,baseline:{kind,cap,from:current},syncRequestId:data.requestId});
        results.push({gardenId:garden.id,name,...result});
      }
      const result={gained:results.reduce((n,r)=>n+r.gained,0),gardens:results,from:current,to:data.to};
      tx.create(receipt,{payload,result,kind:data.kind,book:data.book,targets:results.map(r=>({gardenId:r.gardenId,name:r.name})),hasReading:data.to>current,createdAt:FieldValue.serverTimestamp()});
      buffer.flush();return result;
    });
  }
  async function previewWithdrawal(uid,data) {
    authenticated(uid);fields(data,['gardenId']);requireThat(text(data.gardenId,1,128)&&/^[\w-]+$/.test(data.gardenId),'花園代碼不正確。');
    return db.runTransaction(async tx=>{
      const member=await tx.get(db.doc(`gardens/${data.gardenId}/members/${uid}`));
      requireThat(member.exists&&member.data().uid===uid,'你不是這座花園的成員。','permission-denied');
      const last=member.data().lastLogId;requireThat(typeof last==='string','目前沒有可撤回的閱讀紀錄。','failed-precondition');
      const log=await tx.get(db.doc(`gardens/${data.gardenId}/logs/${last}`));
      requireThat(log.exists,'閱讀紀錄不存在。','failed-precondition');
      const id=log.data().syncRequestId??null;
      const receipt=id?await tx.get(receiptRef(uid,id)):null;
      requireThat(!id||(receipt.exists&&!receipt.data().withdrawn),'同步紀錄需要核對。','failed-precondition');
      const targets=id?receipt.data().targets:[{gardenId:data.gardenId,name:'目前花園'}];
      const items=[];
      for(const target of targets){
        const impact=await service.previewWithdrawal(uid,{gardenId:target.gardenId},{tx,allowSync:true});
        requireThat(!id||impact.logId===`${uid}-${id}`,'相關花園已有後續閱讀，請先更正較新的紀錄。','failed-precondition');
        items.push({...target,...impact});
      }
      return {requestId:id,items};
    });
  }
  async function withdraw(uid,data) {
    authenticated(uid);fields(data,['requestId','items']);if(data.requestId!==null)requestId(data.requestId);
    requireThat(Array.isArray(data.items)&&data.items.length>0&&data.items.length<=40,'撤回範圍不正確。');
    for(const item of data.items)fields(item,['gardenId','logId','expectedRevision','planRevision','inventoryRevision']);
    return db.runTransaction(async raw=>{
      const buffer=bufferedTransaction(raw),tx=buffer.tx;
      const ref=data.requestId?receiptRef(uid,data.requestId):null,receipt=ref?await tx.get(ref):null;
      if(ref){
        requireThat(receipt.exists&&receipt.data().hasReading,'找不到同步閱讀紀錄。','failed-precondition');
        if(receipt.data().withdrawn)return receipt.data().withdrawalResult;
        const expected=receipt.data().targets.map(t=>t.gardenId).sort();
        requireThat(JSON.stringify(expected)===JSON.stringify(data.items.map(t=>t.gardenId).sort())&&data.items.every(t=>t.logId===`${uid}-${data.requestId}`),'必須一起撤回所有同步花園。');
      }else requireThat(data.items.length===1,'撤回範圍不正確。');
      const items=[];
      for(const item of data.items)items.push(await service.withdraw(uid,item,{tx,allowSync:!!ref}));
      const result={items};if(ref)tx.update(ref,{withdrawn:true,withdrawalResult:result});buffer.flush();return result;
    });
  }
  return {record,previewWithdrawal,withdraw};
}
