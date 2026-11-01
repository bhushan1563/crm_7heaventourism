// Itinerary -> Word (.docx). The library is loaded only when someone presses "Download Word".
// Formatting (bold, italic, underline, colour, highlight, font size, lists) becomes real Word formatting, so the file can
// be edited further in Word. Photos are placed in rows; a photo that cannot be loaded is skipped and reported, never fatal.
import { COMPANY } from '../config';
import { mediaUrl } from '../services/mediaService';
import { dayMeta, documentFacts, photoRows, richBlocks } from './itineraryDoc';

const PAGE = { width: 11906, height: 16838, margin: 1020 }; // A4 in twips (1/20 pt); margins about 1.8 cm
const CONTENT_WIDTH_PX = 660; // printable width in pixels (96 dpi)
const BRAND = '1D4ED8';

/** "#abc", "#aabbcc", "#aabbccdd", "rgb(1,2,3)" -> "AABBCC", or null. */
export const toDocxColor = (value) => {
  const v = String(value || '').trim();
  let m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) return m[1].split('').map((c) => c + c).join('').toUpperCase();
  m = v.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
  if (m) return m[1].toUpperCase();
  m = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (m) return [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('').toUpperCase();
  return null;
};

/** "18px" / "14pt" -> Word's size unit (half points), or null. */
export const toHalfPoints = (value) => {
  const m = String(value || '').trim().match(/^(\d+(?:\.\d+)?)(px|pt)$/i);
  if (!m) return null;
  const points = m[2].toLowerCase() === 'px' ? Number(m[1]) * 0.75 : Number(m[1]);
  return Math.max(2, Math.round(points * 2));
};

const styleOf = (element) => {
  const out = {};
  for (const declaration of (element.getAttribute?.('style') || '').split(';')) {
    const i = declaration.indexOf(':');
    if (i > 0) out[declaration.slice(0, i).trim().toLowerCase()] = declaration.slice(i + 1).trim();
  }
  return out;
};

/** Default way to get a photo: fetch it, and convert anything Word cannot show (WebP) into a JPEG. */
const defaultFetchImage = async (token) => {
  const response = await fetch(mediaUrl(token));
  if (!response.ok) throw new Error(`photo ${token} could not be loaded (${response.status})`);
  const blob = await response.blob();
  if (blob.type === 'image/jpeg') return { data: new Uint8Array(await blob.arrayBuffer()), type: 'jpg' };
  if (blob.type === 'image/png') return { data: new Uint8Array(await blob.arrayBuffer()), type: 'png' };
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  return { data: new Uint8Array(await jpeg.arrayBuffer()), type: 'jpg' };
};

/**
 * @param {object} itinerary the full itinerary as returned by the API
 * @param {{ onProgress?: (percent: number, message: string) => void, fetchImage?: Function, company?: object }} [options]
 * @returns {Promise<{ blob: Blob, filename: string, skippedPhotos: number }>}
 */
export const generateItineraryDocx = async (itinerary, { onProgress, fetchImage = defaultFetchImage, company = COMPANY } = {}) => {
  const d = await import('docx');
  const facts = documentFacts(itinerary);
  const report = (percent, message) => onProgress?.(percent, message);
  report(5, 'Preparing the Word document…');

  // ---- photos: fetched once each, a few at a time
  const cache = new Map();
  let skipped = 0;
  const loadPhoto = (token) => {
    if (!cache.has(token)) cache.set(token, fetchImage(token).catch(() => null));
    return cache.get(token);
  };
  const allPhotos = [...(itinerary.photos || []), ...(itinerary.days || []).flatMap((day) => day.photos || [])];
  const tokens = [...new Set(allPhotos.map((p) => p.token))];
  let done = 0;
  for (let i = 0; i < tokens.length; i += 4) {
    await Promise.all(tokens.slice(i, i + 4).map((t) => loadPhoto(t).then(() => { done += 1; report(10 + Math.round((done / tokens.length) * 60), `Loading photos (${done} of ${tokens.length})…`); })));
  }

  // ---- text
  const parser = new DOMParser();
  const runsFrom = (nodes, format = {}) => {
    const runs = [];
    for (const node of Array.from(nodes)) {
      if (node.nodeType === 3) {
        if (node.textContent) runs.push(new d.TextRun({ text: node.textContent, ...format }));
      } else if (node.nodeType === 1) {
        const tag = node.tagName.toLowerCase();
        if (tag === 'br') {
          runs.push(new d.TextRun({ break: 1 }));
          continue;
        }
        const next = { ...format };
        if (tag === 'strong') next.bold = true;
        if (tag === 'em') next.italics = true;
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
  const htmlNodes = (html) => parser.parseFromString(`<body>${html}</body>`, 'text/html').body.childNodes;

  let orderedLists = 0;
  const textBlocks = (value, { spacingAfter = 120 } = {}) => {
    const out = [];
    for (const block of richBlocks(value)) {
      if (block.tag === 'p') {
        out.push(new d.Paragraph({ children: runsFrom(htmlNodes(block.html)), spacing: { after: spacingAfter } }));
        continue;
      }
      const ordered = block.tag === 'ol';
      const instance = ordered ? (orderedLists += 1) : 0;
      const list = htmlNodes(block.html)[0];
      for (const li of Array.from(list?.children || [])) {
        const inline = Array.from(li.childNodes).flatMap((child, i) => (child.tagName === 'P' ? [...(i ? [new d.TextRun({ break: 1 })] : []), ...runsFrom(child.childNodes)] : runsFrom([child])));
        out.push(new d.Paragraph({ children: inline, ...(ordered ? { numbering: { reference: 'itinerary-numbers', level: 0, instance } } : { bullet: { level: 0 } }), spacing: { after: 60 } }));
      }
      out.push(new d.Paragraph({ children: [], spacing: { after: 40 } }));
    }
    return out;
  };

  // ---- photos in rows
  const none = { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
  const noCellBorders = { top: none, bottom: none, left: none, right: none };
  // The photos have all settled by now (loaded, or null when one could not be fetched).
  const resolved = new Map();
  for (const [token, promise] of cache) resolved.set(token, await promise);

  const photoTables = (photos) => {
    const tables = [];
    for (const row of photoRows(photos || [])) {
      const usable = row.filter(({ photo }) => resolved.get(photo.token));
      skipped += row.length - usable.length;
      if (!usable.length) continue;
      const total = usable.reduce((s, r) => s + r.share, 0);
      tables.push(
        new d.Table({
          width: { size: 100, type: d.WidthType.PERCENTAGE },
          borders: noBorders,
          rows: [
            new d.TableRow({
              cantSplit: true,
              children: usable.map(({ photo, share }) => {
                const portion = share / total;
                const width = Math.max(60, Math.floor(CONTENT_WIDTH_PX * portion) - 10);
                const height = Math.round((width * photo.height) / photo.width);
                const { data, type } = resolved.get(photo.token);
                const paragraphs = [
                  new d.Paragraph({
                    alignment: d.AlignmentType.CENTER,
                    children: [new d.ImageRun({ type, data, transformation: { width, height }, altText: { name: photo.caption || 'Photo', title: photo.caption || 'Photo', description: photo.caption || 'Photo' } })]
                  })
                ];
                if (photo.caption) paragraphs.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { after: 60 }, children: [new d.TextRun({ text: photo.caption, italics: true, size: 18, color: '64748B' })] }));
                return new d.TableCell({ width: { size: Math.round(portion * 100), type: d.WidthType.PERCENTAGE }, borders: noCellBorders, margins: { top: 40, bottom: 40, left: 40, right: 40 }, children: paragraphs });
              })
            })
          ]
        }),
        new d.Paragraph({ children: [], spacing: { after: 80 } })
      );
    }
    return tables;
  };

  report(75, 'Building the document…');
  const heading = (text, level = d.HeadingLevel.HEADING_1) => new d.Paragraph({ heading: level, spacing: { before: 280, after: 120 }, keepNext: true, children: [new d.TextRun({ text })] });
  const children = [];

  children.push(new d.Paragraph({ heading: d.HeadingLevel.TITLE, spacing: { after: 60 }, children: [new d.TextRun({ text: facts.title })] }));
  children.push(
    new d.Paragraph({
      spacing: { after: 200 },
      children: [new d.TextRun({ text: [facts.where, facts.duration].filter(Boolean).join('   •   '), color: '475569', size: 26 })]
    })
  );

  const [cover, ...galleryRest] = itinerary.photos || [];
  if (cover) children.push(...photoTables([cover]));
  const overview = textBlocks(itinerary.summary);
  if (overview.length) children.push(heading('Overview'), ...overview);
  if (galleryRest.length) children.push(...photoTables(galleryRest));

  if ((itinerary.days || []).length) {
    children.push(heading('Day by day'));
    for (const [index, day] of itinerary.days.entries()) {
      children.push(new d.Paragraph({ heading: d.HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 240, after: 60 }, children: [new d.TextRun({ text: `Day ${index + 1}`, color: BRAND }), new d.TextRun({ text: `  ${day.title}` })] }));
      const meta = dayMeta(day);
      if (meta) children.push(new d.Paragraph({ keepNext: true, spacing: { after: 80 }, children: [new d.TextRun({ text: meta, italics: true, color: '64748B', size: 20 })] }));
      children.push(...textBlocks(day.description), ...photoTables(day.photos));
    }
  }

  const bulletsFor = (items) =>
    items.map((item) => {
      const nodes = richBlocks(item)[0];
      return new d.Paragraph({ bullet: { level: 0 }, spacing: { after: 50 }, children: nodes ? runsFrom(htmlNodes(nodes.html)) : [] });
    });
  if ((itinerary.inclusions || []).length) children.push(heading('Inclusions'), ...bulletsFor(itinerary.inclusions));
  if ((itinerary.exclusions || []).length) children.push(heading('Exclusions'), ...bulletsFor(itinerary.exclusions));

  children.push(
    new d.Paragraph({ spacing: { before: 360, after: 40 }, border: { top: { style: d.BorderStyle.SINGLE, size: 6, color: 'CBD5E1', space: 8 } }, children: [new d.TextRun({ text: company.name, bold: true, color: BRAND })] }),
    new d.Paragraph({ spacing: { after: 20 }, children: [new d.TextRun({ text: company.address, size: 18, color: '475569' })] }),
    new d.Paragraph({ children: [new d.TextRun({ text: [company.phone, company.email, company.website].filter(Boolean).join('   |   '), size: 18, color: '475569' })] })
  );

  const document = new d.Document({
    creator: company.name,
    title: facts.title,
    description: `${facts.where} ${facts.duration}`.trim(),
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', run: { size: 52, bold: true, color: '0F172A' } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 32, bold: true, color: BRAND } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, color: '0F172A' } }
      ]
    },
    numbering: { config: [{ reference: 'itinerary-numbers', levels: [{ level: 0, format: d.LevelFormat.DECIMAL, text: '%1.', alignment: d.AlignmentType.START }] }] },
    sections: [
      {
        properties: { page: { size: { width: PAGE.width, height: PAGE.height }, margin: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin } } },
        headers: {
          default: new d.Header({
            children: [new d.Paragraph({ alignment: d.AlignmentType.RIGHT, children: [new d.TextRun({ text: `${company.name}  ·  ${company.tagline}`, size: 16, color: '94A3B8' })] })]
          })
        },
        footers: {
          default: new d.Footer({
            children: [
              new d.Paragraph({
                alignment: d.AlignmentType.CENTER,
                children: [new d.TextRun({ text: `${facts.title}  ·  Page `, size: 16, color: '94A3B8' }), new d.TextRun({ children: [d.PageNumber.CURRENT], size: 16, color: '94A3B8' }), new d.TextRun({ text: ' of ', size: 16, color: '94A3B8' }), new d.TextRun({ children: [d.PageNumber.TOTAL_PAGES], size: 16, color: '94A3B8' })]
              })
            ]
          })
        },
        children
      }
    ]
  });

  report(90, 'Creating the file…');
  const blob = await d.Packer.toBlob(document);
  report(100, 'Done');
  return { blob, filename: `${facts.fileBase}.docx`, skippedPhotos: skipped };
};

export default generateItineraryDocx;
