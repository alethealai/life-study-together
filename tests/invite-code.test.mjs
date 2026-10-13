import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseInviteCode} from '../lib/invite-code.mjs';
test('pasted codes preserve exact emoji order and accept whitespace/variation selectors',()=>{
  assert.deepEqual(parseInviteCode(' 🌱 🌷\n🌻 🌳 🍀 ⭐️ ').emojis,['🌱','🌷','🌻','🌳','🍀','⭐']);
  assert.equal(parseInviteCode(' 🌱 🌷\n🌻 🌳 🍀 ⭐️ ').valid,true);
  assert.notDeepEqual(parseInviteCode('🌱🌷🌻🌳🍀⭐').emojis,parseInviteCode('🌷🌱🌻🌳🍀⭐').emojis);
});
test('duplicate, partial, unknown and extra characters are rejected rather than silently stripped',()=>{
  for(const value of ['🌱🌱🌻🌳🍀⭐','🌱🌷','🌱🌷🌻🌳🍀🐶','🌱🌷🌻🌳🍀⭐extra'])assert.equal(parseInviteCode(value).valid,false);
});
