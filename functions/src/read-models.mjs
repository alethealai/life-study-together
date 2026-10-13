// Explicit allowlists: never spread a private member/reward into a shared document.
export function memberSummary(m) {
  return {uid:m.uid, name:m.name, bibleProgress:m.bibleProgress ?? 0,
    lifeProgress:m.lifeProgress ?? 0, cwwlProgress:m.cwwlProgress ?? 0,
    lastReadDate:m.lastReadDate ?? null};
}

export function privateProgress(m) {
  const result = {uid:m.uid, name:m.name};
  for (const field of ['baseBible','baseLife','baseCwwl','bibleProgress','lifeProgress','cwwlProgress',
    'bibleRead','lifeRead','cwwlRead','archivedBibleRead','archivedLifeRead','archivedCwwlRead',
    'revision','logCount','inventoryRevision']) result[field] = m[field] ?? 0;
  const dates = [...new Set(m.readingDates ?? [])].sort();
  const end = dates.at(-1) ?? null;
  let length = end ? 1 : 0;
  for (let i=dates.length-2; i>=0; i--) {
    if (Date.parse(dates[i+1])-Date.parse(dates[i]) !== 86400000) break;
    length++;
  }
  return {...result, onboardingComplete:m.onboardingComplete!==false, lastLogId:m.lastLogId??null, lastCorrection:m.lastCorrection??null, lastReadDate:m.lastReadDate ?? null, streakEndDate:end, streakLength:length};
}

export function writeMemberViews(tx, garden, m) {
  tx.set(garden.collection('memberSummaries').doc(m.uid), memberSummary(m));
  tx.set(garden.collection('members').doc(m.uid).collection('private').doc('progress'), privateProgress(m));
}

export function placementSummary(r) {
  return {uid:r.uid, emoji:r.emoji, x:r.x, y:r.y};
}
