import {FieldValue} from 'firebase-admin/firestore';
import {writeMemberViews} from './read-models.mjs';
import {integer,fields,requireThat,streakRewards} from './validation.mjs';
import {CWWL_STEP} from './cwwl.mjs';

export function createWithdrawalService(db,refs,state,now) {
  async function prepare(tx,garden,m,g,uid,allowSync=false) {
    requireThat(typeof m.lastLogId==='string','目前沒有可撤回的新格式紀錄。','failed-precondition');
    const ref=garden.collection('logs').doc(m.lastLogId),snapshot=await tx.get(ref),l=snapshot.data();
    requireThat(snapshot.exists&&l.uid===uid&&m.logCount>0&&Array.isArray(l.rewardIds)&&typeof l.requestId==='string'&&/^[0-9a-f-]{36}$/.test(l.requestId),'這筆紀錄缺少更正資料，請聯絡管理者核對。','failed-precondition');
    requireThat(!l.syncRequestId || allowSync,'這是跨花園閱讀，請從我的進度一起更正。','failed-precondition');
    const changes={revision:m.revision+1,logCount:m.logCount-1,inventoryRevision:(m.inventoryRevision??0)+1};
    for(const [kind,cap] of [['bible','Bible'],['life','Life'],['cwwl','Cwwl']]) {
      const amount=l[kind]??0, before=l[`before${cap}`], after=l[`after${cap}`];
      requireThat(integer(amount)&&integer(before)&&integer(after)&&after-before===amount,
        '這筆舊紀錄缺少前後進度，請聯絡管理者核對。','failed-precondition');
      if(amount) {
        requireThat((l[`${kind}Period`]??0)===(g[`${kind}Period`]??0)
          && after===(m[`${kind}Progress`]??0),'這筆紀錄的書目已更換或進度已改變，暫不支援撤回。','failed-precondition');
        changes[`${kind}Progress`]=before;
        changes[`${kind}Read`]=(m[`${kind}Read`]??0)-amount;
        requireThat(changes[`${kind}Read`]>=(m[`archived${cap}Read`]??0),'閱讀摘要需要核對。','failed-precondition');
      }
    }
    const sameDay=await tx.get(garden.collection('logs').where('uid','==',uid).where('date','==',l.date).limit(2));
    const dates=sameDay.docs.some(d=>d.id!==ref.id)?m.readingDates:m.readingDates.filter(d=>d!==l.date);
    changes.readingDates=dates;changes.lastReadDate=[...dates].sort().at(-1)??null;
    if(Object.hasOwn(l,'previousLogId'))changes.lastLogId=l.previousLogId;
    else {
      const latest=await tx.get(garden.collection('logs').where('uid','==',uid).orderBy('revision','desc').limit(2));
      requireThat(latest.docs[0]?.id===ref.id,'紀錄順序需要核對。','failed-precondition');
      changes.lastLogId=latest.docs[1]?.id??null;
    }
    const ids=[];
    for(const [kind,oldCount,newCount,step] of [
      ['bible',m.bibleRead,changes.bibleRead??m.bibleRead,g.bibleStep],
      ['life',m.lifeRead,changes.lifeRead??m.lifeRead,g.lifeStep],
      ['cwwl',m.cwwlRead??0,changes.cwwlRead??m.cwwlRead??0,CWWL_STEP],
      ['combo',streakRewards(m.readingDates),streakRewards(dates),1],
    ])for(let i=Math.floor(newCount/step)+1;i<=Math.floor(oldCount/step);i++)ids.push(`${uid}-${kind}-${i}`);
    requireThat(ids.length<=400&&JSON.stringify([...ids].sort())===JSON.stringify([...l.rewardIds].sort()),
      '這筆紀錄的獎勵資料需要核對，尚未撤回任何內容。','failed-precondition');
    const rewards=ids.length?await tx.getAll(...ids.map(id=>garden.collection('rewards').doc(id))):[];
    for(const r of rewards)requireThat(r.exists&&r.data().uid===uid&&r.data().logId===ref.id,
      '獎勵來源需要核對，尚未撤回任何內容。','failed-precondition');
    const placed=rewards.filter(r=>r.data().x!==null);
    requireThat(rewards.length+placed.length<=450,'這筆舊紀錄影響的擺設太多，請聯絡管理者協助更正。','failed-precondition');
    const placements=placed.length?await tx.getAll(...placed.map(r=>{
      requireThat(typeof r.data().placementId==='string','擺設資料尚待核對。','failed-precondition');
      return garden.collection('placements').doc(r.data().placementId);
    })):[];
    for(let i=0;i<placements.length;i++)requireThat(placements[i].exists&&placements[i].data().uid===uid
      &&placements[i].data().x===placed[i].data().x&&placements[i].data().y===placed[i].data().y,
      '擺設位置需要核對，尚未撤回任何內容。','failed-precondition');
    return {ref,l,changes,rewards,placements,preview:{logId:ref.id,date:l.date,
      expectedRevision:m.revision,planRevision:g.planRevision,inventoryRevision:m.inventoryRevision??0,
      bible:l.bible,life:l.life,cwwl:l.cwwl??0,book:l.book,lifeBook:l.lifeBook,cwwlBook:l.cwwlBook??'',
      afterBible:changes.bibleProgress??m.bibleProgress,afterLife:changes.lifeProgress??m.lifeProgress,afterCwwl:changes.cwwlProgress??m.cwwlProgress??0,
      rewards:rewards.map(r=>({id:r.id,emoji:r.data().emoji,placed:r.data().x!==null})),removedPlacements:placements.length}};
  }
  async function previewWithdrawal(uid,data,context={}) {
    fields(data,['gardenId']);const {garden,member}=refs(uid,data);
    return (context.tx?fn=>fn(context.tx):fn=>db.runTransaction(fn))(async tx=>{
      const {g,m}=await state(tx,garden,member,uid);
      return (await prepare(tx,garden,m,g,uid,context.allowSync)).preview;
    });
  }
  async function withdraw(uid,data,context={}) {
    const {garden,member}=refs(uid,data);
    fields(data,['gardenId','logId','expectedRevision','planRevision','inventoryRevision']);
    requireThat(typeof data.logId==='string'&&data.logId.length>0&&data.logId.length<300&&!data.logId.includes('/')
      &&[data.expectedRevision,data.planRevision,data.inventoryRevision].every(n=>integer(n,0,Number.MAX_SAFE_INTEGER)), '撤回資料格式不正確。');
    const receipt=member.collection('requests').doc(`withdraw-${data.logId}`);
    return (context.tx?fn=>fn(context.tx):fn=>db.runTransaction(fn))(async tx=>{
      const {g,m}=await state(tx,garden,member,uid),previous=await tx.get(receipt);
      if(previous.exists)return previous.data().result;
      requireThat(m.lastLogId===data.logId&&m.revision===data.expectedRevision&&g.planRevision===data.planRevision
        &&(m.inventoryRevision??0)===data.inventoryRevision,'進度或擺設已更新，請重新查看撤回影響。','aborted');
      const {ref,l,changes,rewards,placements}=await prepare(tx,garden,m,g,uid,context.allowSync);
      const notice={id:ref.id,date:l.date,at:now().toISOString(),removedRewards:rewards.length,removedPlacements:placements.length,
        emojis:rewards.map(r=>r.data().emoji??'🎁').slice(0,12)};
      // Keep the original reading privately for recovery/audit; remove it from active totals.
      tx.create(member.collection('withdrawnReadings').doc(ref.id),{...l,withdrawnAt:FieldValue.serverTimestamp(),
        rewards:rewards.map(r=>({id:r.id,...r.data()}))});
      tx.delete(ref);
      for(const r of rewards)tx.delete(r.ref);
      for(const p of placements)tx.delete(p.ref);
      // Old opaque links remain server-only; an absent/different reward cannot use them.
      tx.update(member,{...changes,lastCorrection:notice});
      writeMemberViews(tx,garden,{...m,...changes,lastCorrection:notice});
      if(placements.length)tx.update(garden,{placementRevision:(g.placementRevision??0)+1});
      tx.set(member.collection('requests').doc(l.requestId),{withdrawn:true},{merge:true});
      const result={gained:0,revision:changes.revision,...notice};
      tx.create(receipt,{result,createdAt:FieldValue.serverTimestamp()});
      return result;
    });
  }
  return {previewWithdrawal,withdraw};
}
