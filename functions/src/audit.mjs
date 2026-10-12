import {CWWL_STEP,cwwlBook} from './cwwl.mjs';
import { EMOJIS } from './catalog.mjs';
import { validatePlan, validateMember, validDate, integer, streakRewards } from './validation.mjs';

// Read-only audit: never infer a historical book from today's plan.
export function auditGarden(garden, members, logs, rewards, periods = []) {
  const issues = [];
  try { validatePlan(garden); } catch { issues.push('共同計畫欄位不合法'); }
  const patches = [];
  const known = new Set(members.map(m => m.id));
  for (const row of [...logs, ...rewards]) if (!known.has(row.uid)) issues.push(`${row.id}: 找不到對應成員`);
  for (const member of members) {
    const mine = logs.filter(l => l.uid === member.id);
    const gifts = rewards.filter(r => r.uid === member.id);
    const bibleRead = mine.reduce((s, l) => s + l.bible, 0), lifeRead = mine.reduce((s, l) => s + l.life, 0);
    const cwwlRead=mine.reduce((sum,l)=>sum+(l.cwwl??0),0);
    const dates = [...new Set(mine.map(l => l.date))].sort();
    const archive = periods.filter(p => p.uid === member.id);
    for (const [kind, cap] of [['bible','Bible'],['life','Life'],['cwwl','Cwwl']]) {
      const history = archive.filter(p => p.kind === kind);
      if (history.some(p => !integer(p.read,0,Number.MAX_SAFE_INTEGER) || !integer(p.base) || !integer(p.progress) || p.progress !== p.base+p.read)
        || history.reduce((sum,p) => sum+p.read,0) !== (member[`archived${cap}Read`] ?? 0)) issues.push(`${member.id}: ${kind} 封存摘要不一致`);
    }
    const candidate = {...member, revision:member.revision ?? 0, logCount:mine.length};
    try { validateMember(candidate, garden); } catch { issues.push(`${member.id}: 摘要欄位或範圍不合法`); }
    if (member.uid !== member.id || !member.joinedAt?.toDate) issues.push(`${member.id}: 身分或加入時間缺漏`);
    if (bibleRead !== member.bibleRead || lifeRead !== member.lifeRead || cwwlRead !== (member.cwwlRead??0)
      || JSON.stringify([...(member.readingDates ?? [])].sort()) !== JSON.stringify(dates)) issues.push(`${member.id}: 摘要與閱讀紀錄不一致`);
    if (member.schemaVersion === 2 && member.logCount !== mine.length) issues.push(`${member.id}: 紀錄筆數不一致`);
    for (const l of mine) if (!integer(l.bible) || !integer(l.life) || l.bible + l.life + (l.cwwl??0) <= 0 || !integer(l.cwwl??0) || ((l.cwwl??0)>0&&!cwwlBook(l.cwwlBookId)) || !validDate(l.date)
      || typeof l.note !== 'string' || l.note.length > 2000) issues.push(`${l.id}: 閱讀紀錄格式不合法`);
    const expected = new Set();
    for (const [kind, count] of [['bible', Math.floor(bibleRead/garden.bibleStep)], ['life', Math.floor(lifeRead/garden.lifeStep)], ['cwwl',Math.floor(cwwlRead/CWWL_STEP)], ['combo', streakRewards(dates)]]) {
      // Reject malformed plans above; avoid unbounded loops even during audit.
      if (!integer(count, 0, 10000)) {issues.push(`${member.id}: 獎勵數量超出核對範圍`);continue;}
      for (let i = 1; i <= count; i++) expected.add(`${member.id}-${kind}-${i}`);
    }
    for (const r of gifts) {
      if (!expected.delete(r.id)) issues.push(`${r.id}: 不符合閱讀資料的獎勵`);
      if (!(EMOJIS.includes(r.emoji) || (r.emoji === null && r.id.startsWith(`${member.id}-combo-`)))) issues.push(`${r.id}: emoji 不合法`);
      if (!((r.x === null && r.y === null) || (r.emoji !== null && integer(r.x,-1000000,1000000) && integer(r.y,-1000000,1000000)))) issues.push(`${r.id}: 位置不合法`);
    }
    if (expected.size) issues.push(`${member.id}: 缺少 ${expected.size} 個應有獎勵`);
    patches.push({id:member.id, data:{schemaVersion:2, revision:member.revision ?? 0, logCount:mine.length, lastReadDate:dates.at(-1) ?? null}});
  }
  return {issues, patches, gardenPatch:{schemaVersion:2, planRevision:garden.planRevision ?? 0, readingStarted:logs.length > 0},
    unlabeledLogs:logs.filter(l => !l.book || !l.lifeBook).length};
}
