import React, { useState } from 'react';
import {
  Download,
  Printer,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Sparkles,
  FileText,
  Loader2,
  Send
} from 'lucide-react';
import QuotationDocumentView from './QuotationDocumentView';
import { generateQuotationPDF, printQuotation } from '../utils/quotationPdfGenerator';
import { useToast } from '../context/ToastContext';
import { saveBlob } from '../utils/download';
import { NEW_VERSION_MESSAGE } from '../services/api';
import { isChunkError } from '../utils/lazyWithReload';

// The document is laid out at A4 width (96dpi). On narrow screens start zoomed out so the whole page width is visible.
const DOC_WIDTH_PX = 794;
const fitZoom = () => {
  if (typeof window === 'undefined') return 1;
  const available = window.innerWidth - 24;
  return available < DOC_WIDTH_PX ? Math.max(0.3, Math.floor((available / DOC_WIDTH_PX) * 10) / 10) : 1;
};

// `before` adds pages ahead of the quotation and `documentLabel` names the document (a booking confirmation uses both).
// `canDownload` is the person's Download right: without it the document can be looked at but not printed or saved as a PDF.
// `onShare` (optional) adds a "Send to client" button, which hands the quotation to the caller to open its share window.
export const QuotationPreviewModal = ({ isOpen, onClose, quotation, before = null, documentLabel = 'Quotation', canDownload = true, onShare = null, confirmationRecord = null, confirmationView = null }) => {
  const { showToast } = useToast();
  const [zoomLevel, setZoomLevel] = useState(fitZoom);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [isWordGenerating, setIsWordGenerating] = useState(false);

  if (!isOpen || !quotation) return null;

  const handleDownloadPDF = async () => {
    try {
      setIsGenerating(true);
      setProgressMsg('Initializing PDF document...');
      const cleanDest = (quotation.destination || '7Heaven').replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `7Heaven_${documentLabel}_${cleanDest}_${quotation.quotationNo || 'Doc'}.pdf`;

      // Use hidden full render container ID to render all 3 pages
      await generateQuotationPDF('quotation-modal-full-render', filename, (pct, msg) => {
        setProgressMsg(msg);
      });

      showToast(`${documentLabel} PDF generated and downloaded successfully!`, 'success');
    } catch (err) {
      console.error('PDF generation error:', err);
      showToast('Failed to generate PDF: ' + (isChunkError(err) ? NEW_VERSION_MESSAGE : err.message), 'error');
    } finally {
      setIsGenerating(false);
      setProgressMsg('');
    }
  };

  const handlePrint = () => {
    printQuotation('quotation-modal-full-render');
  };

  const handleDownloadWord = async () => {
    try {
      setIsWordGenerating(true);
      let result;
      if (confirmationView && confirmationRecord) {
        const { generateConfirmationDocx } = await import('../utils/quotationDocx');
        result = await generateConfirmationDocx(quotation, confirmationView, confirmationRecord);
      } else if (quotation?.quotationType === 'Visa') {
        const { generateVisaQuotationDocx } = await import('../utils/quotationDocx');
        result = await generateVisaQuotationDocx(quotation);
      } else {
        const { generateQuotationDocx } = await import('../utils/quotationDocx');
        result = await generateQuotationDocx(quotation);
      }
      saveBlob(result.blob, result.filename);
      showToast(`${documentLabel} Word document downloaded!`, 'success');
    } catch (err) {
      console.error('Word generation error:', err);
      showToast('Failed to generate Word file: ' + (isChunkError(err) ? NEW_VERSION_MESSAGE : err.message), 'error');
    } finally {
      setIsWordGenerating(false);
    }
  };

  return (
    <div
      className="qpm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${documentLabel} preview ${quotation.quotationNo || ''}`}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 14, 26, 0.85)',
        backdropFilter: 'blur(10px)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      {/* Modal Container */}
      <div
        className="glass-panel-gold animate-fade-in qpm-dialog"
        style={{
          width: '95vw',
          maxWidth: '1200px',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '16px',
          overflow: 'hidden',
          backgroundColor: '#0d1322',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85)'
        }}
      >
        {/* Top Control Bar */}
        <div
          className="qpm-bar"
          style={{
            padding: '14px 20px',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          {/* Left Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff'
              }}
            >
              <FileText size={18} />
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
                {documentLabel} Preview: {quotation.quotationNo}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                {quotation.destination} • {quotation.clientName}
              </div>
            </div>
          </div>

          {/* Center Document Badge */}
          <div className="qpm-badge" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.06)', padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8' }}>
              📄 Full {documentLabel} Document
            </span>
          </div>

          {/* Right Action Buttons & Zoom */}
          <div className="qpm-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Zoom Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '6px' }}>
              <button
                onClick={() => setZoomLevel(prev => Math.max(0.3, Math.round((prev - 0.1) * 10) / 10))}
                className="btn btn-outline btn-sm btn-icon"
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', minWidth: '40px', textAlign: 'center' }}>
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel(prev => Math.min(1.4, Math.round((prev + 0.1) * 10) / 10))}
                className="btn btn-outline btn-sm btn-icon"
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>
            </div>

            {!canDownload && (
              <span className="qpm-no-download" style={{ fontSize: '0.72rem', color: '#94a3b8' }} title="Ask an Admin for the Download right on the Rights screen">
                Viewing only: you do not have the Download right
              </span>
            )}

            {/* Print Button */}
            {canDownload && (
            <button
              onClick={handlePrint}
              className="btn btn-outline btn-sm"
              disabled={isGenerating || isWordGenerating}
            >
              <Printer size={14} />
              <span>Print</span>
            </button>
            )}

            {/* Download Word Button */}
            {canDownload && (
            <button
              onClick={handleDownloadWord}
              className="btn btn-outline btn-sm"
              disabled={isGenerating || isWordGenerating}
              title="Download Word (.docx)"
            >
              {isWordGenerating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Word…</span>
                </>
              ) : (
                <>
                  <FileText size={14} />
                  <span>Word</span>
                </>
              )}
            </button>
            )}

            {/* Download PDF Button */}
            {canDownload && (
            <button
              onClick={handleDownloadPDF}
              className="btn btn-gold btn-sm"
              disabled={isGenerating || isWordGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>{progressMsg || 'Exporting PDF...'}</span>
                </>
              ) : (
                <>
                  <Download size={14} />
                  <span>Download PDF</span>
                </>
              )}
            </button>
            )}

            {/* Send to the client (WhatsApp / e-mail), when the page that opened this window offers it */}
            {canDownload && onShare && (
              <button
                onClick={() => onShare(quotation)}
                className="btn btn-primary btn-sm"
                disabled={isGenerating || isWordGenerating}
                title="Send to the client by WhatsApp or e-mail"
              >
                <Send size={14} />
                <span>Send to client</span>
              </button>
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              className="btn btn-outline btn-sm btn-icon"
              style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
              title="Close Preview"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable Document Area */}
        <div
          className="qpm-body"
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '24px',
            backgroundColor: '#0a0e1a',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          {/* `zoom` (unlike transform: scale) also shrinks the layout box, so there is no phantom horizontal scroll. */}
          <div style={{ zoom: zoomLevel }}>
            <QuotationDocumentView
              quotation={quotation}
              pageNumber={null}
              id="quotation-modal-preview"
              before={before}
            />
          </div>
        </div>
      </div>

      {/* Hidden container rendering every A4 section for clean PDF capture */}
      <div style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: '794px' }}>
        <QuotationDocumentView
          quotation={quotation}
          pageNumber={null}
          id="quotation-modal-full-render"
          before={before}
        />
      </div>
    </div>
  );
};

export default QuotationPreviewModal;
