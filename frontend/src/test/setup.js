import '@testing-library/jest-dom/vitest';
// jsdom lacks a few layout APIs that the editor library calls while it manages the cursor. Harmless stand-ins.
if (typeof window !== 'undefined') {
  const emptyRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
  const zeroRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON() {} });
  if (typeof Range !== 'undefined') {
    Range.prototype.getClientRects = Range.prototype.getClientRects || emptyRects;
    Range.prototype.getBoundingClientRect = Range.prototype.getBoundingClientRect || zeroRect;
  }
  document.elementFromPoint = document.elementFromPoint || (() => null);
  window.scrollTo = window.scrollTo || (() => {});
}
