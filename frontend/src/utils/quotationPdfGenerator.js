import { formatDate } from './dateHelper';
import { toDisplayHtml } from './richText'; // the flight note can be formatted: this escapes plain text and cleans formatted text
import { mediaUrl } from '../services/mediaService';
import { fullAddress } from './companyHeader';
import { finalizeDocument } from '../components/quotationDoc/finalize';
import { DOC_FONTS_HREF } from '../components/quotationDoc/tokens';

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

/** A page this little (px) over A4 is not split: its footer moves up that far, into the empty space above it (see sealPages). */
const SQUEEZE = 14;
/** The room a sheet has under its header and above its footer (px). */
const SHEET_ROOM = 860;
/** How much taller than a sheet a page may be and still be drawn smaller onto one sheet. */
const MAX_SHRINK = 1.35;
/** The space left above a section that is moved up under another. */
const JOIN_GAP = 16;

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

    while (current && current.scrollHeight > limit + SQUEEZE && guard < 40) {
      guard += 1;
      const flow = current.querySelector('.quotation-flow');
      if (!flow) break;

      const keeps = () => Array.from(current.querySelectorAll('.quotation-keep'));
      if (keeps().length <= 1) break;

      const overflow = [];
      const carry = () => {
        const node = keeps()[keeps().length - 1];
        overflow.unshift(node);
        node.remove();
      };
      // A page is never stripped down to its headings alone (a banner or a section band): that is worse than running a little over.
      const canGive = () => keeps().length > 1 && keeps().slice(0, -1).some((k) => !k.classList.contains('qd-keepnext'));
      while (current.scrollHeight > limit + SQUEEZE && canGive()) carry();
      if (overflow.length === 0) break;
      // A heading is never left alone at the foot of a sheet: it goes over with what it introduces.
      while (keeps().length > 1 && keeps()[keeps().length - 1].classList.contains('qd-keepnext')) carry();

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

/** A page this bare (px) takes the last block of the page before it, when the two belong to the same section. */
const BARE_PAGE = 300;

/** The blocks of a page and where they start and end, measured from the top of the page. */
const blocksOf = (page) => {
  const nodes = Array.from(page.querySelectorAll('.quotation-keep'));
  if (!nodes.length) return null;
  const top = page.getBoundingClientRect().top;
  return { nodes, start: nodes[0].getBoundingClientRect().top - top, end: Math.max(...nodes.map((n) => n.getBoundingClientRect().bottom)) - top };
};

/** The pages that may be filled from one another: the framed pages of the trip itself (not the covers). */
const joinable = (page) => Boolean(page?.hasAttribute('data-qd-page') && !page.matches('.qd-cover') && page.querySelector('.quotation-flow'));

const isHeading = (node) => node.classList.contains('qd-keepnext');

/** What has to move together from the top of a page: one block, or a section's heading with the first thing under it. */
const leadingGroup = (nodes, whole) => {
  if (whole) return nodes;
  let n = 0;
  while (n < nodes.length && isHeading(nodes[n])) n += 1;
  return nodes.slice(0, n + 1);
};

/**
 * Fills every sheet: the first blocks of a page move up while they fit on the page before, so a document has no half-empty pages in the
 * middle of it. A page marked "qd-whole" (the list of days) only moves up in one piece. Page numbers and contents are worked out afterwards.
 */
const packPages = (root) => {
  let pages = Array.from(root.querySelectorAll('.quotation-page'));
  for (let i = 1; i < pages.length; i += 1) {
    const page = pages[i];
    const before = pages[i - 1];
    if (!joinable(page) || !joinable(before) || !blocksOf(before)) continue;
    const target = before.querySelector('.quotation-flow');
    const source = page.querySelector('.quotation-flow');
    let mine = blocksOf(page);
    while (mine) {
      const group = leadingGroup(mine.nodes, page.matches('.qd-whole'));
      const margin = group[0].style.marginTop;
      if (isHeading(group[0])) group[0].style.marginTop = `${JOIN_GAP}px`;
      group.forEach((node) => target.appendChild(node));
      if (before.scrollHeight > a4HeightPx(before) + 1) {
        group[0].style.marginTop = margin;
        source.prepend(...group); // they do not fit: back where they were
        break;
      }
      mine = blocksOf(page);
    }
    if (!mine) {
      page.remove();
      pages = Array.from(root.querySelectorAll('.quotation-page'));
      i -= 1;
    }
  }
};

/** A page left with only a scrap takes blocks (with their headings) from the end of the previous page of the same section. */
const fillBarePages = (root) => {
  const pages = Array.from(root.querySelectorAll('.quotation-page'));
  const header = (el) => el.querySelector('.qd-head-label')?.textContent || '';
  pages.forEach((page, i) => {
    const before = pages[i - 1];
    if (!joinable(page) || !joinable(before) || header(page) !== header(before)) return;
    for (;;) {
      const mine = blocksOf(page);
      const theirs = blocksOf(before)?.nodes || [];
      // the page before always keeps something of its own
      if (!mine || mine.end - mine.start > BARE_PAGE || theirs.filter((n) => !isHeading(n)).length < 2) return;
      const moving = [theirs[theirs.length - 1]];
      while (theirs[theirs.length - 1 - moving.length] && isHeading(theirs[theirs.length - 1 - moving.length])) moving.unshift(theirs[theirs.length - 1 - moving.length]);
      const lent = moving.reduce((sum, n) => sum + n.getBoundingClientRect().height, 0);
      if (lent + (mine.end - mine.start) > SHEET_ROOM) return;
      page.querySelector('.quotation-flow').prepend(...moving);
    }
  });
};

/**
 * Makes every sheet exactly A4: on a page a few pixels over, the footer moves up into the space above it, and the height is then fixed, so the
 * browser's own Print never spills a sliver onto an extra, blank sheet.
 */
const sealPages = (root) => {
  root.querySelectorAll('.quotation-page').forEach((page) => {
    const limit = a4HeightPx(page);
    const over = page.scrollHeight - limit;
    const foot = page.querySelector('.qd-foot');
    if (over > 0 && over <= SQUEEZE && foot) foot.style.marginTop = `-${over}px`;
    if (page.scrollHeight <= limit + 1) {
      page.style.setProperty('height', '297mm', 'important');
      page.style.setProperty('overflow', 'hidden', 'important');
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
    font-family: 'Montserrat', 'Plus Jakarta Sans', -apple-system, sans-serif;
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
    max-height: none !important;
    page-break-before: always !important;
    break-before: page !important;
    page-break-after: auto !important;
    break-after: auto !important;
    page-break-inside: auto !important;
    border: none !important;
    box-shadow: none !important;
    margin: 0 !important;
    border-radius: 0 !important;
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
      <title>Quotation</title>
      <link href="${DOC_FONTS_HREF}" rel="stylesheet">
      <style>${PRINT_PAGE_CSS}</style>
    </head>
    <body>
      ${bodyHtml}
    </body>
  </html>
`;

const IMAGE_WAIT_MS = 20000;

const waitForPrintFrame = async (iframe) => {
  const doc = iframe.contentDocument;
  if (doc?.fonts?.ready) {
    await doc.fonts.ready;
  }
  const images = Array.from(doc?.images || []);
  const loaded = Promise.all(images.map((img) => (img.complete ? null : new Promise((resolve) => {
    img.onload = resolve;
    img.onerror = resolve;
  }))));
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, IMAGE_WAIT_MS))]); // a photo that never answers must not hang the file
  await new Promise((resolve) => setTimeout(resolve, 60));
};

/**
 * Turns every drawing (inline SVG: the frame, the ornaments, the icons) into one picture with the same size and place. The page renderer
 * copies the style of every single shape of an inline drawing, which made each page slow to capture; a picture is copied once.
 */
const flattenDrawings = async (doc) => {
  const view = doc.defaultView;
  const serializer = new view.XMLSerializer();
  const sources = new Map(); // the same ornament repeats on every page: one address, decoded once
  const jobs = Array.from(doc.querySelectorAll('.quotation-page svg')).map((svg) => {
    const box = svg.getBoundingClientRect();
    const style = view.getComputedStyle(svg);
    const width = parseFloat(style.width) || box.width;
    const height = parseFloat(style.height) || box.height;
    if (!width || !height) return null;
    const copy = svg.cloneNode(true);
    copy.removeAttribute('class');
    copy.removeAttribute('style');
    copy.setAttribute('width', String(width * 3)); // drawn larger than shown, so it stays sharp on the printed page
    copy.setAttribute('height', String(height * 3));
    if (!copy.getAttribute('viewBox')) copy.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const markup = serializer.serializeToString(copy).replace(/currentColor/g, style.color);
    if (!sources.has(markup)) sources.set(markup, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
    const img = doc.createElement('img');
    img.alt = '';
    img.src = sources.get(markup);
    if (svg.getAttribute('class')) img.setAttribute('class', svg.getAttribute('class'));
    for (const name of ['display', 'position', 'left', 'top', 'right', 'bottom', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'opacity', 'flex-grow', 'flex-shrink', 'flex-basis', 'vertical-align']) {
      img.style.setProperty(name, style.getPropertyValue(name));
    }
    img.style.width = `${width}px`;
    img.style.height = `${height}px`;
    return { svg, img };
  }).filter(Boolean);
  jobs.forEach(({ svg, img }) => svg.replaceWith(img));
  await Promise.all(jobs.map(({ img }) => (img.complete ? null : new Promise((resolve) => {
    img.onload = resolve;
    img.onerror = resolve;
  }))));
};

/**
 * Lay the quotation out at A4 print size, then split overflow onto more sheets.
 */
const openPrintFrame = async (container, { flatten = false } = {}) => {
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
  packPages(doc);
  fillBarePages(doc);
  sealPages(doc);
  finalizeDocument(doc.body, { perSheet: false }); // the sheets are now exact: number them and fill the contents
  if (flatten) await flattenDrawings(doc);
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
export const generateQuotationPDF = async (containerId, filename = '7Heaven_Quotation.pdf', onProgress = null, { save = true, onPages = null } = {}) => {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Quotation container #${containerId} not found in DOM.`);
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

  let frame;
  try {
  frame = await openPrintFrame(container, { flatten: true });
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

    // The web links on the page (the MAP buttons), measured now so they can be laid over the picture of the page as real links.
    const pageRect = pageEl.getBoundingClientRect();
    const links = Array.from(pageEl.querySelectorAll('a[href^="http"]')).map((a) => {
      const r = a.getBoundingClientRect();
      return { x: r.left - pageRect.left, y: r.top - pageRect.top, w: r.width, h: r.height, url: a.href };
    });

    // High fidelity canvas render at 2x scale for crisp print quality
    const canvas = await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 794,
      // Only this page is copied for its picture: copying all the others each time made a long document many times slower.
      ignoreElements: (el) => el !== pageEl && el.classList?.contains('quotation-page'),
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

    // Every page of the document is one sheet. One that is still taller than a sheet (a single block that cannot be split) is drawn a
    // little smaller, so its footer is never cut off onto a sheet of its own; only something far longer is continued over further sheets.
    if (imgHeight <= a4PageHeight * MAX_SHRINK) {
      if (!isFirstPdfPage) {
        pdf.addPage('a4', 'portrait');
      }
      const tall = imgHeight > a4PageHeight + 0.5;
      const drawHeight = tall || imgHeight >= a4PageHeight - 8 ? a4PageHeight : imgHeight;
      const drawWidth = tall ? (imgWidth * a4PageHeight) / imgHeight : imgWidth;
      const left = (imgWidth - drawWidth) / 2;
      if (tall) {
        pdf.setFillColor(255, 252, 244); // the colour of the paper, beside the narrowed page
        pdf.rect(0, 0, imgWidth, a4PageHeight, 'F');
      }
      pdf.addImage(imgData, 'JPEG', left, 0, drawWidth, drawHeight, undefined, 'FAST');
      if (pageRect.width && pageRect.height) {
        const sx = drawWidth / pageRect.width;
        const sy = drawHeight / pageRect.height;
        links.forEach((l) => pdf.link(left + l.x * sx, l.y * sy, l.w * sx, l.h * sy, { url: l.url }));
      }
      isFirstPdfPage = false;
    } else {
      let heightLeft = imgHeight;
      let subPage = 0;
      while (heightLeft > 18) {
        if (!isFirstPdfPage) {
          pdf.addPage('a4', 'portrait');
        }
        pdf.addImage(imgData, 'JPEG', 0, -(subPage * a4PageHeight), imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= a4PageHeight;
        subPage++;
        isFirstPdfPage = false;
      }
    }
  }

  onPages?.(pdf.getNumberOfPages());
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
 * The document as the PDF and the printer lay it out (the same pages, split, filled and numbered), as markup for showing on screen. Empty
 * when the document is not laid out (nothing to measure).
 */
export const paginatedMarkup = async (containerId) => {
  const container = document.getElementById(containerId);
  if (!container || !container.getBoundingClientRect().width) return '';
  const frame = await openPrintFrame(container);
  try {
    const copy = frame.contentDocument.querySelector('.quotation-doc-container')?.cloneNode(true);
    if (!copy) return '';
    copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id')); // the original document keeps its ids to itself
    copy.id = `${containerId}-pages`;
    return copy.outerHTML;
  } finally {
    frame.parentElement?.remove();
    frame.remove();
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
  const screenshots = (quotation.flightImages || []).filter((photo) => photo && typeof photo.token === 'string');
  // The screenshots of the flight, each one whole, one under the other (the token is part of an address, so it is encoded and escaped).
  const screenshotsHtml = screenshots.map((photo) => `
    <figure style="margin: 0 0 16px; text-align: center; break-inside: avoid;">
      <img src="${esc(mediaUrl(photo.token))}" alt="${esc(photo.caption || 'Flight details')}" style="display: block; width: 100%; max-height: 640px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 6px;">
      ${photo.caption ? `<figcaption style="margin-top: 4px; font-size: 11px; font-style: italic; color: #000000;">${esc(photo.caption)}</figcaption>` : ''}
    </figure>`).join('');

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
  `).join('') : (screenshots.length ? '' : `
    <div style="text-align: center; padding: 24px; color: #000000; font-style: italic;">
      No specific flight segments entered. Flight details will be as per confirmed flight ticket.
    </div>
  `));

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
          ${screenshotsHtml}
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
          <div>${esc(fullAddress(company.address))}</div>
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
