// Stable catalogue identity: a Bible book and its Life-study are separate readings.
export function readingBook(plan, kind) {
  return kind === 'bible' ? plan.book : kind === 'life' ? plan.lifeBook : plan.cwwlBookId ?? null;
}
export const readingKinds = ['bible', 'life', 'cwwl'];
export const readingCaps = {bible:'Bible', life:'Life', cwwl:'Cwwl'};
