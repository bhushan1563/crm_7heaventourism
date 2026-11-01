import React, { useState } from 'react';
import { FileDown, FileText, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { saveBlob } from '../../utils/download';

const KINDS = {
  docx: { label: 'Word', long: 'Word document', icon: FileText, load: () => import('../../utils/itineraryDocx').then((m) => m.generateItineraryDocx) },
  pdf: { label: 'PDF', long: 'PDF', icon: FileDown, load: () => import('../../utils/itineraryPdf').then((m) => m.generateItineraryPdf) }
};

/**
 * "Download as Word" and "Download as PDF" for an itinerary. `getItinerary` returns the itinerary to print (the saved one,
 * or what is on screen in the editor); the heavy libraries load only when a button is pressed.
 */
export const ItineraryExportButtons = ({ getItinerary, variant = 'labelled', disabled = false }) => {
  const { can } = useAuth();
  const { showToast } = useToast();
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
    <span className="export-buttons" role="group" aria-label="Download this itinerary">
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
      <span className="sr-only" role="status" aria-live="polite">
        {busy ? `${progress.message} ${progress.percent}%` : ''}
      </span>
    </span>
  );
};

export default ItineraryExportButtons;
