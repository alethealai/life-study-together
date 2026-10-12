import {cwwlBook,cwwlLabel,enabledTracks,CWWL_STEP} from './cwwl.mjs';
import { randomInt } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { EMOJIS, BOOKS, CHAPTERS } from './catalog.mjs';
import { requireThat, integer, fields, text, dateKey, validDate, validatePlan, validateMember, streakRewards } from './validation.mjs';

// The caller identity is supplied by the callable wrapper, never by request data.
export function createGardenService(db, now = () => new Date()) {
  function refs(uid, data) {
    requireThat(typeof uid === 'string' && uid.length > 0, '請先登入。', 'unauthenticated');
    requireThat(text(data?.gardenId, 1, 128) && /^[\w-]+$/.test(data.gardenId), '花園代碼不正確。');
    const garden = db.doc(`gardens/${data.gardenId}`);
    return { garden, member: garden.collection('members').doc(uid) };
  }
  async function state(tx, garden, member, uid) {
    const [gs, ms] = await tx.getAll(garden, member);
    requireThat(gs.exists && ms.exists && ms.data().uid === uid, '你不是這座花園的成員。', 'permission-denied');
    const g = gs.data(), m = ms.data();
    requireThat(g.schemaVersion === 2 && m.schemaVersion === 2, '花園資料尚待管理者核對，暫時無法儲存。', 'failed-precondition');
    validatePlan(g); validateMember(m, g);
    return { g, m };
  }
  async function record(uid, data) {
    const {garden, member} = refs(uid, data);
    fields(data, ['gardenId', 'requestId', 'expectedRevision', 'planRevision', 'bible', 'life', 'date', 'note', ...(Object.hasOwn(data,'cwwl')?['cwwl']:[])]);
    requireThat(typeof data.requestId === 'string' && /^[0-9a-f-]{36}$/.test(data.requestId), '請求代碼不正確。');
    requireThat(integer(data.expectedRevision, 0, Number.MAX_SAFE_INTEGER) && integer(data.planRevision, 0, Number.MAX_SAFE_INTEGER)
      && integer(data.bible) && integer(data.life) && integer(data.cwwl??0) && validDate(data.date) && text(data.note, 0, 2000), '閱讀資料格式不正確。');
    const receipt = member.collection('requests').doc(data.requestId);
    const log = garden.collection('logs').doc(`${uid}-${data.requestId}`);
    // Canonical order makes exact retries independent of object key order.
    const payload = JSON.stringify([data.bible, data.life, data.date, data.note, data.expectedRevision, data.planRevision, ...(Object.hasOwn(data,'cwwl')?[data.cwwl]:[])]);
    return db.runTransaction(async tx => {
      const {g, m} = await state(tx, garden, member, uid);
      const previous = await tx.get(receipt);
      if (previous.exists) {
        requireThat(previous.data().payload === payload, '同一請求代碼不能用於不同閱讀資料。', 'already-exists');
        return previous.data().result;
      }
      requireThat(data.expectedRevision === m.revision && data.planRevision === g.planRevision,
        '進度或共同計畫已在其他裝置更新，請重新開啟閱讀表單。', 'aborted');
      requireThat(data.date <= dateKey(now()) && m.joinedAt?.toDate
        && data.date >= dateKey(m.joinedAt.toDate()), '閱讀日期須介於加入花園當天與今天之間。');
      requireThat(data.bible <= CHAPTERS[BOOKS.indexOf(g.book)] && data.bible >= m.bibleProgress && data.life >= m.lifeProgress,
        '進度不能倒退或超出書卷範圍。');
      const bible = data.bible - m.bibleProgress, life = data.life - m.lifeProgress;
      const cwwl=(data.cwwl??0)-(m.cwwlProgress??0);
      requireThat(cwwl>=0 && (data.cwwl??0)<=(cwwlBook(g.cwwlBookId)?.count??0),'文集進度不能倒退或超出所選書目。');
      for(const [kind,delta] of [['bible',bible],['life',life],['cwwl',cwwl]])requireThat(!delta||enabledTracks(g).includes(kind),'未選用的閱讀項目不能新增進度。');
      for (const [kind, delta] of [['bible', bible], ['life', life], ['cwwl', cwwl]]) {
        const start = g[`${kind}StartedAt`];
        requireThat(!delta || !start || data.date >= dateKey(start.toDate()), '新書的閱讀日期不能早於換書當天。');
      }
      requireThat(bible + life + cwwl > 0, '這次還沒有新增閱讀進度。');
      const bibleRead = m.bibleRead + bible, lifeRead = m.lifeRead + life, cwwlRead=(m.cwwlRead??0)+cwwl;
      const dates = [...new Set([...m.readingDates, data.date])].sort();
      const rewards = [];
      for (const [kind, oldN, newN, step] of [['bible',m.bibleRead,bibleRead,g.bibleStep], ['life',m.lifeRead,lifeRead,g.lifeStep],['cwwl',m.cwwlRead??0,cwwlRead,CWWL_STEP]]) {
        for (let i = Math.floor(oldN / step) + 1; i <= Math.floor(newN / step); i++) {
          rewards.push({id:`${uid}-${kind}-${i}`, kind, ordinal:i, emoji:EMOJIS[randomInt(EMOJIS.length)],
            source:`${kind === 'bible' ? '聖經' : kind === 'life' ? '生命讀經' : '李常受文集'}累積閱讀 ${i * step} ${kind === 'bible' ? '章' : kind === 'life' ? '篇' : '個閱讀單元'}`});
        }
      }
      for (let i = streakRewards(m.readingDates) + 1; i <= streakRewards(dates); i++) {
        rewards.push({id:`${uid}-combo-${i}`, kind:'combo', ordinal:i, emoji:null, source:'連續閱讀 7 天 · 自選獎勵'});
      }
      requireThat(rewards.length <= 400, '這次會產生太多獎勵，請分次記錄較小的閱讀範圍。');
      const result = {gained:rewards.length, revision:m.revision + 1};
      tx.create(log, {uid, date:data.date, bible, life, cwwl, cwwlBookId:g.cwwlBookId??null, cwwlBook:cwwlLabel(g.cwwlBookId), cwwlPeriod:g.cwwlPeriod??0, beforeCwwl:m.cwwlProgress??0, afterCwwl:data.cwwl??0, note:data.note, book:g.book, lifeBook:g.lifeBook,
        planRevision:g.planRevision, biblePeriod:g.biblePeriod ?? 0, lifePeriod:g.lifePeriod ?? 0, beforeBible:m.bibleProgress, beforeLife:m.lifeProgress,
        afterBible:data.bible, afterLife:data.life, revision:result.revision, requestId:data.requestId,
        rewardIds:rewards.map(r => r.id), createdAt:FieldValue.serverTimestamp()});
      tx.update(member, {bibleProgress:data.bible, lifeProgress:data.life, cwwlProgress:data.cwwl??0, bibleRead, lifeRead, cwwlRead, readingDates:dates,
        revision:result.revision, logCount:m.logCount + 1, lastReadDate:dates.at(-1), lastLogId:log.id});
      if (!g.readingStarted) tx.update(garden, {readingStarted:true});
      for (const {id, ...reward} of rewards) {
        // create, rather than set: a collision aborts the whole transaction, preserving old rewards.
        tx.create(garden.collection('rewards').doc(id), {...reward, uid, date:data.date, logId:log.id, x:null, y:null});
      }
      tx.create(receipt, {payload, result, logId:log.id, createdAt:FieldValue.serverTimestamp()});
      return result;
    });
  }
  async function profile(uid, data) {
    const {garden, member} = refs(uid, data);
    fields(data, ['gardenId', 'name', 'bible', 'life', 'expectedRevision', 'planRevision', ...(Object.hasOwn(data,'cwwl')?['cwwl']:[])]);
    requireThat(text(data.name, 1, 40) && integer(data.bible) && integer(data.life) && integer(data.cwwl??0) && integer(data.expectedRevision, 0, Number.MAX_SAFE_INTEGER), '個人資料格式不正確。');
    return db.runTransaction(async tx => {
      const {g, m} = await state(tx, garden, member, uid);
      requireThat(m.revision === data.expectedRevision && g.planRevision === data.planRevision, '進度已更新，請重新開啟個人設定。', 'aborted');
      const changedCwwl=(data.cwwl??0)!==(m.baseCwwl??0);
      requireThat(!changedCwwl||(enabledTracks(g).includes('cwwl')&&(m.cwwlRead??0)===(m.archivedCwwlRead??0)),'已有文集閱讀，不能修改起始位置。','failed-precondition');
      requireThat((data.cwwl??0)<=(cwwlBook(g.cwwlBookId)?.count??0),'文集起始位置超出範圍。');
      const changedBible = data.bible !== m.baseBible, changedLife = data.life !== m.baseLife;
      requireThat((!changedBible || m.bibleRead === (m.archivedBibleRead ?? 0)) && (!changedLife || m.lifeRead === (m.archivedLifeRead ?? 0)), '已有閱讀紀錄，無法修改加入前的起始位置。', 'failed-precondition');
      requireThat(data.bible <= CHAPTERS[BOOKS.indexOf(g.book)], '起始位置超出書卷範圍。');
      tx.update(member, {name:data.name.trim(), revision:m.revision + 1,
        ...(changedBible ? {baseBible:data.bible, bibleProgress:data.bible} : {}),
        ...(changedLife ? {baseLife:data.life, lifeProgress:data.life} : {}),
        ...(changedCwwl ? {baseCwwl:data.cwwl,cwwlProgress:data.cwwl}: {})});
      return {gained:0};
    });
  }
  async function updatePlan(uid, data) {
    const {garden, member} = refs(uid, data);
    fields(data, ['gardenId','requestId','expectedRevision','book','lifeBook','bibleTarget','lifeTarget','bibleStep','lifeStep', ...['enabledTracks','cwwlBookId','cwwlTarget'].filter(k=>Object.hasOwn(data,k))]);
    requireThat(typeof data.requestId === 'string' && /^[0-9a-f-]{36}$/.test(data.requestId)
      && integer(data.expectedRevision, 0, Number.MAX_SAFE_INTEGER), '計畫請求格式不正確。');
    const next = {book:data.book, lifeBook:typeof data.lifeBook === 'string' ? data.lifeBook.trim() : data.lifeBook,
      bibleTarget:data.bibleTarget, lifeTarget:data.lifeTarget, bibleStep:data.bibleStep, lifeStep:data.lifeStep,
      ...Object.fromEntries(['enabledTracks','cwwlBookId','cwwlTarget'].filter(k=>Object.hasOwn(data,k)).map(k=>[k,data[k]]))};
    validatePlan(next);
    const payload = JSON.stringify([data.expectedRevision, ...Object.values(next)]);
    const receipt = member.collection('requests').doc(`plan-${data.requestId}`);
    return db.runTransaction(async tx => {
      const {g} = await state(tx, garden, member, uid);
      requireThat(g.ownerUid === uid, '只有這座花園的管理者可以修改計畫。', 'permission-denied');
      const previous = await tx.get(receipt);
      if (previous.exists) {
        requireThat(previous.data().payload === payload, '同一請求代碼不能用於不同計畫。', 'already-exists');
        return previous.data().result;
      }
      validatePlan({...g,...next});
      requireThat(g.planRevision === data.expectedRevision, '共同計畫已更新，請重新開啟設定。', 'aborted');
      requireThat(!g.readingStarted || (next.bibleStep === g.bibleStep && next.lifeStep === g.lifeStep),
        '開始閱讀後，獎勵門檻固定，換書也會沿用。', 'failed-precondition');
      const changed = ['bible','life'].filter(kind => next[kind === 'bible' ? 'book' : 'lifeBook'] !== g[kind === 'bible' ? 'book' : 'lifeBook']);
      if(Object.hasOwn(next,'cwwlBookId') && next.cwwlBookId!== (g.cwwlBookId??null))changed.push('cwwl');
      const members = changed.length ? await tx.get(garden.collection('members').limit(101)) : null;
      requireThat(!members || members.size <= 100, '成員數超出本次換書支援範圍。', 'failed-precondition');
      if (members) for (const row of members.docs) {
        requireThat(row.data().schemaVersion === 2 && row.data().uid === row.id, '成員資料尚待核對。', 'failed-precondition');
        validateMember(row.data(), g);
      }
      const stamp = Timestamp.fromDate(now());
      const revision = g.planRevision + 1;
      // Archive and reset everyone in the same transaction as the plan change.
      // A reading/profile transaction touching any affected member must retry.
      if (members) for (const row of members.docs) {
        const m = row.data(), changes = {revision:m.revision + 1};
        for (const kind of changed) {
          const cap = kind === 'bible' ? 'Bible' : kind === 'life' ? 'Life' : 'Cwwl';
          if(kind!=='cwwl'||g.cwwlBookId)tx.create(row.ref.collection('readingPeriods').doc(`${kind}-${g[`${kind}Period`] ?? 0}`), {
            uid:row.id, kind, book:kind==='cwwl'?cwwlLabel(g.cwwlBookId):g[kind === 'bible' ? 'book' : 'lifeBook'],
            period:g[`${kind}Period`] ?? 0, base:m[`base${cap}`]??0, progress:m[`${kind}Progress`]??0,
            read:(m[`${kind}Read`]??0) - (m[`archived${cap}Read`] ?? 0), endedAt:stamp,
            startedAt:g[`${kind}StartedAt`] ?? null, planRevision:g.planRevision,
          });
          changes[`base${cap}`] = 0;
          changes[`${kind}Progress`] = 0;
          changes[`archived${cap}Read`] = m[`${kind}Read`]??0;
        }
        tx.update(row.ref, changes);
      }
      const changes = {...next, planRevision:revision};
      for (const kind of changed) {
        changes[`${kind}Period`] = (g[`${kind}Period`] ?? 0) + 1;
        changes[`${kind}StartedAt`] = stamp;
      }
      tx.create(garden.collection('plans').doc(String(g.planRevision)), {
        book:g.book, lifeBook:g.lifeBook, bibleTarget:g.bibleTarget, lifeTarget:g.lifeTarget,
        bibleStep:g.bibleStep, lifeStep:g.lifeStep, enabledTracks:enabledTracks(g), cwwlBookId:g.cwwlBookId??null, cwwlTarget:g.cwwlTarget??0, endedAt:stamp,
      });
      tx.update(garden, changes);
      const result = {gained:0, revision};
      tx.create(receipt, {payload, result, createdAt:stamp});
      return result;
    });
  }
  return {record, profile, updatePlan};
}
