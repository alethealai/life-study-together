export const JOIN_EMOJIS=['🌱','🌷','🌻','🌳','🍀','🦋','🐈','🐢','🐇','⛵','🪐','⭐'];
export function parseInviteCode(value) {
  const emojis=Array.from(String(value).replace(/[\s\uFE0F]/gu,''));
  return {emojis,valid:emojis.length===6&&new Set(emojis).size===6&&emojis.every(e=>JOIN_EMOJIS.includes(e))};
}
