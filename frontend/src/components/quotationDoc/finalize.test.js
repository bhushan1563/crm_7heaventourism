import { describe, expect, it } from 'vitest';
import { finalizeDocument } from './finalize';

const page = (inner) => `<div class="quotation-page">${inner}<span data-pageno=""></span></div>`;

const build = () => {
  const root = document.createElement('div');
  root.innerHTML = [
    page(''),
    page('<div data-toc="journey"></div><div data-toc="days"></div><div data-toc-days=""></div><div data-toc="terms"></div>'),
    page('<div data-section="journey"></div>'),
    page('<div data-section="days" data-day="1"></div><div data-day="2"></div>'),
    page('<div data-day="3"></div><div data-day="4"></div>'),
    page('<div data-day="5"></div>'),
    page('<div data-section="terms"></div>')
  ].join('');
  return root;
};

describe('numbering the pages of the document', () => {
  it('numbers every page and fills the contents with the page each section starts on', () => {
    const root = build();
    finalizeDocument(root, { perSheet: false });
    expect([...root.querySelectorAll('[data-pageno]')].map((e) => e.textContent)).toEqual(['01', '02', '03', '04', '05', '06', '07']);
    expect([...root.querySelectorAll('[data-toc]')].map((e) => [e.getAttribute('data-toc'), e.textContent])).toEqual([['journey', '03'], ['days', '04'], ['terms', '07']]);
  });

  it('lists the stretches of days with their pages', () => {
    const root = build();
    finalizeDocument(root, { perSheet: false });
    const rows = [...root.querySelectorAll('[data-toc-days] .qd-toc-row')].map((r) => r.textContent);
    expect(rows).toEqual(['Days 1 – 2', '04', 'Days 3 – 4', '05', 'Day 5', '06'].reduce((acc, v, i, a) => (i % 2 ? acc : [...acc, `${v}${a[i + 1]}`]), []));
  });

  it('is repeatable: a second pass writes the same thing instead of adding to it', () => {
    const root = build();
    finalizeDocument(root, { perSheet: false });
    finalizeDocument(root, { perSheet: false });
    expect(root.querySelectorAll('[data-toc-days] .qd-toc-row')).toHaveLength(3);
  });

  it('leaves a section the document does not have blank instead of writing a wrong number', () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="quotation-page"><div data-toc="flights">x</div><span data-pageno=""></span></div>`;
    finalizeDocument(root, { perSheet: false });
    expect(root.querySelector('[data-toc]').textContent).toBe('');
  });
});
