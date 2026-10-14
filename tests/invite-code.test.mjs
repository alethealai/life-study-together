import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseInviteCode,formatInviteMessage} from '../lib/invite-code.mjs';
test('pasted codes preserve exact emoji order and accept whitespace/variation selectors',()=>{
  assert.deepEqual(parseInviteCode(' 🌱 🌷\n🌻 🌳 🍀 ⭐️ ').emojis,['🌱','🌷','🌻','🌳','🍀','⭐']);
  assert.equal(parseInviteCode(' 🌱 🌷\n🌻 🌳 🍀 ⭐️ ').valid,true);
  assert.notDeepEqual(parseInviteCode('🌱🌷🌻🌳🍀⭐').emojis,parseInviteCode('🌷🌱🌻🌳🍀⭐').emojis);
});
test('duplicate, partial, unknown and extra characters are rejected rather than silently stripped',()=>{
  for(const value of ['🌱🌱🌻🌳🍀⭐','🌱🌷','🌱🌷🌻🌳🍀🐶','🌱🌷🌻🌳🍀⭐extra'])assert.equal(parseInviteCode(value).valid,false);
});
test('the copied invitation includes the welcome text and can be pasted back without changing order',()=>{
  const code='🌱🌷🌻🌳🍀⭐';
  const message=formatInviteMessage(code);
  assert.equal(message,'歡迎加入共讀花園！邀請代碼寄來咯：'+code);
  assert.deepEqual(parseInviteCode(' \n'+message+'\n '),parseInviteCode(code));
  assert.equal(parseInviteCode(message+'🌷').valid,false);
  assert.equal(parseInviteCode(message+'額外文字').valid,false);
  assert.throws(()=>formatInviteMessage('🌱🌱🌻🌳🍀⭐'));
});
