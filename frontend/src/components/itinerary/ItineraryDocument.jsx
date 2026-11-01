import React from 'react';
import { COMPANY } from '../../config';
import { mediaUrl } from '../../services/mediaService';
import { API_ORIGIN } from '../../services/api';
import { documentFacts, photoRows, richBlocks } from '../../utils/itineraryDoc';

// The printable look of an itinerary (A4). It is rendered off-screen by the PDF export, which measures every
// [data-block] and packs them onto pages, so a day heading or a photo is never cut in half. Light colours only: documents
// are always printed on white, whatever theme the app is in.

export const DOC_WIDTH = 698; // px of content on an A4 page (794 px wide minus 2 x 48 px margins)

const INK = '#0f172a';
const MUTED = '#475569';
const BRAND = '#1d4ed8';
const RULE = '#e2e8f0';

const css = `
.itin-doc { width: ${DOC_WIDTH}px; background: #fff; color: ${INK}; font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 13.5px; line-height: 1.55; }
.itin-doc [data-block] { margin: 0 0 12px; }
.itin-doc p { margin: 0 0 8px; }
.itin-doc ul, .itin-doc ol { margin: 0 0 8px; padding-left: 22px; }
.itin-doc li { margin: 2px 0; }
.itin-doc li > p { margin: 0; }
.itin-doc mark { padding: 0 2px; border-radius: 2px; color: #111827; }
.itin-doc img { display: block; max-width: none; }
`;

const crossOrigin = API_ORIGIN ? 'anonymous' : undefined;

const Photos = ({ photos, rowMax = 300 }) =>
  photoRows(photos).map((row, r) => {
    const gap = 8;
    const available = DOC_WIDTH - gap * (row.length - 1);
    const aspectSum = row.reduce((s, { photo }) => s + photo.width / photo.height, 0);
    const height = Math.min(rowMax, Math.round(available / aspectSum)); // every photo in a row is as tall as the others
    return (
      <div data-block key={r} style={{ display: 'flex', gap, alignItems: 'flex-start' }}>
        {row.map(({ photo }) => {
          const width = Math.round(height * (photo.width / photo.height));
          return (
            <figure key={photo.token} style={{ margin: 0, width }}>
              <img src={mediaUrl(photo.token)} alt={photo.caption || ''} width={width} height={height} crossOrigin={crossOrigin} style={{ width, height, objectFit: 'cover', borderRadius: 6 }} data-photo />
              {photo.caption && <figcaption style={{ marginTop: 4, fontSize: 11, color: MUTED, fontStyle: 'italic', textAlign: 'center' }}>{photo.caption}</figcaption>}
            </figure>
          );
        })}
      </div>
    );
  });

const Text = ({ value }) =>
  richBlocks(value).map((block, i) =>
    block.tag === 'p' ? (
      <div data-block key={i}><p dangerouslySetInnerHTML={{ __html: block.html }} /></div>
    ) : (
      <div data-block key={i} dangerouslySetInnerHTML={{ __html: block.html }} />
    )
  );

const Heading = ({ children }) => (
  <div data-block data-keep-next style={{ margin: '14px 0 8px', paddingBottom: 4, borderBottom: `2px solid ${RULE}`, fontSize: 18, fontWeight: 800, color: BRAND }}>
    {children}
  </div>
);

export const ItineraryDocument = ({ itinerary, company = COMPANY, logoUrl }) => {
  const facts = documentFacts(itinerary);
  const [cover, ...gallery] = itinerary.photos || [];
  const lists = [
    ['Inclusions', itinerary.inclusions || []],
    ['Exclusions', itinerary.exclusions || []]
  ].filter(([, items]) => items.length);

  return (
    <div className="itin-doc">
      <style>{css}</style>

      <div data-block style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottom: `3px solid ${BRAND}` }}>
        {logoUrl && <img src={logoUrl} alt="" width={46} height={46} style={{ width: 46, height: 46, objectFit: 'contain' }} />}
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 0.4 }}>{company.name}</div>
          <div style={{ fontSize: 12, color: MUTED }}>{company.tagline}</div>
        </div>
      </div>

      <div data-block style={{ margin: '18px 0 12px' }}>
        <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.2 }}>{facts.title}</div>
        <div style={{ marginTop: 6, fontSize: 15, color: MUTED }}>{[facts.where, facts.duration].filter(Boolean).join('   •   ')}</div>
      </div>

      {/* The cover is shown as a full-width banner (cropped to fit), whatever shape the photo is. */}
      {cover && <Photos photos={[{ ...cover, width: DOC_WIDTH, height: 330 }]} rowMax={330} />}

      {richBlocks(itinerary.summary).length > 0 && (
        <>
          <Heading>Overview</Heading>
          <Text value={itinerary.summary} />
        </>
      )}
      {gallery.length > 0 && <Photos photos={gallery} rowMax={220} />}

      {(itinerary.days || []).length > 0 && <Heading>Day by day</Heading>}
      {(itinerary.days || []).map((day, index) => (
        <React.Fragment key={index}>
          <div data-block data-keep-next style={{ margin: '14px 0 6px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ flex: 'none', padding: '2px 10px', borderRadius: 999, background: BRAND, color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: 0.5 }}>DAY {index + 1}</span>
              <span style={{ fontSize: 16, fontWeight: 800 }}>{day.title}</span>
            </div>
            {(day.stay || day.meals) && (
              <div style={{ marginTop: 4, fontSize: 12, color: MUTED, fontStyle: 'italic' }}>
                {[day.stay && `Overnight: ${day.stay}`, day.meals && `Meals: ${day.meals}`].filter(Boolean).join('     ')}
              </div>
            )}
          </div>
          <Text value={day.description} />
          <Photos photos={day.photos} />
        </React.Fragment>
      ))}

      {lists.map(([label, items]) => (
        <React.Fragment key={label}>
          <Heading>{label}</Heading>
          {items.map((item, i) => (
            <div data-block key={i} style={{ display: 'flex', gap: 8 }}>
              <span aria-hidden="true" style={{ color: BRAND, fontWeight: 800 }}>{label === 'Inclusions' ? '✓' : '✕'}</span>
              <div style={{ flex: 1 }}>{richBlocks(item).map((b, k) => <div key={k} dangerouslySetInnerHTML={{ __html: b.html }} />)}</div>
            </div>
          ))}
        </React.Fragment>
      ))}

      <div data-block style={{ marginTop: 18, paddingTop: 10, borderTop: `1px solid ${RULE}`, fontSize: 11.5, color: MUTED }}>
        <div style={{ fontWeight: 800, color: BRAND }}>{company.name}</div>
        <div>{company.address}</div>
        <div>{[company.phone, company.email, company.website].filter(Boolean).join('   |   ')}</div>
      </div>
    </div>
  );
};

export default ItineraryDocument;
