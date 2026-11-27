import React, { useEffect, useRef, useState } from 'react';
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
  const headerRef = useRef(null);
  const [shown, setShown] = useState(section); // the highlighted button: the open tab, or the button pressed since

  const scrollToSection = (targetSection, { fromButton = false } = {}) => {
    const pane = paneRef.current;
    if (!pane) return;
    const targets = PAGES_OF_TAB[targetSection] || [targetSection];
    const page = targets.map((name) => pane.querySelector(`#${PREVIEW_ID}-${name}`)).find(Boolean);
    // Under the form (narrow screens) the pane does not scroll, the whole screen does: only a pressed button may move it there.
    if (fromButton && pane.clientHeight > 0 && pane.scrollHeight <= pane.clientHeight + 1) {
      if (!page) return;
      page.style.scrollMarginTop = `${((headerRef.current?.offsetHeight || 0) + 8) / (fitScale || 1)}px`; // clear of the bar on top (the page is zoomed)
      page.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (targetSection === 'overview' || targetSection === 'cover') {
      pane.scrollTop = 0;
      return;
    }
    if (!page) return;
    const header = headerRef.current?.offsetHeight ? headerRef.current.offsetHeight + 8 : 0; // the page starts under the bar that stays on top
    pane.scrollTop = pane.scrollTop + page.getBoundingClientRect().top - pane.getBoundingClientRect().top - header;
  };

  useEffect(() => {
    setShown(section);
    scrollToSection(section);
  }, [section]);

  const navPills = [
    { label: 'Cover', key: 'overview' },
    { label: 'Days', key: 'itinerary' },
    { label: 'Hotels', key: 'package' },
    { label: 'Flights', key: 'flights' },
    { label: 'Pricing', key: 'pricing' },
    { label: 'Terms', key: 'notes' }
  ];

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
        ref={headerRef}
        style={{
          padding: '10px 14px',
          borderRadius: '10px',
          border: '1px solid rgba(14, 165, 233, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          backgroundColor: 'var(--bg-F8FAFC)',
          position: 'sticky',
          top: 0,
          zIndex: 5,
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.825rem', fontWeight: 700, color: 'var(--fg-0284C7)' }}>
            <Sparkles size={15} />
            <span>Real-Time PDF Document Preview</span>
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--fg-64748B)' }}>
            {Math.round(fitScale * 100)}% fit
          </span>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {navPills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => { setShown(pill.key); scrollToSection(pill.key, { fromButton: true }); }}
              style={{
                fontSize: '0.68rem',
                fontWeight: shown === pill.key ? 700 : 500,
                padding: '2px 8px',
                borderRadius: '4px',
                border: shown === pill.key ? '1px solid #0284c7' : '1px solid var(--bd-CBD5E1)',
                backgroundColor: shown === pill.key ? '#0284c7' : 'transparent',
                color: shown === pill.key ? '#ffffff' : 'var(--fg-64748B)',
                cursor: 'pointer'
              }}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Measured wrapper (never scaled itself); `zoom` (unlike transform: scale) also shrinks the layout box, so there is no phantom scroll. */}
      {/* flexShrink 0: as a flex item with hidden overflow it would otherwise shrink to the pane and cut off every page below the cover */}
      <div ref={fitRef} data-testid="live-preview-pages" style={{ width: '100%', overflowX: 'hidden', flexShrink: 0 }}>
        <div style={{ zoom: fitScale }}>
          <QuotationDocumentView quotation={quotation} id={PREVIEW_ID} />
        </div>
      </div>
    </div>
  );
};

export default QuotationLivePreview;
