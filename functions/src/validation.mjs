import {cwwlBook,enabledTracks} from './cwwl.mjs';
import { HttpsError } from 'firebase-functions/v2/https';
import { BOOKS, CHAPTERS } from './catalog.mjs';

export function requireThat(condition, message, code = 'invalid-argument') {
  if (!condition) throw new HttpsError(code, message);
}
export function integer(value, min = 0, max = 10000) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}
export function fields(value, keys) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), '資料欄位不正確。');
}
export function text(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min && value.length <= max;
}
export function dateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit'}).format(date);
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T12:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function validatePlan(p) {
  const tracks=enabledTracks(p);
  requireThat(Array.isArray(tracks) && tracks.length>0 && tracks.length<=3 && new Set(tracks).size===tracks.length
    && tracks.every(t=>['bible','life','cwwl'].includes(t)), '請至少選擇一種有效的閱讀項目。');
  requireThat((p.cwwlBookId == null || !!cwwlBook(p.cwwlBookId))
    && (!tracks.includes('cwwl') || (cwwlBook(p.cwwlBookId)?.count>0 && integer(p.cwwlTarget,0,cwwlBook(p.cwwlBookId).count))), '請從目錄選擇文集書目並設定有效目標。');
  requireThat(BOOKS.includes(p.book) && text(p.lifeBook, 1, 40)
    && integer(p.bibleTarget, 0, CHAPTERS[BOOKS.indexOf(p.book)])
    && integer(p.lifeTarget) && integer(p.bibleStep, 1, 100) && integer(p.lifeStep, 1, 100), '共同計畫資料不正確。');
}
export function validateMember(m, plan) {
  const total=m.cwwlRead??0, archived=m.archivedCwwlRead??0, base=m.baseCwwl??0, progress=m.cwwlProgress??0;
  requireThat(integer(total,0,Number.MAX_SAFE_INTEGER)&&integer(archived,0,total)&&integer(base,0,cwwlBook(plan.cwwlBookId)?.count??0)
    && integer(progress,base,cwwlBook(plan.cwwlBookId)?.count??0)&&progress===base+total-archived, '文集進度需要核對。','failed-precondition');
  requireThat(integer(m.baseBible, 0, CHAPTERS[BOOKS.indexOf(plan.book)]) && integer(m.baseLife)
    && integer(m.bibleProgress, m.baseBible, CHAPTERS[BOOKS.indexOf(plan.book)])
    && integer(m.lifeProgress, m.baseLife) && integer(m.bibleRead, 0, Number.MAX_SAFE_INTEGER) && integer(m.lifeRead, 0, Number.MAX_SAFE_INTEGER)
    && integer(m.archivedBibleRead ?? 0, 0, m.bibleRead) && integer(m.archivedLifeRead ?? 0, 0, m.lifeRead)
    && m.bibleProgress === m.baseBible + m.bibleRead - (m.archivedBibleRead ?? 0) && m.lifeProgress === m.baseLife + m.lifeRead - (m.archivedLifeRead ?? 0)
    && integer(m.revision, 0, Number.MAX_SAFE_INTEGER) && integer(m.logCount, 0, Number.MAX_SAFE_INTEGER)
    && Array.isArray(m.readingDates) && m.readingDates.every(validDate)
    && new Set(m.readingDates).size === m.readingDates.length,
  '既有進度需要核對，請聯絡花園管理者。', 'failed-precondition');
}
export function streakRewards(dates) {
  const sorted = [...new Set(dates)].sort();
  let run = 0, earned = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i && Date.parse(sorted[i]) - Date.parse(sorted[i - 1]) === 86400000 ? run + 1 : 1;
    if (run % 7 === 0) earned++;
  }
  return earned;
}
