export const JOIN_EMOJIS=['🌱','🌷','🌻','🌳','🍀','🦋','🐈','🐢','🐇','⛵','🪐','⭐'];
const INVITE_PREFIX='歡迎加入共讀花園！邀請代碼寄來咯：';
export function parseInviteCode(value) {
  const text=String(value).trim();
  const code=text.startsWith(INVITE_PREFIX)?text.slice(INVITE_PREFIX.length):text;
  const emojis=Array.from(code.replace(/[\s\uFE0F]/gu,''));
  return {emojis,valid:emojis.length===6&&new Set(emojis).size===6&&emojis.every(e=>JOIN_EMOJIS.includes(e))};
}
export function formatInviteMessage(code) {
  const parsed=parseInviteCode(code);
  if(!parsed.valid)throw new Error('邀請碼格式不正確。');
  return INVITE_PREFIX+parsed.emojis.join('');
}
