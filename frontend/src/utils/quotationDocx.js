// Visa quotation -> Word (.docx), so it can be edited further in Word and sent. It says what the PDF says: who it is for and when, the
// visa, the documents the applicants must bring, the fees with their total, what is included, and the terms and policies. The library
// is loaded only when someone asks for the Word file. Formatting of the lines (bold, colour, lists...) becomes real Word formatting.
import { COMPANY } from '../config';
import { formatDate } from './dateHelper';
import { richBlocks } from './itineraryDoc';
import { toDocxColor, toHalfPoints } from './itineraryDocx';
import { shareFileName } from './shareContact';
import { feeAmount, visaFeeTotal } from './visa';

const PAGE = { width: 11906, height: 16838, margin: 1020 }; // A4 in twips; margins about 1.8 cm
const CONTENT = PAGE.width - PAGE.margin * 2;
const BRAND = '0369A1';
const CELL_MARGINS = { top: 60, bottom: 60, left: 100, right: 100 };
// Control characters (a stray character pasted from a PDF, say) are not allowed in a Word file and can stop Word opening it.
// eslint-disable-next-line no-control-regex
const xmlSafe = (value) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
const money = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;

const styleOf = (element) => {
  const out = {};
  for (const declaration of (element.getAttribute?.('style') || '').split(';')) {
    const i = declaration.indexOf(':');
    if (i > 0) out[declaration.slice(0, i).trim().toLowerCase()] = declaration.slice(i + 1).trim();
  }
  return out;
};

/**
 * @param {object} quotation a visa quotation as the API returns it (or as the builder holds it)
 * @param {{ company?: object }} [options]
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export const generateVisaQuotationDocx = async (quotation, { company = quotation?.companyDetails?.name ? quotation.companyDetails : COMPANY } = {}) => {
  const d = await import('docx');
  const parser = new DOMParser();
  const htmlNodes = (html) => parser.parseFromString(`<body>${html}</body>`, 'text/html').body.childNodes;

  // ---- formatted text (the sanitised lines of the quotation) -> Word runs
  const runsFrom = (nodes, format = {}) => {
    const runs = [];
    for (const node of Array.from(nodes)) {
      if (node.nodeType === 3) {
        if (node.textContent) runs.push(new d.TextRun({ text: xmlSafe(node.textContent), ...format }));
      } else if (node.nodeType === 1) {
        const tag = node.tagName.toLowerCase();
        if (tag === 'br') {
          runs.push(new d.TextRun({ break: 1 }));
          continue;
        }
        const next = { ...format };
        if (tag === 'strong' || tag === 'b') next.bold = true;
        if (tag === 'em' || tag === 'i') next.italics = true;
        if (tag === 'u') next.underline = { type: d.UnderlineType.SINGLE };
        if (tag === 's') next.strike = true;
        if (tag === 'span' || tag === 'mark') {
          const style = styleOf(node);
          const color = toDocxColor(style.color);
          const fill = toDocxColor(style['background-color']);
          const size = toHalfPoints(style['font-size']);
          if (color) next.color = color;
          if (fill) next.shading = { type: d.ShadingType.CLEAR, fill, color: 'auto' };
          if (size) next.size = size;
        }
        runs.push(...runsFrom(node.childNodes, next));
      }
    }
    return runs;
  };
  const lineRuns = (value, format) => {
    const blocks = richBlocks(value);
    return blocks.length ? blocks.flatMap((b, i) => [...(i ? [new d.TextRun({ break: 1 })] : []), ...runsFrom(htmlNodes(b.tag === 'p' ? b.html : b.html.replace(/<\/?(ul|ol|li)[^>]*>/g, ' ')), format)]) : [];
  };

  // ---- building blocks
  const heading = (text) => new d.Paragraph({ heading: d.HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 260, after: 100 }, children: [new d.TextRun({ text })] });
  const bullets = (items) => items.map((item) => new d.Paragraph({ bullet: { level: 0 }, spacing: { after: 50 }, children: lineRuns(item) }));
  const numbered = (items) => items.map((item, i) => new d.Paragraph({ spacing: { after: 60 }, indent: { left: 360, hanging: 360 }, children: [new d.TextRun({ text: /^\s*\d+\./.test(String(item).replace(/<[^>]*>/g, '')) ? '' : `${i + 1}.  ` }), ...lineRuns(item)] }));
  const line = { style: d.BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
  const borders = { top: line, bottom: line, left: line, right: line };
  const cell = (children, { width, fill, align } = {}) =>
    new d.TableCell({
      width: { size: width, type: d.WidthType.DXA },
      borders,
      margins: CELL_MARGINS,
      ...(fill ? { shading: { type: d.ShadingType.CLEAR, fill, color: 'auto' } } : {}),
      children: [new d.Paragraph({ alignment: align, children })]
    });
  const text = (value, format = {}) => new d.TextRun({ text: xmlSafe(value), ...format });
  const factsTable = (rows) => {
    const widths = [Math.round(CONTENT * 0.32), CONTENT - Math.round(CONTENT * 0.32)];
    return new d.Table({
      width: { size: CONTENT, type: d.WidthType.DXA },
      columnWidths: widths,
      rows: rows.map(([label, value]) => new d.TableRow({ cantSplit: true, children: [cell([text(label, { bold: true, color: '334155' })], { width: widths[0], fill: 'F1F5F9' }), cell([text(value)], { width: widths[1] })] }))
    });
  };

  const visa = quotation.visa || {};
  const applicants = Math.max(1, Number(visa.applicants) || 1);
  const fees = quotation.visaFees || [];
  const total = visaFeeTotal(fees, applicants);
  const title = quotation.destination || [visa.country, visa.visaType, 'visa'].filter(Boolean).join(' ') || 'Visa quotation';

  const tripRows = [
    ['Client', quotation.clientName],
    ['Travellers', quotation.paxDetails],
    ['Travel date', quotation.travelDate ? formatDate(quotation.travelDate) : ''],
    ['Duration', quotation.duration],
    ['Quotation valid until', quotation.validUntil ? formatDate(quotation.validUntil) : '']
  ].filter(([, v]) => v);
  const visaRows = [
    ['Country', visa.country],
    ['Visa type', visa.visaType],
    ['Entry', visa.entryType],
    ['Issued as', visa.mode],
    ['Processing time', visa.processingTime],
    ['Validity', visa.validity],
    ['Length of stay', visa.stay],
    ['Applicants', String(applicants)]
  ].filter(([, v]) => v);

  const children = [];
  children.push(new d.Paragraph({ spacing: { after: 20 }, children: [text(company.name, { bold: true, size: 30, color: BRAND }), text(`   ${company.tagline || ''}`, { size: 18, color: '64748B' })] }));
  children.push(new d.Paragraph({ spacing: { after: 160 }, border: { bottom: { style: d.BorderStyle.SINGLE, size: 8, color: BRAND, space: 4 } }, children: [text(`Ref: ${quotation.quotationNo || '—'}`, { size: 18, color: '475569' }), text(`     Date: ${formatDate(quotation.createdAt || new Date().toISOString())}`, { size: 18, color: '475569' })] }));
  children.push(new d.Paragraph({ heading: d.HeadingLevel.TITLE, spacing: { after: 40 }, children: [text('VISA QUOTATION')] }));
  children.push(new d.Paragraph({ spacing: { after: 160 }, children: [text(title, { bold: true, size: 28, color: '0F172A' })] }));

  if (tripRows.length) children.push(heading('Applicant & trip details'), factsTable(tripRows));
  if (visaRows.length) children.push(heading('Visa details'), factsTable(visaRows));

  const documents = (quotation.visaDocuments || []).filter((x) => String(x || '').replace(/<[^>]*>/g, '').trim());
  if (documents.length) children.push(heading('Documents required'), ...bullets(documents));

  if (fees.length) {
    const widths = [Math.round(CONTENT * 0.42), Math.round(CONTENT * 0.24), Math.round(CONTENT * 0.16)];
    widths.push(CONTENT - widths[0] - widths[1] - widths[2]);
    const head = (label, i) => cell([text(label, { bold: true, color: 'FFFFFF', size: 18 })], { width: widths[i], fill: '0F172A', align: i >= 2 ? d.AlignmentType.RIGHT : undefined });
    const rows = [
      new d.TableRow({ tableHeader: true, cantSplit: true, children: ['Fee', 'Charged', 'Rate', 'Amount'].map(head) }),
      ...fees.map((f) => new d.TableRow({ cantSplit: true, children: [cell([text(f.label || 'Fee', { bold: true })], { width: widths[0] }), cell([text(f.per === 'group' ? 'Whole group' : `Per applicant × ${applicants}`)], { width: widths[1] }), cell([text(money(f.amount))], { width: widths[2], align: d.AlignmentType.RIGHT }), cell([text(money(feeAmount(f, applicants)), { bold: true })], { width: widths[3], align: d.AlignmentType.RIGHT })] })),
      new d.TableRow({
        cantSplit: true,
        children: [
          new d.TableCell({ width: { size: widths[0] + widths[1] + widths[2], type: d.WidthType.DXA }, columnSpan: 3, borders, margins: CELL_MARGINS, shading: { type: d.ShadingType.CLEAR, fill: 'FEF9C3', color: 'auto' }, children: [new d.Paragraph({ children: [text(`Total for ${applicants} applicant${applicants === 1 ? '' : 's'}`, { bold: true })] })] }),
          cell([text(total > 0 ? money(total) : 'On request', { bold: true, size: 24 })], { width: widths[3], fill: 'FEF9C3', align: d.AlignmentType.RIGHT })
        ]
      })
    ];
    children.push(heading('Fees'), new d.Table({ width: { size: CONTENT, type: d.WidthType.DXA }, columnWidths: widths, rows }));
  }
  if (visa.priceNote && String(visa.priceNote).replace(/<[^>]*>/g, '').trim()) children.push(new d.Paragraph({ spacing: { before: 100, after: 100 }, children: [text('Note: ', { italics: true, color: '64748B' }), ...lineRuns(visa.priceNote, { italics: true, color: '64748B' })] }));

  const inclusions = (quotation.visaInclusions || []).filter((x) => String(x || '').replace(/<[^>]*>/g, '').trim());
  if (inclusions.length) children.push(heading('Visa inclusions'), ...bullets(inclusions));

  // No terms, payment or cancellation policy and no exclusions: the client does not want them on a visa quotation.

  const doc = new d.Document({
    creator: xmlSafe(company.name),
    title: xmlSafe(`Visa quotation ${quotation.quotationNo || ''} ${title}`.trim()),
    description: xmlSafe([quotation.clientName, title].filter(Boolean).join(' - ')),
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', run: { size: 44, bold: true, color: '0F172A' } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, color: BRAND } }
      ]
    },
    sections: [
      {
        properties: { page: { size: { width: PAGE.width, height: PAGE.height }, margin: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin } } },
        footers: {
          default: new d.Footer({
            children: [
              new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [text([company.address, company.phone, company.email, company.website].filter(Boolean).join('   |   '), { size: 16, color: '94A3B8' })] }),
              new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [text('Page ', { size: 16, color: '94A3B8' }), new d.TextRun({ children: [d.PageNumber.CURRENT], size: 16, color: '94A3B8' }), text(' of ', { size: 16, color: '94A3B8' }), new d.TextRun({ children: [d.PageNumber.TOTAL_PAGES], size: 16, color: '94A3B8' })] })
            ]
          })
        },
        children
      }
    ]
  });

  return { blob: await d.Packer.toBlob(doc), filename: shareFileName(quotation, 'docx') };
};

export default generateVisaQuotationDocx;

/**
 * Hotel or Package quotation → Word (.docx). Mirrors what the PDF shows: client details, hotel options, inclusions, pricing
 * (Only Hotel: Package / Total / PAX / Final Price only; Package: Room / Per night / Nights / Rooms / Total), and policies.
 * @param {object} quotation  as the API returns it (or as the builder holds it)
 * @param {{ company?: object }} [options]
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export const generateQuotationDocx = async (quotation, { company = quotation?.companyDetails?.name ? quotation.companyDetails : COMPANY } = {}) => {
  const d = await import('docx');
  const { AMOUNT_COLUMNS, LAYOUT_OF_TYPE, tableLayout, tableTotal, tablesOf, tableHasData, rowTotal, rowFinal } = await import('./priceTables');
  const { roomTableTotal, roomDefaults } = await import('./roomTables');
  const rs = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const xmlSafe = (value) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
  const text = (value, format = {}) => new d.TextRun({ text: xmlSafe(String(value ?? '')), ...format });
  const lineBorder = { style: d.BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
  const borders = { top: lineBorder, bottom: lineBorder, left: lineBorder, right: lineBorder };
  const noBorder = { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
  const heading = (t, level = d.HeadingLevel.HEADING_2) => new d.Paragraph({ heading: level, keepNext: true, spacing: { before: 220, after: 80 }, children: [text(t)] });
  const bullets = (items) => items.filter((x) => String(x || '').trim()).map((item) => new d.Paragraph({ bullet: { level: 0 }, spacing: { after: 50 }, children: [text(String(item).replace(/<[^>]*>/g, ''))] }));
  const numbered = (items, start = 1) => items.filter((x) => String(x || '').trim()).map((item, i) => new d.Paragraph({ spacing: { after: 60 }, indent: { left: 360, hanging: 360 }, children: [text(`${start + i}.  ${String(item).replace(/<[^>]*>/g, '')}`)] }));
  const CELL_M = { top: 55, bottom: 55, left: 90, right: 90 };
  const cell = (children, { width, fill, align } = {}) => new d.TableCell({ width: width ? { size: width, type: d.WidthType.DXA } : undefined, borders, margins: CELL_M, ...(fill ? { shading: { type: d.ShadingType.CLEAR, fill, color: 'auto' } } : {}), children: [new d.Paragraph({ alignment: align || d.AlignmentType.LEFT, children })] });
  const table = (rows, colWidths) => new d.Table({ width: { size: CONTENT, type: d.WidthType.DXA }, columnWidths: colWidths, rows });
  const tableRow = (cells, { header = false } = {}) => new d.TableRow({ tableHeader: header, cantSplit: true, children: cells });
  const hcell = (label, w, fill = '0F172A') => cell([text(label, { bold: true, color: 'FFFFFF', size: 18 })], { width: w, fill, align: d.AlignmentType.CENTER });
  const rcell = (value, w, fmt = {}) => cell([text(value, fmt)], { width: w, align: d.AlignmentType.RIGHT });

  const quotationType = quotation.quotationType || 'Package';
  const isHotelOnly = quotationType === 'Only Hotel';
  const packageDetails = quotation.packageDetails || {};
  const hotels = packageDetails.hotels || [];
  const options = quotation.options || [];
  const inclusions = (packageDetails.inclusions || []).filter((x) => String(x || '').trim());
  const priceTables = tablesOf(quotation).filter(tableHasData);
  const defaults = roomDefaults(quotation);

  const formatDate2 = (s) => {
    if (!s) return '';
    const d2 = new Date(s);
    if (isNaN(d2.getTime())) return '';
    return d2.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const children = [];

  // ---- header ----
  children.push(new d.Paragraph({ spacing: { after: 20 }, children: [text(company.name, { bold: true, size: 30, color: BRAND }), text(`   ${company.tagline || 'Travel with Trust'}`, { size: 18, color: '64748B' })] }));
  children.push(new d.Paragraph({ spacing: { after: 160 }, border: { bottom: { style: d.BorderStyle.SINGLE, size: 8, color: BRAND, space: 4 } }, children: [text(`Ref: ${quotation.quotationNo || '—'}`, { size: 18, color: '475569' }), text(`     Date: ${formatDate2(quotation.createdAt || new Date().toISOString())}`, { size: 18, color: '475569' }), text(`     Type: ${quotationType}`, { size: 18, color: '475569' })] }));
  children.push(new d.Paragraph({ heading: d.HeadingLevel.TITLE, spacing: { after: 40 }, children: [text(`${isHotelOnly ? 'HOTEL' : 'PACKAGE'} QUOTATION`)] }));
  children.push(new d.Paragraph({ spacing: { after: 160 }, children: [text(quotation.destination || '', { bold: true, size: 28, color: '0F172A' })] }));

  // ---- trip details ----
  const tripRows = [
    ['Client', quotation.clientName], ['Pax', quotation.paxDetails], ['Travel date', formatDate2(quotation.travelDate)],
    ['Duration', quotation.duration], ['Valid until', formatDate2(quotation.validUntil)]
  ].filter(([, v]) => v);
  if (tripRows.length) {
    const widths = [Math.round(CONTENT * 0.30), CONTENT - Math.round(CONTENT * 0.30)];
    children.push(heading('Trip Details'), table(tripRows.map(([label, value]) => tableRow([cell([text(label, { bold: true, color: '334155' })], { width: widths[0], fill: 'F1F5F9' }), cell([text(value)], { width: widths[1] })])), widths));
  }

  // ---- hotel options ----
  if (options.length) {
    children.push(heading('Hotel Options'));
    for (let oi = 0; oi < options.length; oi++) {
      const opt = options[oi];
      children.push(new d.Paragraph({ spacing: { before: 120, after: 60 }, children: [text(opt.name || `Option ${oi + 1}`, { bold: true, size: 24, color: '0F172A' })] }));
      for (const h of (opt.hotels || [])) {
        const lines = [`🏨 ${h.hotelName || 'Hotel'}${h.starRating && h.starRating !== 'Unrated' ? `  ★ ${h.starRating}` : ''}`];
        if (h.city || h.address) lines.push(`📍 ${[h.city, h.address].filter(Boolean).join(', ')}`);
        if (h.roomCategory) lines.push(`Room: ${h.roomCategory}`);
        if (h.mealPlan) lines.push(`Meal: ${h.mealPlan}`);
        const dates = [h.checkInDate && `Check In: ${formatDate2(h.checkInDate)}`, h.checkOutDate && `Check Out: ${formatDate2(h.checkOutDate)}`].filter(Boolean);
        if (dates.length) lines.push(dates.join('  ·  '));
        if (h.nights) lines.push(`Stay: ${h.nights}`);
        for (const [i2, l] of lines.entries()) children.push(new d.Paragraph({ spacing: { after: 30 }, indent: { left: 360 }, children: [text(l, i2 === 0 ? { bold: true } : {})] }));
      }
      if (opt.pricePerPerson > 0 && !priceTables.length) children.push(new d.Paragraph({ spacing: { before: 60, after: 60 }, indent: { left: 360 }, children: [text(`Price: ${rs(opt.pricePerPerson)} per person`, { bold: true, color: BRAND }), ...(opt.totalPrice > 0 ? [text(`  ·  Total: ${rs(opt.totalPrice)}`, { color: '334155' })] : [])] }));
    }
  } else if (hotels.length) {
    children.push(heading('Hotel & Accommodation Details'));
    for (const h of hotels) {
      const lines = [`🏨 ${h.hotelName || 'Hotel'}${h.starRating && h.starRating !== 'Unrated' ? `  ★ ${h.starRating}` : ''}`];
      if (h.city || h.address) lines.push(`📍 ${[h.city, h.address].filter(Boolean).join(', ')}`);
      if (h.roomCategory) lines.push(`Room: ${h.roomCategory}`);
      if (h.mealPlan) lines.push(`Meal: ${h.mealPlan}`);
      if (h.nights) lines.push(`Stay: ${h.nights}`);
      for (const [i2, l] of lines.entries()) children.push(new d.Paragraph({ spacing: { after: 30 }, indent: { left: 360 }, children: [text(l, i2 === 0 ? { bold: true } : {})] }));
    }
  }

  // ---- inclusions ----
  if (inclusions.length) children.push(heading('Inclusions'), ...bullets(inclusions));

  // ---- pricing tables ----
  if (priceTables.length) {
    children.push(heading('Pricing'));
    for (const pt of priceTables) {
      children.push(new d.Paragraph({ spacing: { before: 120, after: 60 }, children: [text(pt.name || 'Pricing', { bold: true, color: '0F172A' })] }));
      if (tableLayout(pt) === 'rooms') {
        const cols = [Math.round(CONTENT * 0.28), Math.round(CONTENT * 0.19), Math.round(CONTENT * 0.17), Math.round(CONTENT * 0.17)];
        cols.push(CONTENT - cols.reduce((a, b) => a + b, 0));
        const headerRow = tableRow(['Room', 'Per night', 'Nights', 'Rooms', 'Total'].map((t, i) => hcell(t, cols[i])), { header: true });
        const bodyRows = (pt.rows || []).map((row) => {
          const priced = Number(row.rate) > 0;
          const nights = row.nights || defaults.nights || 0;
          const rooms = row.rooms || defaults.rooms || 1;
          const tot = priced ? round2(Number(row.rate) * Number(nights) * Number(rooms)) : 0;
          return tableRow([cell([text(row.label || '', { bold: true })], { width: cols[0] }), rcell(priced ? rs(row.rate) : '', cols[1]), rcell(priced ? String(nights) : '', cols[2]), rcell(priced ? String(rooms) : '', cols[3]), rcell(priced ? rs(tot) : '', cols[4], { bold: true })]);
        });
        const grandTotal = tableTotal(pt, quotation);
        const totalRow = tableRow([cell([text('Grand Total', { bold: true })], { width: cols[0] + cols[1] + cols[2] + cols[3], fill: 'FEF9C3' }), rcell(rs(grandTotal), cols[4], { bold: true, size: 24 })].filter(Boolean));
        // workaround: colspan via column span
        const grandCols = [cols[0] + cols[1] + cols[2] + cols[3], cols[4]];
        const grandRow = tableRow([cell([text('Grand Total', { bold: true })], { width: grandCols[0], fill: 'FEF9C3' }), rcell(rs(grandTotal), grandCols[1], { bold: true, size: 24 })]);
        children.push(table([headerRow, ...bodyRows, grandRow], cols));
      } else {
        // sheet (Only Hotel)
        const sheetCols2 = isHotelOnly ? AMOUNT_COLUMNS.filter(([key]) => key === 'package') : AMOUNT_COLUMNS;
        const colCount = 2 + sheetCols2.length + 2; // Sr No + amounts + Total + PAX + Final Price
        const baseW = Math.round(CONTENT / colCount);
        const cols = Array(colCount - 1).fill(baseW);
        cols.push(CONTENT - baseW * (colCount - 1));
        const headerRow = tableRow(['Sr No', ...sheetCols2.map(([, t]) => t), 'Total', 'PAX', 'Final Price'].map((t, i) => hcell(t, cols[i])), { header: true });
        const bodyRows = (pt.rows || []).map((row) => {
          const tot = isHotelOnly ? (Number(row.package) || 0) : rowTotal(row);
          const final = rowFinal(row);
          return tableRow([cell([text(row.label || '', { bold: true })], { width: cols[0] }), ...sheetCols2.map(([key], si) => rcell(Number(row[key]) > 0 ? rs(row[key]) : '', cols[1 + si])), rcell(tot > 0 ? rs(tot) : '', cols[1 + sheetCols2.length]), rcell(Number(row.pax) > 0 ? String(row.pax) : '', cols[2 + sheetCols2.length]), rcell(final > 0 ? rs(final) : '', cols[3 + sheetCols2.length], { bold: true })]);
        });
        const grandTotal = tableTotal(pt, quotation);
        const grandCols = [CONTENT - cols[cols.length - 1], cols[cols.length - 1]];
        const grandRow = tableRow([cell([text('Grand Total', { bold: true })], { width: grandCols[0], fill: 'FEF9C3' }), rcell(rs(grandTotal), grandCols[1], { bold: true, size: 24 })]);
        children.push(table([headerRow, ...bodyRows, grandRow], cols));
      }
    }
  }

  // ---- itinerary (package only) ----
  const itinerary = quotation.itinerary || [];
  if (!isHotelOnly && itinerary.length) {
    children.push(heading('Itinerary'));
    for (const day of itinerary) {
      const title2 = [day.dayNumber, day.title].filter(Boolean).join(': ');
      children.push(new d.Paragraph({ spacing: { before: 120, after: 40 }, children: [text(title2, { bold: true, color: BRAND })] }));
      if (day.description) children.push(new d.Paragraph({ spacing: { after: 60 }, children: [text(String(day.description).replace(/<[^>]*>/g, ''))] }));
    }
  }

  // ---- policies ----
  if ((quotation.importantNotes || []).filter((x) => x).length) children.push(heading('Important Notes'), ...numbered(quotation.importantNotes));
  if ((quotation.paymentPolicy || []).filter((x) => x).length) children.push(heading('Payment Policy'), ...bullets(quotation.paymentPolicy));
  if ((quotation.cancellationPolicy || []).filter((x) => x).length) children.push(heading('Cancellation Policy'), ...bullets(quotation.cancellationPolicy));
  if ((quotation.exclusions || []).filter((x) => x).length) children.push(heading('Exclusions'), ...bullets(quotation.exclusions));

  const doc = new d.Document({
    creator: xmlSafe(company.name),
    title: xmlSafe(`${quotationType} quotation ${quotation.quotationNo || ''} ${quotation.destination || ''}`.trim()),
    description: xmlSafe([quotation.clientName, quotation.destination].filter(Boolean).join(' - ')),
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', run: { size: 44, bold: true, color: '0F172A' } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, color: BRAND } }
      ]
    },
    sections: [{
      properties: { page: { size: { width: PAGE.width, height: PAGE.height }, margin: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin } } },
      footers: {
        default: new d.Footer({ children: [
          new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [text([company.address, company.phone, company.email, company.website].filter(Boolean).join('   |   '), { size: 16, color: '94A3B8' })] }),
          new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [text('Page ', { size: 16, color: '94A3B8' }), new d.TextRun({ children: [d.PageNumber.CURRENT], size: 16, color: '94A3B8' }), text(' of ', { size: 16, color: '94A3B8' }), new d.TextRun({ children: [d.PageNumber.TOTAL_PAGES], size: 16, color: '94A3B8' })] })
        ]})
      },
      children
    }]
  });

  return { blob: await d.Packer.toBlob(doc), filename: shareFileName(quotation, 'docx') };
};
