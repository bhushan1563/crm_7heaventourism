// Itinerary -> PDF, in the same design as a quotation. The document is drawn off-screen and handed to the quotation's PDF maker, which
// splits it onto A4 pages and captures each one as a picture (so the text cannot be selected; the Word file is for editing). html2canvas and
// jsPDF are loaded only when someone presses "Download PDF".
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { COMPANY } from '../config';
import ItineraryProposal from '../components/quotationDoc/ItineraryProposal';
import { documentFacts } from './itineraryDoc';
import { generateQuotationPDF } from './quotationPdfGenerator';

const IMAGE_TIMEOUT_MS = 25000;

const settle = (img) =>
  new Promise((resolve) => {
    if (img.complete) return resolve(img.naturalWidth > 0);
    img.addEventListener('load', () => resolve(true), { once: true });
    img.addEventListener('error', () => resolve(false), { once: true });
  });

/** Waits for every photo (never longer than the timeout), takes out the ones that did not load, and resolves how many those were. */
const loadPhotos = async (root) => {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.race([Promise.all(images.map(settle)), new Promise((resolve) => setTimeout(resolve, IMAGE_TIMEOUT_MS))]);
  const missing = images.filter((img) => !(img.complete && img.naturalWidth > 0));
  missing.forEach((img) => (img.closest('figure') || img).remove()); // a photo that is not there would leave a blank hole
  return missing.length;
};

let made = 0;

/**
 * @param {object} itinerary the full itinerary as returned by the API
 * @param {{ onProgress?: (percent: number, message: string) => void, company?: object }} [options]
 * @returns {Promise<{ blob: Blob, filename: string, skippedPhotos: number, pages: number }>}
 */
export const generateItineraryPdf = async (itinerary, { onProgress, company = COMPANY } = {}) => {
  const report = (percent, message) => onProgress?.(percent, message);
  report(3, 'Preparing the PDF…');
  const filename = `${documentFacts(itinerary).fileBase}.pdf`;
  made += 1;
  const id = `itinerary-pdf-${made}`;

  const stage = document.createElement('div');
  stage.setAttribute('aria-hidden', 'true');
  stage.style.cssText = 'position:fixed;left:-20000px;top:0;width:794px;background:#fff;pointer-events:none;';
  document.body.appendChild(stage);
  const root = createRoot(stage);
  try {
    flushSync(() => root.render(<ItineraryProposal itinerary={itinerary} company={company} id={id} />));
    report(6, 'Loading photos…');
    const skippedPhotos = await loadPhotos(stage);
    let pages = 0;
    const blob = await generateQuotationPDF(id, filename, (percent, message) => report(Math.max(8, percent), message), { save: false, onPages: (n) => { pages = n; } });
    report(100, 'Done');
    return { blob, filename, skippedPhotos, pages };
  } finally {
    root.unmount();
    stage.remove();
  }
};

export default generateItineraryPdf;
