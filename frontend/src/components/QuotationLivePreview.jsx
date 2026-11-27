import React, { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import QuotationDocumentView from './QuotationDocumentView';
import { useFitScale } from '../hooks/useFitScale';

// The document is laid out at A4 width (210mm = 794px at 96dpi) everywhere and scaled down to the pane.
const BUILDER_PAGE_WIDTH_PX = 794;
const PREVIEW_ID = 'quotation-live-render-view';

// The pages of the document that show what each tab of the builder is about (the first one the document has).
const PAGES_OF_TAB = {
  overview: ['cover'],
  itinerary: ['days', 'shape'],
  package: ['stay', 'land'],
  visa: ['visa'],
  visaFees: ['visa'],
  flights: ['flights'],
  pricing: ['pricing', 'stay'],
  notes: ['terms']
};

/**
 * The builder's live document preview.
 * A sticky side pane on wide screens; below 1280px the pane sits under the form. The page is always scaled to fit the width of the pane.
 * It redraws with every change; each part runs on as one long page here (the "PDF Preview" window shows the sheets exactly as downloaded).
 * `section` is the builder tab that is open: the pane moves to the part of the document that tab fills in.
 */
export const QuotationLivePreview = ({ quotation, section }) => {
  const [fitRef, fitScale] = useFitScale(BUILDER_PAGE_WIDTH_PX, { min: 0.3, max: 1 });
  const paneRef = useRef(null);

  useEffect(() => {
    const pane = paneRef.current;
    const page = (PAGES_OF_TAB[section] || []).map((name) => pane?.querySelector(`#${PREVIEW_ID}-${name}`)).find(Boolean);
    if (!page) return;
    // only the pane scrolls: the form must not jump away from under the person typing
    pane.scrollTop = section === 'overview' ? 0 : pane.scrollTop + page.getBoundingClientRect().top - pane.getBoundingClientRect().top;
  }, [section]);

  return (
    <div
      ref={paneRef}
      className="rs-builder-preview"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        position: 'sticky',
        top: '20px',
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
        paddingRight: '4px'
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderRadius: '10px',
          border: '1px solid rgba(14, 165, 233, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--bg-F8FAFC)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.825rem', fontWeight: 700, color: 'var(--fg-0284C7)' }}>
          <Sparkles size={15} />
          <span>Real-Time PDF Document Preview</span>
        </div>
      </div>

      {/* Measured wrapper (never scaled itself); `zoom` (unlike transform: scale) also shrinks the layout box, so there is no phantom scroll. */}
      {/* flexShrink 0: as a flex item with hidden overflow it would otherwise shrink to the pane and cut off every page below the cover */}
      <div ref={fitRef} data-testid="live-preview-pages" style={{ width: '100%', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ zoom: fitScale }}>
          <QuotationDocumentView quotation={quotation} id={PREVIEW_ID} />
        </div>
      </div>
    </div>
  );
};

export default QuotationLivePreview;
