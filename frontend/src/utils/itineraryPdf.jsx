// Itinerary -> PDF. The document is drawn off-screen, measured, packed onto A4 pages (a day heading never ends a page, a
// photo is never cut) and each page is captured as an image. html2canvas and jsPDF are loaded only when someone presses
// "Download PDF". Like the quotation PDF, the pages are pictures: they look exactly like the Word file's content, but the
// text in the PDF cannot be selected (use the Word file when the text has to be edited or copied).
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { COMPANY } from '../config';
import logo from '../assets/logo.webp';
import ItineraryDocument, { DOC_WIDTH } from '../components/itinerary/ItineraryDocument';
import { documentFacts, packBlocks } from './itineraryDoc';

const PAGE_W = 794; // A4 at 96 dpi
const PAGE_H = 1123;
const MARGIN_X = (PAGE_W - DOC_WIDTH) / 2;
const MARGIN_TOP = 56; // room for the running header drawn by the PDF writer
const MARGIN_BOTTOM = 64; // room for the page number
const CAPACITY = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM;
const IMAGE_TIMEOUT_MS = 25000;

const settle = (img) =>
  new Promise((resolve) => {
    if (img.complete) return resolve(img.naturalWidth > 0);
    img.addEventListener('load', () => resolve(true), { once: true });
    img.addEventListener('error', () => resolve(false), { once: true });
  });

/** Waits for every image; resolves how many failed. Never waits longer than the timeout. */
const loadImages = async (root) => {
  const images = Array.from(root.querySelectorAll('img'));
  const results = await Promise.race([Promise.all(images.map(settle)), new Promise((resolve) => setTimeout(() => resolve(null), IMAGE_TIMEOUT_MS))]);
  if (results === null) return images.filter((img) => !(img.complete && img.naturalWidth > 0)).length;
  return results.filter((ok) => !ok).length;
};

const blockHeight = (el) => {
  const style = getComputedStyle(el);
  return Math.ceil(el.getBoundingClientRect().height + parseFloat(style.marginTop || 0) + parseFloat(style.marginBottom || 0));
};

/**
 * @param {object} itinerary the full itinerary as returned by the API
 * @param {{ onProgress?: (percent: number, message: string) => void, company?: object }} [options]
 * @returns {Promise<{ blob: Blob, filename: string, skippedPhotos: number, pages: number }>}
 */
export const generateItineraryPdf = async (itinerary, { onProgress, company = COMPANY } = {}) => {
  const report = (percent, message) => onProgress?.(percent, message);
  report(3, 'Preparing the PDF…');
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const facts = documentFacts(itinerary);

  // Off-screen stage: a measuring area and a page area, both removed at the end whatever happens.
  const stage = document.createElement('div');
  stage.setAttribute('aria-hidden', 'true');
  stage.style.cssText = `position:fixed;left:-20000px;top:0;width:${PAGE_W}px;background:#fff;pointer-events:none;`;
  document.body.appendChild(stage);
  const measure = document.createElement('div');
  measure.style.cssText = `width:${DOC_WIDTH}px;`;
  const pagesHost = document.createElement('div');
  stage.append(measure, pagesHost);

  const root = createRoot(measure);
  try {
    flushSync(() => root.render(<ItineraryDocument itinerary={itinerary} company={company} logoUrl={logo} />));
    report(10, 'Loading photos…');
    await document.fonts?.ready;
    const failedImages = await loadImages(measure);

    // Photos that could not be loaded would leave a blank hole: take them out and report them.
    measure.querySelectorAll('img').forEach((img) => {
      if (!(img.complete && img.naturalWidth > 0)) {
        const holder = img.closest('figure') || img;
        holder.remove();
      }
    });

    report(25, 'Laying out the pages…');
    const blocks = Array.from(measure.querySelectorAll('[data-block]')).filter((el) => el.isConnected);
    const sizes = blocks.map((el) => ({ height: blockHeight(el), keepWithNext: el.hasAttribute('data-keep-next') }));
    const layout = packBlocks(sizes, CAPACITY);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const mmW = 210;
    const mmH = 297;
    let pdfPages = 0;

    for (let p = 0; p < layout.length; p += 1) {
      report(30 + Math.round((p / layout.length) * 62), `Creating page ${p + 1} of ${layout.length}…`);
      const indexes = layout[p];
      const oversized = indexes.length === 1 && sizes[indexes[0]].height > CAPACITY;

      const pageEl = document.createElement('div');
      pageEl.style.cssText = `width:${PAGE_W}px;${oversized ? 'min-height' : 'height'}:${PAGE_H}px;box-sizing:border-box;padding:${MARGIN_TOP}px ${MARGIN_X}px ${MARGIN_BOTTOM}px;background:#fff;overflow:hidden;`;
      // The document's own stylesheet lives in the measuring area; give each page a copy so the blocks keep their look.
      const inner = document.createElement('div');
      inner.className = 'itin-doc';
      inner.style.cssText = `width:${DOC_WIDTH}px;`;
      indexes.forEach((i) => inner.appendChild(blocks[i]));
      pageEl.appendChild(inner);
      pagesHost.appendChild(pageEl);

      const canvas = await html2canvas(pageEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: PAGE_W });
      const data = canvas.toDataURL('image/jpeg', 0.92);
      const pageMm = (canvas.height / canvas.width) * mmW;

      if (!oversized || pageMm <= mmH + 1) {
        if (pdfPages) pdf.addPage('a4', 'portrait');
        pdf.addImage(data, 'JPEG', 0, 0, mmW, Math.min(pageMm, mmH), undefined, 'FAST');
        pdfPages += 1;
      } else {
        // One block taller than a page (a very long text): continue it over as many sheets as needed.
        for (let offset = 0; offset < pageMm - 2; offset += mmH) {
          if (pdfPages) pdf.addPage('a4', 'portrait');
          pdf.addImage(data, 'JPEG', 0, -offset, mmW, pageMm, undefined, 'FAST');
          pdfPages += 1;
        }
      }
      pageEl.remove();
    }

    // Running header and page numbers on every sheet.
    for (let n = 1; n <= pdfPages; n += 1) {
      pdf.setPage(n);
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      if (n > 1) pdf.text(`${company.name}  ·  ${facts.title}`, mmW / 2, 12, { align: 'center' });
      pdf.text(`${facts.title}  ·  Page ${n} of ${pdfPages}`, mmW / 2, mmH - 10, { align: 'center' });
    }

    report(96, 'Creating the file…');
    const blob = pdf.output('blob');
    report(100, 'Done');
    return { blob, filename: `${facts.fileBase}.pdf`, skippedPhotos: failedImages, pages: pdfPages };
  } finally {
    root.unmount();
    stage.remove();
  }
};

export default generateItineraryPdf;
