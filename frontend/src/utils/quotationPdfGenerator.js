import { formatDate } from './dateHelper';
import { toDisplayHtml } from './richText'; // the flight note can be formatted: this escapes plain text and cleans formatted text

// html2canvas and jspdf are large, so they are loaded only when a PDF is generated.

/** Escapes text that is interpolated into hand-built HTML (print windows), so quotation fields can never inject markup. */
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Only plain web links may become clickable (blocks javascript: and data: URLs). */
const safeUrl = (value) => (/^https?:\/\//i.test(String(value ?? '').trim()) ? String(value).trim() : '');

/**
 * Prints a document that was written into a window we opened. The print call is made from this page rather than from
 * an inline <script> in the new document, which the app's Content-Security-Policy does not allow.
 */
const printWhenReady = (printWindow) => {
  let started = false;
  const start = () => {
    if (started || printWindow.closed) return;
    started = true;
    printWindow.focus();
    printWindow.print();
    setTimeout(() => printWindow.close(), 500);
  };
  printWindow.addEventListener('load', start); // after document.close(), once fonts/images have loaded
  setTimeout(start, 2500); // fallback when the load event never arrives
};

/** Height of one A4 sheet for a page laid out at print width. */
const a4HeightPx = (page) => {
  const width = page.getBoundingClientRect().width || page.clientWidth || 794;
  return Math.round(width * (297 / 210));
};

/**
 * Moves overflowing .quotation-keep blocks onto continuation pages
 * so each sheet stays within one A4 page. Header and footer are repeated.
 */
const splitTallPages = (root) => {
  const pages = Array.from(root.querySelectorAll('.quotation-page'));

  pages.forEach((startPage) => {
    let current = startPage;
    let guard = 0;
    let limit = a4HeightPx(current);

    while (current && current.scrollHeight > limit && guard < 40) {
      guard += 1;
      const flow = current.querySelector('.quotation-flow');
      if (!flow) break;

      const keeps = () => Array.from(current.querySelectorAll('.quotation-keep'));
      if (keeps().length <= 1) break;

      const overflow = [];
      while (current.scrollHeight > limit && keeps().length > 1) {
        const remaining = keeps();
        const last = remaining[remaining.length - 1];
        overflow.unshift(last);
        last.remove();
      }

      if (overflow.length === 0) break;

      const clone = current.cloneNode(true);
      clone.id = `${startPage.id}-more-${guard}`;
      const cloneFlow = clone.querySelector('.quotation-flow');
      if (!cloneFlow) break;
      cloneFlow.textContent = '';
      overflow.forEach((node) => cloneFlow.appendChild(node));
      current.insertAdjacentElement('afterend', clone);
      current = clone;
      limit = a4HeightPx(current);
    }
  });
};

const PRINT_PAGE_CSS = `
  @page { size: A4 portrait; margin: 0; }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    width: 210mm;
  }
  body {
    font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .quotation-doc-container {
    gap: 0 !important;
    display: block !important;
    width: 210mm !important;
  }
  .quotation-page {
    box-sizing: border-box;
    width: 210mm !important;
    max-width: 210mm !important;
    min-height: 297mm !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    padding: 14mm 16mm !important;
    page-break-before: always !important;
    break-before: page !important;
    page-break-after: auto !important;
    break-after: auto !important;
    page-break-inside: auto !important;
    border: none !important;
    box-shadow: none !important;
    margin: 0 !important;
    border-radius: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: flex-start !important;
    background: #ffffff !important;
  }
  .quotation-page:first-child {
    page-break-before: auto !important;
    break-before: auto !important;
  }
  .quotation-keep {
    break-inside: avoid;
    page-break-inside: avoid;
  }
`;

const buildQuotationPrintHtml = (bodyHtml) => `
  <!DOCTYPE html>
  <html>
    <head>
      <title>7Heaven Tourism Quotation</title>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@700;800;900&display=swap" rel="stylesheet">
      <style>${PRINT_PAGE_CSS}</style>
    </head>
    <body>
      ${bodyHtml}
    </body>
  </html>
`;

const waitForPrintFrame = async (iframe) => {
  const doc = iframe.contentDocument;
  if (doc?.fonts?.ready) {
    await doc.fonts.ready;
  }
  const images = Array.from(doc?.images || []);
  await Promise.all(images.map((img) => (img.complete ? null : new Promise((resolve) => {
    img.onload = resolve;
    img.onerror = resolve;
  }))));
  await new Promise((resolve) => setTimeout(resolve, 60));
};

/**
 * Lay the quotation out at A4 print size, then split overflow onto more sheets.
 */
const openPrintFrame = async (container) => {
  const host = document.createElement('div');
  host.setAttribute('data-quotation-print-host', 'true');
  host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;border:0;padding:0;margin:0;pointer-events:none;';

  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-quotation-print-frame', 'true');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'width:210mm;height:297mm;border:0;background:#ffffff;';
  host.appendChild(iframe);
  document.body.appendChild(host);

  const doc = iframe.contentDocument;
  doc.open();
  doc.write(buildQuotationPrintHtml(container.outerHTML));
  doc.close();

  await waitForPrintFrame(iframe);
  iframe.style.height = `${Math.max(doc.body.scrollHeight, 1123)}px`;
  splitTallPages(doc);
  iframe.style.height = `${Math.max(doc.body.scrollHeight, 1123)}px`;
  return iframe;
};

/**
 * Generates and downloads a multi-page A4 PDF from DOM elements representing the quotation pages.
 * Package Details starts on a new page. Terms, Policies, and Exclusions & Guidelines share one page.
 * Content that does not fit continues on additional A4 pages.
 * @param {string} containerId - The HTML element ID containing the .quotation-page elements
 * @param {string} filename - Desired output filename
 * @param {Function} onProgress - Optional progress callback
 * @param {{ save?: boolean }} [options] - `save: false` returns the PDF as a Blob instead of downloading it (for sharing)
 */
export const generateQuotationPDF = async (containerId, filename = '7Heaven_Quotation.pdf', onProgress = null, { save = true } = {}) => {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Quotation container #${containerId} not found in DOM.`);
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

  let frame;
  try {
  frame = await openPrintFrame(container);
  const printDoc = frame.contentDocument;

  let pages = Array.from(printDoc.querySelectorAll('.quotation-page'));
  if (pages.length === 0) {
    pages = [printDoc.body];
  }

  if (onProgress) {
    onProgress(10, 'Preparing high-resolution pages...');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  const imgWidth = 210; // Standard A4 width in mm
  const a4PageHeight = 297; // Standard A4 height in mm
  const totalPages = pages.length;

  let isFirstPdfPage = true;

  for (let i = 0; i < totalPages; i++) {
    const pageEl = pages[i];
    if (onProgress) {
      const pct = Math.round(15 + ((i + 0.5) / totalPages) * 75);
      onProgress(pct, `Rendering page ${i + 1} of ${totalPages}...`);
    }

    // High fidelity canvas render at 2x scale for crisp print quality
    const canvas = await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 794,
      onclone: (clonedDoc) => {
        const clonedPage = clonedDoc.getElementById(pageEl.id) || clonedDoc.querySelector(`[id="${pageEl.id}"]`);
        if (clonedPage) {
          clonedPage.style.boxShadow = 'none';
          clonedPage.style.margin = '0 auto';
        }
      }
    });

    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    // One A4 sheet when the section fits. A few millimetres over is scaled
    // onto the sheet; anything taller is continued on the next pages.
    if (imgHeight <= a4PageHeight + 15) {
      if (!isFirstPdfPage) {
        pdf.addPage('a4', 'portrait');
      }
      const drawHeight = imgHeight >= a4PageHeight - 8 ? a4PageHeight : Math.min(imgHeight, a4PageHeight);
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, drawHeight, undefined, 'FAST');
      isFirstPdfPage = false;
    } else {
      // In case an individual section is unusually long, slice it across sub-pages
      let heightLeft = imgHeight;
      let position = 0;
      let subPage = 0;

      while (heightLeft > 18) {
        if (!isFirstPdfPage) {
          pdf.addPage('a4', 'portrait');
        }
        position = -(subPage * a4PageHeight);
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= a4PageHeight;
        subPage++;
        isFirstPdfPage = false;
      }
    }
  }

  if (onProgress) {
    onProgress(100, 'Finalizing PDF download...');
  }

  if (!save) return pdf.output('blob');
  pdf.save(filename);
  return true;
  } finally {
    if (frame) {
      frame.parentElement?.remove();
      frame.remove();
    }
  }
};

/**
 * Quick browser print trigger for quotation with proper page breaks
 */
export const printQuotation = (containerId) => {
  const container = document.getElementById(containerId);
  if (!container) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.print();
    return;
  }

  openPrintFrame(container).then((frame) => {
    const printableHtml = frame.contentDocument.body.innerHTML;
    frame.parentElement?.remove();
    frame.remove();
    printWindow.document.open();
    printWindow.document.write(buildQuotationPrintHtml(printableHtml));
    printWindow.document.close();
    printWhenReady(printWindow);
  }).catch(() => {
    printWindow.close();
  });
};

/**
 * Quick flight voucher print trigger.
 * Every quotation field is HTML-escaped: the voucher is written into a new window, so unescaped text would let
 * whoever can edit a quotation run script for whoever prints it.
 */
export const printFlightVoucher = (quotation) => {
  if (!quotation) return;
  const company = quotation.companyDetails || {
    name: '7HEAVEN TOURISM',
    tagline: 'Travel with the Trust',
    address: '405 (FOF) Kanha Capital, Above IDFC bank, Opp Express Tower Hotel, Alkapuri 390007, Vadodara',
    phone: '+91 7862829178',
    email: 'sales@7heaventourism.in',
    website: 'www.7heaventourism.in'
  };
  const co = Object.fromEntries(Object.entries(company).map(([key, value]) => [key, esc(value)]));

  const flightDetails = quotation.flightDetails || [];
  const asPerTicket = quotation.asPerFlightTicket;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.print();
    return;
  }

  const ticketUrl = safeUrl(quotation.flightTicketUrl);
  const ticketLink = ticketUrl
    ? `<a href="${esc(ticketUrl)}" target="_blank" rel="noopener noreferrer" style="color: #0284c7;">${esc(ticketUrl)}</a>`
    : esc(quotation.flightTicketUrl);

  const withDate = (date) => (date ? ` (${esc(formatDate(date))})` : '');

  const flightCardsHtml = asPerTicket ? `
    <div style="border: 2px solid #0284c7; background: #f0f9ff; padding: 24px; border-radius: 8px; text-align: center; margin: 24px 0;">
      <div style="font-size: 18px; font-weight: 800; color: #0369a1; margin-bottom: 8px;">
        ✈️ Flight Details As Per Issued Flight Ticket
      </div>
      <div style="font-size: 13px; color: #000000; line-height: 1.5; max-width: 540px; margin: 0 auto;">
        ${toDisplayHtml(quotation.flightTicketNote || 'Official airline PNR and confirmed e-tickets will be shared upon booking confirmation and flight ticket issuance.')}
      </div>
      ${quotation.flightTicketUrl ? `
        <div style="margin-top: 14px; font-size: 12px; color: #0284c7; font-weight: 600;">
          Attached Ticket Document: ${ticketLink}
        </div>
      ` : ''}
    </div>
  ` : (flightDetails.length > 0 ? flightDetails.map((f, i) => `
    <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 16px; background: #fafafa;">
      <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 10px; font-size: 12px; font-weight: 700; color: #0369a1;">
        <span>Flight #${i + 1}: ${esc(f.flightType || 'Flight Segment')}${withDate(f.departureDate || f.depDate)}</span>
        <span>${esc(f.airline || 'Airline')} ${f.flightNumber ? `(${esc(f.flightNumber)})` : ''}</span>
      </div>
      <div style="display: grid; grid-template-columns: 2fr 1fr 2fr; gap: 12px; align-items: center; text-align: center;">
        <div style="text-align: left;">
          <div style="font-size: 11px; color: #000000;">From</div>
          <div style="font-size: 14px; font-weight: 800; color: #0f172a;">${esc(f.fromAirport || 'Departure Airport')}</div>
          <div style="font-size: 12px; font-weight: 600; color: #0284c7;">${esc(f.depTime || '--:--')}${withDate(f.depDate)}</div>
        </div>
        <div>
          <div style="font-size: 11px; color: #000000;">${esc(f.duration || 'Direct')}</div>
          <div style="color: #b91c1c; font-size: 16px;">✈</div>
          <div style="font-size: 10px; color: #059669; font-weight: 700;">${esc(f.flightStop || 'Non-stop')}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 11px; color: #000000;">To</div>
          <div style="font-size: 14px; font-weight: 800; color: #0f172a;">${esc(f.toAirport || 'Arrival Airport')}</div>
          <div style="font-size: 12px; font-weight: 600; color: #0284c7;">${esc(f.arrTime || '--:--')}${withDate(f.arrDate)}</div>
        </div>
      </div>
      <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #e2e8f0; font-size: 11px; color: #000000; display: flex; justify-content: space-between;">
        <span>Check-in Baggage: <strong>${esc(f.baggageCheckIn || '15 kg')}</strong></span>
        <span>Class: <strong>${esc(f.cabinClass || 'Economy')}</strong></span>
      </div>
    </div>
  `).join('') : `
    <div style="text-align: center; padding: 24px; color: #000000; font-style: italic;">
      No specific flight segments entered. Flight details will be as per confirmed flight ticket.
    </div>
  `);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Flight Voucher - ${esc(quotation.quotationNo || '7Heaven')}</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            margin: 0; padding: 0;
            color: #0f172a;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .header { border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; }
          .title-badge { background: #0284c7; color: white; padding: 4px 12px; border-radius: 4px; font-size: 13px; font-weight: 800; letter-spacing: 0.1em; display: inline-block; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; padding: 14px; border-radius: 6px; margin-bottom: 20px; font-size: 12px; border: 1px solid #e2e8f0; }
          .instructions { font-size: 10px; color: #000000; line-height: 1.5; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px; }
          .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #000000; border-top: 1px solid #cbd5e1; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 style="font-size: 22px; font-weight: 900; color: #0f172a; margin: 0;">${co.name}</h1>
            <div style="font-size: 10px; color: #0284c7; font-weight: 700; letter-spacing: 0.1em; margin-top: 2px;">AIRLINE TICKETS & TRAVEL VOUCHER</div>
          </div>
          <div style="text-align: right; font-size: 11px; color: #000000;">
            <div><strong>Ref:</strong> ${esc(quotation.quotationNo || '7H-QT-2026')}</div>
            <div><strong>Date:</strong> ${esc(formatDate(quotation.travelDate) || new Date().toLocaleDateString())}</div>
          </div>
        </div>

        <div style="text-align: center; margin-bottom: 16px;">
          <div class="title-badge">OFFICIAL FLIGHT ITINERARY / TICKET VOUCHER</div>
        </div>

        <div class="meta-grid">
          <div><strong>Passenger / Guest:</strong> ${esc(quotation.clientName || 'Valued Guest')}</div>
          <div><strong>Total Pax:</strong> ${esc(quotation.paxDetails || '1')}</div>
          <div><strong>Destination:</strong> ${esc(quotation.destination || 'Tour Destination')}</div>
          <div><strong>Travel Date:</strong> ${esc(formatDate(quotation.travelDate) || 'As confirmed')}</div>
        </div>

        <div>
          <h3 style="font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 12px; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 4px;">
            Flight Segment & Route Details
          </h3>
          ${flightCardsHtml}
        </div>

        <div class="instructions">
          <strong>Important Flight Guidelines & Airport Check-in Instructions:</strong>
          <ul style="margin: 6px 0 0 0; padding-left: 18px;">
            <li>Please report to the departure airport check-in counter at least 2 hours prior for domestic flights and 3 hours prior for international flights.</li>
            <li>All passengers must present a valid government-issued photo ID (Aadhaar / Passport / Voter ID) matching the name on the ticket.</li>
            <li>Check-in baggage and cabin baggage limits are subject to respective airline rules and fare categories.</li>
            <li>Flight timings and gate numbers are subject to last-minute changes by airline operations. Please check live airport display screens.</li>
          </ul>
        </div>

        <div class="footer">
          <div>${co.address}</div>
          <div>Phone: ${co.phone} | Email: ${co.email} | Web: ${co.website}</div>
        </div>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  printWhenReady(printWindow);
};
