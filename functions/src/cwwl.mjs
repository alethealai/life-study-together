import books from './cwwl-index.json' with {type:'json'};
export const CWWL_BOOKS = books;
const byId = new Map(books.map(book=>[book.id,book]));
export const cwwlBook = id => byId.get(id);
export const cwwlLabel = id => {const b=cwwlBook(id);return b?`${/^\d/.test(b.era)?b.era+'年':b.era}・第${b.volume}冊・${b.title}`:'';};
export const enabledTracks = plan => plan.enabledTracks ?? ['bible','life'];
export const CWWL_STEP = 3;
