// A found hotel as a Word file, a PDF and a CSV. The libraries are large, so each is loaded only when someone presses its button.
// Pictures are added when they can be fetched (up to four); one that cannot is skipped, never fatal.
import { COMPANY } from '../config';
import { mediaUrl } from '../services/mediaService';
import { download, exportToCSV } from './exportHelper';
import { foundCsvRows, foundFileName, foundSections } from './hotelFinder';

export const MAX_DOWNLOAD_PICTURES = 4;
const NAVY = '0F172A';
const BRAND = '1D4ED8';

const subtitleOf = (found) => [found.propertyType, found.starRating && found.starRating !== 'Unrated' ? found.starRating : '', [found.address?.locality, found.address?.country].filter(Boolean).join(', ')].filter(Boolean).join('  ·  ');

// ---- pictures ----

/** Which kind of picture these bytes are, by their own first bytes: 'jpg', 'png', 'webp' or '' (anything else). */
export const pictureType = (bytes) => {
  if (!bytes || bytes.length < 12) return '';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'webp';
  return '';
};

/** The saved photos of a found hotel as addresses to fetch: [{ url, width, height, caption }], at most `limit`. */
export const pictureSources = (found, limit = MAX_DOWNLOAD_PICTURES) => (found.photos || []).slice(0, limit).map((p) => ({ url: mediaUrl(p.token), width: p.width, height: p.height, caption: p.caption || '' }));

/** Fetches pictures, skipping any that fail. Returns [{ data: Uint8Array, type, width, height, caption }]. */
export const loadPictures = async (sources, fetchImpl = typeof fetch === 'function' ? fetch : null) => {
  if (!fetchImpl) return [];
  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const response = await fetchImpl(source.url);
      if (!response?.ok) throw new Error('not found');
      const data = new Uint8Array(await response.arrayBuffer());
      const type = pictureType(data);
      if (!type) throw new Error('not a picture');
      return { data, type, width: source.width || 1200, height: source.height || 800, caption: source.caption || '' };
    })
  );
  return settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
};

// ---- CSV ----

export const exportFoundCsv = async (found) => {
  const rows = foundCsvRows(found);
  if (!rows.length) return { ok: false, message: 'There is nothing to put in the file yet.' };
  await exportToCSV(rows, foundFileName(found, 'csv'));
  return { ok: true };
};

// ---- Word ----

/** @returns {Promise<{ blob: Blob, filename: string, pictures: number }>} */
export const buildFoundDocx = async (found, pictures = []) => {
  const d = await import('docx');
  const usable = pictures.filter((p) => p.type === 'jpg' || p.type === 'png'); // Word cannot place a WebP picture
  const none = { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const thin = { style: d.BorderStyle.SINGLE, size: 4, color: 'E2E8F0' };
  const children = [
    new d.Paragraph({ style: 'Title', children: [new d.TextRun({ text: found.name || 'Hotel' })] }),
    new d.Paragraph({ spacing: { after: 200 }, children: [new d.TextRun({ text: subtitleOf(found), color: '475569', size: 24 })] })
  ];

  if (usable.length) {
    const cells = usable.slice(0, MAX_DOWNLOAD_PICTURES).map((p) => {
      const width = usable.length === 1 ? 560 : 270;
      const height = Math.round((width * p.height) / p.width);
      return new d.TableCell({
        width: { size: Math.floor(100 / Math.min(2, usable.length)), type: d.WidthType.PERCENTAGE },
        borders: { top: none, bottom: none, left: none, right: none },
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        children: [new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [new d.ImageRun({ type: p.type, data: p.data, transformation: { width, height }, altText: { name: p.caption || 'Photo', title: p.caption || 'Photo', description: p.caption || 'Photo of the hotel' } })] })]
      });
    });
    const rows = [];
    for (let i = 0; i < cells.length; i += 2) rows.push(new d.TableRow({ cantSplit: true, children: cells.slice(i, i + 2) }));
    children.push(new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none }, rows }), new d.Paragraph({ children: [], spacing: { after: 120 } }));
  }

  for (const section of foundSections(found)) {
    children.push(new d.Paragraph({ style: 'Heading1', keepNext: true, children: [new d.TextRun({ text: section.title })] }));
    if (section.text) for (const part of section.text.split(/\n{2,}/)) children.push(new d.Paragraph({ spacing: { after: 120 }, children: [new d.TextRun({ text: part })] }));
    if (section.rows.length) {
      children.push(
        new d.Table({
          width: { size: 100, type: d.WidthType.PERCENTAGE },
          borders: { top: thin, bottom: thin, left: thin, right: thin, insideHorizontal: thin, insideVertical: thin },
          rows: section.rows.map(([label, value]) =>
            new d.TableRow({
              cantSplit: true,
              children: [
                new d.TableCell({ width: { size: 28, type: d.WidthType.PERCENTAGE }, shading: { type: d.ShadingType.CLEAR, fill: 'F1F5F9', color: 'auto' }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new d.Paragraph({ children: [new d.TextRun({ text: label, bold: true, color: NAVY })] })] }),
                new d.TableCell({ width: { size: 72, type: d.WidthType.PERCENTAGE }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new d.Paragraph({ children: [new d.TextRun({ text: value })] })] })
              ]
            })
          )
        }),
        new d.Paragraph({ children: [], spacing: { after: 100 } })
      );
    }
    for (const item of section.list || []) children.push(new d.Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new d.TextRun({ text: item })] }));
  }

  const document = new d.Document({
    creator: COMPANY.name,
    title: found.name || 'Hotel',
    description: 'Hotel details collected with the hotel finder',
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', run: { size: 52, bold: true, color: NAVY } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, color: BRAND }, paragraph: { spacing: { before: 240, after: 100 } } }
      ]
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1020, bottom: 1020, left: 1020, right: 1020 } } },
        headers: { default: new d.Header({ children: [new d.Paragraph({ alignment: d.AlignmentType.RIGHT, children: [new d.TextRun({ text: `${COMPANY.name}  ·  Hotel details`, size: 16, color: '94A3B8' })] })] }) },
        footers: { default: new d.Footer({ children: [new d.Paragraph({ alignment: d.AlignmentType.CENTER, children: [new d.TextRun({ text: `${found.name || 'Hotel'}  ·  Page `, size: 16, color: '94A3B8' }), new d.TextRun({ children: [d.PageNumber.CURRENT], size: 16, color: '94A3B8' })] })] }) },
        children
      }
    ]
  });
  return { blob: await d.Packer.toBlob(document), filename: foundFileName(found, 'docx'), pictures: usable.length };
};

export const exportFoundDocx = async (found, pictures) => {
  const result = await buildFoundDocx(found, pictures ?? (await loadPictures(pictureSources(found))));
  download(result.blob, result.filename);
  return result;
};

// ---- PDF ----

/** A picture's bytes as a JPEG data address that the PDF library accepts (also turns WebP into JPEG). Null when it cannot be decoded here. */
export const toJpegDataUrl = async (picture) => {
  try {
    const blob = new Blob([picture.data], { type: picture.type === 'png' ? 'image/png' : picture.type === 'webp' ? 'image/webp' : 'image/jpeg' });
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 900 / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
};

/** @returns {Promise<{ doc: object, filename: string, pictures: number }>} */
export const buildFoundPdf = async (found, pictures = []) => {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new JsPDF('p', 'pt', 'a4');
  const width = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 0;

  doc.setFillColor(11, 19, 43);
  doc.rect(0, 0, width, 56, 'F');
  doc.setTextColor(212, 175, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(COMPANY.name || '7Heaven Tourism', margin, 26);
  doc.setTextColor(200, 205, 215);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Hotel details collected with the hotel finder', margin, 42);

  y = 92;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  const titleLines = doc.splitTextToSize(found.name || 'Hotel', width - margin * 2);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 26;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  const subtitle = subtitleOf(found);
  if (subtitle) {
    doc.text(doc.splitTextToSize(subtitle, width - margin * 2), margin, y);
    y += 22;
  }

  let placed = 0;
  const decoded = [];
  for (const p of pictures.slice(0, MAX_DOWNLOAD_PICTURES)) {
    const image = await toJpegDataUrl(p);
    if (image) decoded.push(image);
  }
  if (decoded.length) {
    const gap = 8;
    const each = (width - margin * 2 - gap * (decoded.length - 1)) / decoded.length;
    const height = Math.min(120, each * 0.66);
    decoded.forEach((image, i) => {
      doc.addImage(image.dataUrl, 'JPEG', margin + i * (each + gap), y, each, height, undefined, 'FAST');
      placed += 1;
    });
    y += height + 16;
  }

  const ensureRoom = (needed) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage();
      y = 50;
    }
  };
  for (const section of foundSections(found)) {
    ensureRoom(60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(29, 78, 216);
    doc.text(section.title, margin, y);
    y += 8;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, width - margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    if (section.text) {
      for (const part of section.text.split(/\n{2,}/)) {
        const lines = doc.splitTextToSize(part, width - margin * 2);
        ensureRoom(lines.length * 13 + 8);
        doc.text(lines, margin, y);
        y += lines.length * 13 + 6;
      }
    }
    if (section.rows.length) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        body: section.rows,
        theme: 'grid',
        styles: { fontSize: 9.5, cellPadding: 5, textColor: [15, 23, 42], lineColor: [226, 232, 240], overflow: 'linebreak' },
        columnStyles: { 0: { cellWidth: 120, fontStyle: 'bold', fillColor: [241, 245, 249] } }
      });
      y = doc.lastAutoTable.finalY + 12;
    }
    for (const item of section.list || []) {
      const lines = doc.splitTextToSize(`•  ${item}`, width - margin * 2 - 10);
      ensureRoom(lines.length * 13 + 4);
      doc.text(lines, margin + 6, y);
      y += lines.length * 13 + 3;
    }
    y += 10;
  }

  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`${found.name || 'Hotel'}  ·  Page ${i} of ${pages}`, width / 2, doc.internal.pageSize.getHeight() - 24, { align: 'center' });
  }
  return { doc, filename: foundFileName(found, 'pdf'), pictures: placed };
};

export const exportFoundPdf = async (found, pictures) => {
  const result = await buildFoundPdf(found, pictures ?? (await loadPictures(pictureSources(found))));
  result.doc.save(result.filename);
  return result;
};
