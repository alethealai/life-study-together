import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { auditGarden } from './src/audit.mjs';

// Explicit project argument; no accidental fallback to production.
const [projectId, gardenId, flag] = process.argv.slice(2);
if (!projectId || !gardenId || (flag && flag !== '--apply-reviewed')) throw new Error('Usage: node functions/audit-garden.mjs PROJECT GARDEN [--apply-reviewed]');
initializeApp({projectId});
const db = getFirestore(), root = db.doc(`gardens/${gardenId}`);
async function scan(collection) {
  const rows = [];
  let last;
  do {
    let q = collection.orderBy(FieldPath.documentId()).limit(100);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    rows.push(...page.docs.map(d => ({...d.data(), id:d.id})));
    last = page.size === 100 ? page.docs.at(-1) : null;
  } while (last);
  return rows;
}
const snapshot = await root.get();
if (!snapshot.exists) throw new Error('Garden does not exist');
const [members, logs, rewards] = await Promise.all(['members','logs','rewards'].map(c => scan(root.collection(c))));
const periods = (await Promise.all(members.map(m => scan(root.collection('members').doc(m.id).collection('readingPeriods'))))).flat();
const result = auditGarden(snapshot.data(), members, logs, rewards, periods);
console.log(JSON.stringify({gardenId, members:members.length, logs:logs.length, rewards:rewards.length, issues:result.issues, unlabeledLogs:result.unlabeledLogs}, null, 2));
if (result.issues.length) process.exitCode = 1;
else if (flag === '--apply-reviewed') {
  // Run only after new rules block legacy writes and operator reviews backup/audit.
  // Re-read within a transaction and require the audited state to be unchanged.
  await db.runTransaction(async tx => {
    const gs = await tx.get(root);
    const current = await Promise.all(['members','logs','rewards'].map(c => tx.get(root.collection(c))));
    const archives = await Promise.all(current[0].docs.map(m => tx.get(m.ref.collection('readingPeriods'))));
    const checked = auditGarden(gs.data(), ...current.map(s => s.docs.map(d => ({...d.data(),id:d.id}))), archives.flatMap(s => s.docs.map(d => d.data())));
    if (checked.issues.length) throw new Error('Audit changed; no migration applied');
    if (checked.patches.length > 400) throw new Error('Too many members for this closed-test migration');
    for (const p of checked.patches) tx.update(root.collection('members').doc(p.id), p.data);
    tx.update(root, checked.gardenPatch);
  });
  console.log('Applied metadata only. Accounts, logs, rewards and existing progress retained.');
}
