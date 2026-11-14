import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, FileText, Loader2, MessageCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { saveBlob } from '../../utils/download';
import ShareItineraryDialog from './ShareItineraryDialog';

const KINDS = {
  docx: { label: 'Word', long: 'Word document', icon: FileText, load: () => import('../../utils/itineraryDocx').then((m) => m.generateItineraryDocx) },
  pdf: { label: 'PDF', long: 'PDF', icon: FileDown, load: () => import('../../utils/itineraryPdf').then((m) => m.generateItineraryPdf) }
};

/**
 * "Download as Word", "Download as PDF" and "Send" (on WhatsApp or by e-mail) for an itinerary. `getItinerary` returns the itinerary to print
 * (the saved one, or what is on screen in the editor); `summary` is what the Send window says about it (title, destination, nights). The
 * heavy libraries load only when a button is pressed.
 */
export const ItineraryExportButtons = ({ getItinerary, summary = null, variant = 'labelled', disabled = false }) => {
  const { can, user } = useAuth();
  const { showToast } = useToast();
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState({ percent: 0, message: '' });
  const allowed = can('itineraries', 'canDownload');

  const run = async (kind) => {
    if (busy) return;
    const { long, load } = KINDS[kind];
    setBusy(kind);
    setProgress({ percent: 2, message: 'Starting…' });
    try {
      const itinerary = await getItinerary();
      const generate = await load();
      const result = await generate(itinerary, { onProgress: (percent, message) => setProgress({ percent, message }) });
      saveBlob(result.blob, result.filename);
      showToast(
        result.skippedPhotos
          ? `The ${long} was downloaded, but ${result.skippedPhotos} ${result.skippedPhotos === 1 ? 'photo' : 'photos'} could not be included.`
          : `The ${long} was downloaded: ${result.filename}`,
        result.skippedPhotos ? 'warning' : 'success'
      );
    } catch (error) {
      const other = kind === 'pdf' ? 'the Word file' : 'the PDF';
      showToast(`The ${long} could not be created${error?.message ? `: ${error.message}` : ''}. Please try again, or download ${other} instead.`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const icon = variant === 'icon';
  return (
    <span className="export-buttons" role="group" aria-label="Download or send this itinerary">
      {Object.entries(KINDS).map(([kind, { label, long, icon: Icon }]) => {
        const working = busy === kind;
        const title = !allowed ? 'You do not have permission to download itineraries.' : working ? progress.message : `Download as ${long}`;
        return (
          <button
            key={kind}
            type="button"
            className={icon ? 'btn-icon btn-outline' : 'btn btn-outline btn-sm'}
            onClick={() => run(kind)}
            disabled={disabled || !allowed || Boolean(busy)}
            title={title}
            aria-label={`Download as ${long}`}
            aria-busy={working}
          >
            {working ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
            {!icon && <span>{working ? `${progress.percent}%` : label}</span>}
          </button>
        );
      })}
      <button
        type="button"
        className={icon ? 'btn-icon btn-outline' : 'btn btn-outline btn-sm'}
        onClick={() => setSharing(true)}
        disabled={disabled || !allowed || Boolean(busy)}
        title={allowed ? 'Send this itinerary to a client by WhatsApp or e-mail' : 'You do not have permission to send itineraries.'}
        aria-label="Send on WhatsApp or e-mail"
      >
        <MessageCircle size={14} />
        {!icon && <span>Send</span>}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {busy ? `${progress.message} ${progress.percent}%` : ''}
      </span>
      {/* In the page body, not in the card: a card clips and moves what it holds, and the window must cover the whole screen. */}
      {sharing &&
        createPortal(
          <ShareItineraryDialog
            isOpen
            onClose={() => setSharing(false)}
            itinerary={summary || {}}
            getItinerary={getItinerary}
            senderName={user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : ''}
            senderNumber={user?.senderNumber || ''}
          />,
          document.body
        )}
    </span>
  );
};

export default ItineraryExportButtons;
