// A quick completion advances only the selected track; the server still verifies
// the captured member/plan revisions and awards inside its transaction.
export function advanceReading(values, kind, max) {
  if (!['bible','life','cwwl'].includes(kind) || !Number.isSafeInteger(max)
    || !Number.isSafeInteger(values[kind]) || values[kind] < 0 || values[kind] >= max) {
    throw new Error('這個閱讀項目已完成或進度無效，請重新確認。');
  }
  return {...values, [kind]:values[kind] + 1};
}
export function readingRange(start, end, unit) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) return null;
  return `這次新增第 ${start + 1}${end > start + 1 ? `～${end}` : ''} ${unit}，共 ${end - start} ${unit}`;
}
export function shortenReadingTitle(title, head = 12, tail = 10) {
  const chars = Array.from(title);
  return chars.length <= head + tail + 1 ? title : chars.slice(0,head).join('') + '…' + chars.slice(-tail).join('');
}
