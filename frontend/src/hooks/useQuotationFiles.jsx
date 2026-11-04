import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import QuotationDocumentView from '../components/QuotationDocumentView';
import { generateQuotationPDF } from '../utils/quotationPdfGenerator';
import { shareFileName } from '../utils/shareContact';

/** An error whose message is meant to be read by the person (anything else is a technical failure and gets a general sentence). */
const sayable = (message) => Object.assign(new Error(message), { userMessage: message });

/**
 * Makes the PDF or the Word file of a quotation on demand, the same files the rest of the app downloads.
 *
 * Put `host` somewhere in the page: it is where the quotation is drawn (off screen) while its PDF is made, and it is empty the rest
 * of the time. `pdf(quotation, { save })` resolves with `{ filename, blob }` (or just downloads it when `save` is true); `docx(quotation)`
 * resolves with `{ filename, blob }` (visa quotations only). Only one file is made at a time.
 *
 * A booking confirmation is the quotation as it was sold with the booking page in front: `pdf(quotation, { before, filename })` draws
 * those pages first (`before` is the same function the preview window gives the document) and names the file as asked.
 */
export const useQuotationFiles = () => {
  const hostId = `qf-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [pending, setPending] = useState(null);
  const start = useRef(null);
  const busy = useRef(false);

  // The quotation is drawn first; this runs once it is on the page.
  useEffect(() => {
    if (pending && start.current) {
      const go = start.current;
      start.current = null;
      go();
    }
  }, [pending]);

  const pdf = useCallback(
    (quotation, { save = false, onProgress = null, before = null, filename: asked = '' } = {}) =>
      new Promise((resolve, reject) => {
        if (busy.current) return reject(sayable('Another file is being prepared. Please wait a moment and try again.'));
        busy.current = true;
        const filename = asked || shareFileName(quotation, 'pdf');
        start.current = async () => {
          try {
            await new Promise((r) => setTimeout(r, 150)); // let the page finish drawing
            const result = await generateQuotationPDF(hostId, filename, onProgress, { save });
            resolve(save ? { filename } : { filename, blob: result });
          } catch (error) {
            reject(error);
          } finally {
            busy.current = false;
            setPending(null);
          }
        };
        setPending({ quotation, before });
      }),
    [hostId]
  );

  const docx = useCallback(async (quotation) => {
    if (quotation?.quotationType === 'Visa') {
      const { generateVisaQuotationDocx } = await import('../utils/quotationDocx');
      return generateVisaQuotationDocx(quotation);
    }
    const { generateQuotationDocx } = await import('../utils/quotationDocx');
    return generateQuotationDocx(quotation);
  }, []);

  const host = pending ? (
    <div aria-hidden="true" style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: '794px' }}>
      <QuotationDocumentView quotation={pending.quotation} pageNumber={null} id={hostId} before={pending.before} />
    </div>
  ) : null;

  return { host, pdf, docx, working: Boolean(pending) };
};

export default useQuotationFiles;
