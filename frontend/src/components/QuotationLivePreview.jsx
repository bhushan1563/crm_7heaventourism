import React from 'react';
import { Sparkles } from 'lucide-react';
import QuotationDocumentView from './QuotationDocumentView';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useFitScale } from '../hooks/useFitScale';

// On the builder routes QuotationDocumentView lays each page out 120mm wide (210mm elsewhere); 120mm = ~454px at 96dpi.
const BUILDER_PAGE_WIDTH_PX = 454;

/**
 * The builder's live document preview.
 * Wide screens: a sticky side pane (scaled 0.85, as before). Below 1280px the pane sits under the form
 * and the page is scaled to fit its width, so it is fully readable on a tablet or phone.
 */
export const QuotationLivePreview = ({ quotation }) => {
  const isStacked = useMediaQuery('(max-width: 1279.98px)');
  const [fitRef, fitScale] = useFitScale(BUILDER_PAGE_WIDTH_PX, { min: 0.3, max: 1 });

  return (
    <div
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

      {/* Measured wrapper (never scaled itself) */}
      <div ref={fitRef} style={{ width: '100%', overflow: isStacked ? 'hidden' : 'visible' }}>
        <div
          style={
            isStacked
              ? { zoom: fitScale }
              : { transform: 'scale(0.85)', transformOrigin: 'top center', borderRadius: '8px', padding: '12px' }
          }
        >
          <QuotationDocumentView quotation={quotation} pageNumber={null} id="quotation-live-render-view" />
        </div>
      </div>
    </div>
  );
};

export default QuotationLivePreview;
