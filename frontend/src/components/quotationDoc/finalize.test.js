import { describe, expect, it } from 'vitest';
import { finalizeDocument } from './finalize';

const build = () => {
  const root = document.createElement('div');
  root.innerHTML = Array.from({ length: 4 }, () => '<div class="quotation-page"><span data-pageno=""></span></div>').join('');
  return root;
};
const numbers = (root) => [...root.querySelectorAll('[data-pageno]')].map((e) => e.textContent);

describe('numbering the pages of the document', () => {
  it('numbers every page in order', () => {
    const root = build();
    finalizeDocument(root, { perSheet: false });
    expect(numbers(root)).toEqual(['01', '02', '03', '04']);
  });

  it('is repeatable: a second pass writes the same thing instead of adding to it', () => {
    const root = build();
    finalizeDocument(root, { perSheet: false });
    finalizeDocument(root, { perSheet: false });
    expect(numbers(root)).toEqual(['01', '02', '03', '04']);
  });

  it('counts a page taller than a sheet as several sheets on screen', () => {
    const root = build();
    Object.defineProperty(root.children[0], 'scrollHeight', { value: 2300 });
    finalizeDocument(root);
    expect(numbers(root)).toEqual(['01', '04', '05', '06']);
  });

  it('does nothing without a document', () => {
    expect(() => finalizeDocument(null)).not.toThrow();
  });
});
