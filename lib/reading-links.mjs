import {BOOKS, CHAPTERS} from '../functions/src/catalog.mjs';
import catalog from './reading-link-catalog.json' with {type:'json'};

const lifeStudyHome = 'https://line.twgbr.org/life-study/';
const normalize = name => name.trim().replace(/生命讀經$/, '').trim();
function lifeStudyBook(name) {
  const title = normalize(name);
  return catalog.books.find(book => BOOKS[book.bookNumber - 1] === title || normalize(book.title) === title);
}
export function lifeStudyLength(name) {
  return lifeStudyBook(name)?.paths.length;
}

// These are ordinary external links; opening one never changes reading progress.
export function nextReadingLink(kind, name, completed) {
  if (!Number.isSafeInteger(completed) || completed < 0) return null;
  const next = completed + 1;
  if (kind === 'bible') {
    const index = BOOKS.indexOf(name.trim());
    if (index < 0 || next > CHAPTERS[index]) return null;
    return {href:`https://www.recoveryversion.com.tw/verse/${index + 1}/${next}`, direct:true,
      description:`${name}第 ${next} 章（恢復本，另開分頁）`};
  }
  if (kind === 'life') {
    const book = lifeStudyBook(name);
    if (!book) return {href:lifeStudyHome, direct:false, description:'生命讀經目錄（另開分頁）'};
    const path = book.paths[completed];
    if (!path) return null;
    return {href:new URL(path, lifeStudyHome).href, direct:true,
      description:`${book.title}第 ${next} 篇（另開分頁）`};
  }
  return null;
}
