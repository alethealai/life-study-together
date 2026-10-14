import {test} from 'node:test';
import assert from 'node:assert/strict';
import {draggedPlacement} from '../lib/placement-drag.mjs';

const rect={left:20,top:100,width:400,height:600};
test('dragging converts screen motion through zoom and panning without losing the grab offset',()=>{
  const view={x:100,y:-50,z:2};
  const start=draggedPlacement({x:230,y:400},{x:-5,y:0},rect,view);
  assert.deepEqual(start,{x:100,y:-50});
  assert.deepEqual(draggedPlacement({x:290,y:360},{x:-5,y:0},rect,view),{x:130,y:-70});
  assert.deepEqual(draggedPlacement({x:240,y:400},{x:0,y:0},rect,{x:0,y:0,z:.5}),{x:40,y:0});
});
test('releasing outside the canvas keeps the emoji and confirmation reachable',()=>{
  assert.deepEqual(draggedPlacement({x:-500,y:-500},{x:0,y:0},rect,{x:0,y:0,z:1}),{x:-128,y:-200});
  assert.deepEqual(draggedPlacement({x:2000,y:2000},{x:0,y:0},rect,{x:0,y:0,z:1}),{x:128,y:200});
});
