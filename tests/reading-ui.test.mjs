import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advanceReading,readingRange,shortenReadingTitle} from '../lib/reading-ui.mjs';
import {lifeStudyNumber} from '../lib/reading-links.mjs';
import titles from '../lib/life-study-titles.json' with {type:'json'};
import links from '../lib/reading-link-catalog.json' with {type:'json'};

test('quick completion changes one reading track without changing the captured baseline',()=>{
  const current={bible:6,life:6,cwwl:2};
  assert.deepEqual(advanceReading(current,'life',51),{bible:6,life:7,cwwl:2});
  assert.deepEqual(advanceReading(current,'bible',21),{bible:7,life:6,cwwl:2});
  assert.deepEqual(advanceReading(current,'cwwl',10),{bible:6,life:6,cwwl:3});
  assert.deepEqual(current,{bible:6,life:6,cwwl:2});
  assert.equal(advanceReading({life:50},'life',51).life,51);
  for(const value of [51,52,-1,1.5,NaN])assert.throws(()=>advanceReading({life:value},'life',51));
  assert.throws(()=>advanceReading(current,'unknown',51));
});

test('progress previews describe only new consecutive reading, excluding the prior position',()=>{
  assert.equal(readingRange(6,9,'篇'),'這次新增第 7～9 篇，共 3 篇');
  assert.equal(readingRange(6,7,'章'),'這次新增第 7 章，共 1 章');
  assert.equal(readingRange(0,1,'篇'),'這次新增第 1 篇，共 1 篇');
  assert.equal(readingRange(6,6,'篇'),null);
  assert.equal(readingRange(6,5,'篇'),null);
});

test('long titles preserve their beginning and series suffix; short titles stay intact',()=>{
  const title='人救主在祂帶著神聖屬性之人性美德中的職事在加利利（一）';
  const shortened=shortenReadingTitle(title);
  assert.ok(shortened.startsWith('人救主在祂帶著神聖'));
  assert.ok(shortened.endsWith('在加利利（一）'));
  assert.ok(shortened.includes('…'));
  assert.equal(shortenReadingTitle('前言'),'前言');
});

test('every static message title has a matching reading link, including John and Luke',()=>{
  assert.equal(titles.books.length,66);
  assert.equal(new Set(titles.books.map(b=>b.bookNumber)).size,66);
  for(const book of titles.books){
    assert.equal(book.titles.length,links.books.find(b=>b.bookNumber===book.bookNumber).paths.length);
    assert.ok(book.titles.every(t=>t.trim().length>0));
    assert.equal(new URL(book.source).origin,'https://www.lsmchinese.org');
  }
  assert.equal(titles.books.find(b=>b.bookNumber===lifeStudyNumber('約翰福音')).titles.length,51);
  assert.equal(titles.books.find(b=>b.bookNumber===lifeStudyNumber('路加福音')).titles.length,79);
  assert.equal(lifeStudyNumber(' 約翰福音生命讀經 '),43);
  assert.equal(lifeStudyNumber('自訂書目'),undefined);
});
