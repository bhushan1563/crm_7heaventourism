import React, { useLayoutEffect, useRef } from 'react';
import { DOC_CSS } from './docCss';
import { BackCover, Cover } from './Cover';
import { DiamondList, IntroBand, Page, Panel } from './PageParts';
import { BadgeCheck, BadgeCross, BannerBoat, BannerPagoda, IconCircleX, IconDocument } from './art';
import { DayPhotos } from './DayPhotos';
import { ShapePage } from './sections/Journey';
import { DaysPage } from './sections/Days';
import { finalizeDocument } from './finalize';
import { itineraryAsQuotation, itineraryModel } from './itineraryModel';
import { documentFacts, photoRows } from '../../utils/itineraryDoc';
import { richToPlainText, splitDisplayBlocks, toDocumentHtml } from '../../utils/richText';

const CHUNK = 14; // the most lines one box holds, so a very long list continues on the next page box by box

const chunks = (items) => Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, i) => items.slice(i * CHUNK, (i + 1) * CHUNK));

/** The title, the picture, the overview text and the other photos. Every photo is shown whole. */
const OverviewPage = ({ model, itinerary, where, numeral, id }) => {
  const facts = documentFacts(itinerary);
  const [cover, ...gallery] = itinerary.photos || [];
  const pieces = richToPlainText(itinerary.summary || '').trim() ? splitDisplayBlocks(toDocumentHtml(itinerary.summary)) : [];
  return (
    <Page id={id} model={model} header="Overview">
      <IntroBand numeral={numeral} title={facts.title} text={[where, facts.duration].filter(Boolean).join('   •   ')} art={<BannerBoat width={51} height={33} />} />
      {cover && <div className="quotation-keep qd-gallery"><DayPhotos photos={[cover]} maxRowHeight={320} /></div>}
      {pieces.map((html, i) => <div key={i} className="quotation-keep qd-rich qd-overview-text" dangerouslySetInnerHTML={{ __html: html }} />)}
      {photoRows(gallery, 2).map((row, i) => <div key={i} className="quotation-keep qd-gallery"><DayPhotos photos={row.map((r) => r.photo)} maxRowHeight={200} /></div>)}
    </Page>
  );
};

const ListsPage = ({ model, inclusions, exclusions, numeral, id }) => {
  const box = (title, items, badge, icon, key) => <Panel key={key} badge={badge} title={title} icon={icon} keep={false}><DiamondList items={items} /></Panel>;
  const inc = (items, k) => box(k ? 'Inclusions (continued)' : 'Inclusions', items, <BadgeCheck width={20} height={20} />, <IconDocument size={14} />, `i${k}`);
  const exc = (items, k) => box(k ? 'Exclusions (continued)' : 'Exclusions', items, <BadgeCross width={20} height={20} />, <IconCircleX size={14} />, `e${k}`);
  const sideBySide = inclusions.length > 0 && exclusions.length > 0 && inclusions.length <= CHUNK && exclusions.length <= CHUNK;
  return (
    <Page id={id} model={model} header="Inclusions & Exclusions">
      <IntroBand numeral={numeral} title="Inclusions & Exclusions" text="What this itinerary covers, and what it does not." art={<BannerPagoda size={52} />} />
      {sideBySide ? (
        <div className="quotation-keep qd-grid2">{inc(inclusions, 0)}{exc(exclusions, 0)}</div>
      ) : (
        [...chunks(inclusions).map(inc), ...chunks(exclusions).map(exc)].map((panel) => <div key={panel.key} className="quotation-keep" style={{ marginBottom: 14 }}>{panel}</div>)
      )}
    </Page>
  );
};

/**
 * An itinerary of the library as a document in the same design as a quotation: cover, overview, the list of days, a card for each day, what
 * is included, and the closing page. It carries no client and no prices.
 */
export const ItineraryProposal = ({ itinerary, company, id }) => {
  const rootRef = useRef(null);
  useLayoutEffect(() => { finalizeDocument(rootRef.current); });
  const quotation = itineraryAsQuotation(itinerary, company);
  const model = itineraryModel(itinerary, quotation);
  const days = quotation.itinerary;
  const [cover, ...gallery] = itinerary.photos || [];
  const hasOverview = Boolean(cover || gallery.length || richToPlainText(itinerary.summary || '').trim());
  const inclusions = itinerary.inclusions || [];
  const exclusions = itinerary.exclusions || [];
  const hasLists = inclusions.length > 0 || exclusions.length > 0;
  return (
    <div id={id} ref={rootRef} className="quotation-doc-container qd" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 24 }}>
      <Cover model={model} quotation={quotation} id={`${id}-cover`} />
      {hasOverview && <OverviewPage model={model} itinerary={itinerary} where={model.noPlace ? '' : quotation.destination} numeral="I" id={`${id}-overview`} />}
      {days.length > 0 && <ShapePage model={model} quotation={quotation} id={`${id}-shape`} />}
      {days.length > 0 && <DaysPage model={model} quotation={quotation} id={`${id}-days`} />}
      {hasLists && <ListsPage model={model} inclusions={inclusions} exclusions={exclusions} numeral={hasOverview ? 'II' : 'I'} id={`${id}-lists`} />}
      <BackCover model={model} id={`${id}-back`} />
      <style>{DOC_CSS}</style>
    </div>
  );
};

export default ItineraryProposal;
