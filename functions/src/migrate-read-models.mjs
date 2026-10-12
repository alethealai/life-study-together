import {randomUUID} from 'node:crypto';
import {FieldPath} from 'firebase-admin/firestore';
import {validateMember,validatePlan} from './validation.mjs';
import {writeMemberViews,placementSummary} from './read-models.mjs';

async function* pages(ref) {
  let cursor;
  do {
    let q=ref.orderBy(FieldPath.documentId()).limit(100);
    if(cursor)q=q.startAfter(cursor);
    const page=await q.get();
    yield page.docs;
    cursor=page.size===100?page.docs.at(-1):null;
  }while(cursor);
}

// Run after the integrity audit, under a maintenance window. Resumable and additive.
export async function migrateReadModels(db,gardenId,apply=false) {
  const root=db.doc(`gardens/${gardenId}`), snapshot=await root.get();
  if(!snapshot.exists||snapshot.data().schemaVersion!==2)throw new Error('Run the integrity audit/migration first');
  validatePlan(snapshot.data());
  const report={members:0,rewards:0,placed:0,issues:[]};
  for await(const rows of pages(root.collection('members')))for(const row of rows){
    report.members++;
    try {if(row.data().schemaVersion!==2||row.data().uid!==row.id)throw new Error('Member requires audit');validateMember(row.data(),snapshot.data())}
    catch{report.issues.push(`Member ${row.id} requires integrity review`)}
  }
  for await(const rows of pages(root.collection('rewards')))for(const row of rows){
    report.rewards++;
    const r=row.data();
    if(r.x!==null||r.y!==null){
      report.placed++;
      if(!Number.isInteger(r.x)||!Number.isInteger(r.y)||typeof r.emoji!=='string'||typeof r.uid!=='string')report.issues.push(`Reward ${row.id} has an invalid placement`);
    }
  }
  if(!apply||report.issues.length)return report;
  for await(const rows of pages(root.collection('members')))for(const row of rows){
    await db.runTransaction(async tx=>{
      const [gs,ms]=await tx.getAll(root,row.ref),g=gs.data(),m=ms.data();
      validateMember(m,g);
      writeMemberViews(tx,root,m);
      tx.set(db.doc(`users/${row.id}/gardens/${gardenId}`),{gardenId,name:g.name??'共讀花園',role:m.role,
        ...(g.ownerUid===row.id&&g.inviteCode?{inviteCode:g.inviteCode}:{})},{merge:true});
    });
  }
  for await(const rows of pages(root.collection('rewards')))for(const row of rows){
    await db.runTransaction(async tx=>{
      const rs=await tx.get(row.ref),r=rs.data();
      if(r.x===null&&r.y===null)return;
      const gs=await tx.get(root),m=await tx.get(root.collection('members').doc(r.uid));
      if(!m.exists)throw new Error('Placement has no member');
      const id=r.placementId??randomUUID();
      tx.update(row.ref,{placementId:id});
      tx.set(root.collection('placements').doc(id),placementSummary(r));
      tx.set(root.collection('placementLinks').doc(id),{uid:r.uid,rewardId:row.id});
      tx.update(root,{hasPlacedEmoji:true,placementRevision:(gs.data().placementRevision??0)+1});
    });
  }
  await root.set({readModelVersion:1},{merge:true});
  return report;
}
