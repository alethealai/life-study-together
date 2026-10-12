import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BOOKS,CHAPTERS} from '../functions/src/catalog.mjs';
import {nextReadingLink,lifeStudyLength} from '../lib/reading-links.mjs';
import catalog from '../lib/reading-link-catalog.json' with {type:'json'};

test('John progress six opens message seven, independently from Bible chapter seven',()=>{
  assert.equal(nextReadingLink('life','約翰福音',6).href,'https://line.twgbr.org/life-study/43_7.html');
  assert.equal(nextReadingLink('bible','約翰福音',6).href,'https://www.recoveryversion.com.tw/verse/43/7');
  assert.equal(nextReadingLink('life',' 約翰福音生命讀經 ',6).href,nextReadingLink('life','約翰福音',6).href);
});
test('all 66 books use catalog links including first and final messages, then stop',()=>{
  assert.equal(catalog.books.length,66);
  for(const [i,name] of BOOKS.entries()) {
    const source=catalog.books.find(book=>book.bookNumber===i+1), count=lifeStudyLength(name);
    assert.equal(count,source.paths.length);
    for(let n=0;n<count;n++) {
      const link=nextReadingLink('life',name,n);
      assert.equal(link.href,new URL(source.paths[n],catalog.source).href);
      assert.equal(new URL(link.href).origin,'https://line.twgbr.org');
    }
    assert.equal(nextReadingLink('life',name,count),null);
    assert.equal(nextReadingLink('bible',name,CHAPTERS[i]-1).href,`https://www.recoveryversion.com.tw/verse/${i+1}/${CHAPTERS[i]}`);
    assert.equal(nextReadingLink('bible',name,CHAPTERS[i]),null);
  }
});
test('official combined volumes and traditional names resolve without substring guessing',()=>{
  assert.equal(lifeStudyLength('撒母耳記'),38);
  assert.equal(lifeStudyLength('約翰壹書'),40);
  assert.equal(lifeStudyLength('約翰一書'),40);
  assert.equal(nextReadingLink('life','自訂共讀',6).direct,false);
  assert.equal(nextReadingLink('life','約翰',6).href,catalog.source);
  assert.equal(nextReadingLink('bible','自訂共讀',0),null);
  assert.equal(nextReadingLink('cwwl','包羅萬有的基督',0),null);
  for(const value of [-1,1.5,NaN,Infinity])assert.equal(nextReadingLink('life','約翰福音',value),null);
});
