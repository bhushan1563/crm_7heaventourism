import React from 'react';
import { Sparkles } from 'lucide-react';
import QuotationDocumentView from './QuotationDocumentView';
import PaginatedPreview from './PaginatedPreview';
import { useFitScale } from '../hooks/useFitScale';

// The document is laid out at A4 width (210mm = 794px at 96dpi) everywhere and scaled down to the pane.
const BUILDER_PAGE_WIDTH_PX = 794;

/**
 * The builder's live document preview.
 * A sticky side pane on wide screens; below 1280px the pane sits under the form. The page is always scaled to fit the width of the pane.
 */
export const QuotationLivePreview = ({ quotation }) => {
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

      {/* Measured wrapper (never scaled itself); `zoom` (unlike transform: scale) also shrinks the layout box, so there is no phantom scroll. */}
      <div ref={fitRef} style={{ width: '100%', overflow: 'hidden' }}>
        <div style={{ zoom: fitScale }}>
          {/* shows the pages as the PDF lays them out, a moment after the last change */}
          <PaginatedPreview sourceId="quotation-live-render-view" version={quotation} delay={900}>
            <QuotationDocumentView quotation={quotation} id="quotation-live-render-view" />
          </PaginatedPreview>
        </div>
      </div>
    </div>
  );
};

export default QuotationLivePreview;
