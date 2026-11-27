// Once the pages of the document are known (on screen as they are drawn, in the PDF after the long ones were split), fills in the number
// in every footer. These are plain elements with no children in the markup, so nothing in React ever overwrites what is written here.
import { pad2 } from './model';

const A4_HEIGHT = 1123;

const sheetsOf = (page) => Math.max(1, Math.ceil((page.scrollHeight - 12) / A4_HEIGHT));

/** The page numbers of a laid-out document. `root` is the document container (or any ancestor). The cover is page 1 and shows no number. */
export const finalizeDocument = (root, { perSheet = true } = {}) => {
  if (!root) return;
  let n = 0;
  for (const page of Array.from(root.querySelectorAll('.quotation-page'))) {
    n += 1;
    page.querySelectorAll('[data-pageno]').forEach((el) => { el.textContent = pad2(n); });
    if (perSheet) n += sheetsOf(page) - 1; // on screen a tall page stands for several sheets
  }
};
