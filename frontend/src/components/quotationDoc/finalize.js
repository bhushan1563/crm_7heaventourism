// Once the pages of the document are known (on screen as they are drawn, in the PDF after the long ones were split), fills in what depends on
// them: the number in every footer and the page numbers in the contents. These are plain elements with no children in the markup, so
// nothing in React ever overwrites what is written here.
import { pad2 } from './model';

const A4_HEIGHT = 1123;

const sheetsOf = (page) => Math.max(1, Math.ceil((page.scrollHeight - 12) / A4_HEIGHT));

/** The page numbers of a laid-out document, and the contents rows that point to them. `root` is the document container (or any ancestor). */
export const finalizeDocument = (root, { perSheet = true } = {}) => {
  if (!root) return;
  const pages = Array.from(root.querySelectorAll('.quotation-page'));
  const first = {};
  const dayPages = [];
  let n = 0;
  for (const page of pages) {
    n += 1;
    page.querySelectorAll('[data-pageno]').forEach((el) => { el.textContent = pad2(n); });
    page.querySelectorAll('[data-section]').forEach((el) => {
      const key = el.getAttribute('data-section');
      if (key && first[key] === undefined) first[key] = n;
    });
    const days = Array.from(page.querySelectorAll('[data-day]')).map((el) => Number(el.getAttribute('data-day'))).filter(Boolean);
    if (days.length) dayPages.push({ from: Math.min(...days), to: Math.max(...days), page: n });
    if (perSheet) n += sheetsOf(page) - 1; // on screen a tall page stands for several sheets
  }
  root.querySelectorAll('[data-toc]').forEach((el) => {
    const at = first[el.getAttribute('data-toc')];
    el.textContent = at ? pad2(at) : '';
  });
  root.querySelectorAll('[data-toc-days]').forEach((el) => {
    el.textContent = '';
    for (const { from, to, page } of dayPages) {
      const row = el.ownerDocument.createElement('div');
      row.className = 'qd-toc-row sub';
      const label = from === to ? `Day ${from}` : `Days ${from} – ${to}`;
      for (const [cls, text] of [['rn', ''], ['tt', label], ['dots', ''], ['pg', pad2(page)]]) {
        const span = el.ownerDocument.createElement('span');
        span.className = cls;
        span.textContent = text;
        row.appendChild(span);
      }
      el.appendChild(row);
    }
  });
};
