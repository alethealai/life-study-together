import {collection, query, where, orderBy, documentId, startAfter, limit} from 'firebase/firestore';

// Whole-garden existence check, independent of the visible canvas rectangle.
export function gardenOccupancyQuery(db, gardenId) {
  return query(collection(db,'gardens',gardenId,'placements'),limit(1));
}

/** @param {import('firebase/firestore').QueryDocumentSnapshot|null} cursor */
export function privatePageQuery(db, gardenId, uid, kind, cursor = null) {
  const size = kind === 'rewards' ? 24 : 12;
  const filters = kind === 'periods' ? [] : [where('uid','==',uid)];
  if (kind === 'rewards') filters.push(where('x','==',null));
  const ref = kind === 'periods'
    ? collection(db,'gardens',gardenId,'members',uid,'readingPeriods')
    : collection(db,'gardens',gardenId,kind);
  return query(ref,...filters,orderBy(kind === 'periods' ? 'endedAt' : 'date','desc'),
    orderBy(documentId(),'desc'),...(cursor ? [startAfter(cursor)] : []),limit(size));
}

/** @param {import('firebase/firestore').QueryDocumentSnapshot|null} cursor */
export function placementQuery(db, gardenId, bounds, cursor = null) {
  return query(collection(db,'gardens',gardenId,'placements'),
    where('x','>=',bounds.left),where('x','<=',bounds.right),
    where('y','>=',bounds.top),where('y','<=',bounds.bottom),
    orderBy('x'),orderBy('y'),orderBy(documentId()),
    ...(cursor ? [startAfter(cursor)] : []),limit(200));
}
