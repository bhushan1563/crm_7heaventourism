import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Check, ClipboardPaste, Download, FileSpreadsheet, FileText, Hotel, Loader2, Lock, Save, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import hotelFinderService from '../services/hotelFinderService';
import { API_ORIGIN, getErrorMessage } from '../services/api';
import { uploadPhoto } from '../services/mediaService';
import { fileFromUrl } from '../utils/pastedImages';
import { FIND_STEPS, checkAddress, foundFromFind } from '../utils/hotelFinder';
import { exportFoundCsv, exportFoundDocx, exportFoundPdf, loadPictures } from '../utils/hotelFinderExport';
import FindResult from '../components/hotelFinder/FindResult';
import './itineraries.css';
import '../components/hotelFinder/hotelFinder.css';

const KEEP_BY_DEFAULT = 8;
const PARALLEL = 3;

/** Copies the chosen pictures into the app's photo storage (shrunk in the browser, like any uploaded photo). Skips the ones that fail. */
export const copyPictures = async (images, onProgress) => {
  const photos = new Array(images.length).fill(null);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < images.length) {
      const index = next++;
      try {
        const file = await fileFromUrl(`${API_ORIGIN}${images[index].preview}`, `hotel-${index + 1}.jpg`);
        const { token, width, height } = await uploadPhoto(file, 'hotel');
        photos[index] = { token, width, height, caption: images[index].alt || '' };
      } catch {
        photos[index] = null;
      }
      done += 1;
      onProgress?.(done, images.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, images.length) }, worker));
  return { photos: photos.filter(Boolean), failed: photos.filter((p) => !p).length };
};

export const HotelFinderPage = () => {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { showToast } = useToast();
  const allowed = can('hotels', 'canCreate');

  const [address, setAddress] = useState('');
  const [addressError, setAddressError] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | loading | done | error
  const [step, setStep] = useState(0);
  const [failure, setFailure] = useState(null); // { message, code, canPaste }
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [saving, setSaving] = useState('');
  const [saved, setSaved] = useState(null);
  const [downloading, setDownloading] = useState('');
  const latest = useRef(0);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  const startSteps = () => {
    clearInterval(timer.current);
    setStep(0);
    timer.current = setInterval(() => setStep((s) => Math.min(FIND_STEPS.length - 1, s + 1)), 2600);
  };

  const finish = useCallback((res) => {
    clearInterval(timer.current);
    if (res.success) {
      setData(res.data);
      setSelected(new Set((res.data.hotel.images || []).slice(0, KEEP_BY_DEFAULT).map((i) => i.url)));
      setSaved(null);
      setFailure(null);
      setPhase('done');
    } else {
      setFailure({ message: res.message || 'The details could not be found.', code: res.code, canPaste: Boolean(res.canPaste) });
      setPhase('error');
    }
  }, []);

  const run = async (call) => {
    const request = ++latest.current;
    setPhase('loading');
    setFailure(null);
    startSteps();
    try {
      const res = await call();
      if (request === latest.current) finish(res);
    } catch (err) {
      if (request === latest.current) finish({ success: false, message: getErrorMessage(err, 'The finder could not be reached. Check your connection and try again.'), canPaste: false });
    }
  };

  const submit = (e) => {
    e?.preventDefault();
    const checked = checkAddress(address);
    if (!checked.ok) {
      setAddressError(checked.message);
      document.getElementById('finder-address')?.focus();
      return;
    }
    setAddressError('');
    run(() => hotelFinderService.find(checked.url));
  };

  const submitPaste = (e) => {
    e?.preventDefault();
    if (!pasteText.trim()) {
      setPasteError("Paste the page's text first: open the hotel's page in your browser, select everything (Ctrl+A), copy (Ctrl+C), and paste it here.");
      return;
    }
    setPasteError('');
    const typed = address.trim() && checkAddress(address).ok ? address.trim() : '';
    run(() => hotelFinderService.findText(pasteText, typed));
  };

  const toggleImage = (url) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(url)) next.delete(url);
    else next.add(url);
    return next;
  });

  const chosenImages = () => (data?.hotel.images || []).filter((i) => selected.has(i.url));

  /** Saves the find (with the chosen pictures) and returns the saved record, or null (the person is told why). */
  const save = async () => {
    if (saved) return saved;
    setSaving('Saving…');
    try {
      const images = chosenImages();
      let photos = [];
      let failed = 0;
      if (images.length) {
        setSaving(`Copying pictures… 0 of ${images.length}`);
        ({ photos, failed } = await copyPictures(images, (done, total) => setSaving(`Copying pictures… ${done} of ${total}`)));
      }
      setSaving('Saving…');
      const res = await hotelFinderService.create(foundFromFind(data, { photos }));
      if (!res.success) {
        showToast(res.message || 'The details could not be saved.', 'error');
        return null;
      }
      setSaved(res.data);
      showToast(failed ? `Saved in Found hotels. ${failed} ${failed === 1 ? 'picture' : 'pictures'} could not be copied.` : 'Saved in Found hotels.', failed ? 'warning' : 'success');
      return res.data;
    } catch (err) {
      showToast(getErrorMessage(err, 'The details could not be saved. Please try again.'), 'error');
      return null;
    } finally {
      setSaving('');
    }
  };

  const addToList = async () => {
    const record = await save();
    if (record) navigate(`/hotels/new?fromFound=${record._id}`);
  };

  const download = async (kind) => {
    setDownloading(kind);
    try {
      const found = saved || foundFromFind(data);
      const pictures = kind === 'csv' ? [] : await loadPictures(chosenImages().slice(0, 4).map((i) => ({ url: `${API_ORIGIN}${i.preview}`, width: i.width || 1200, height: i.height || 800, caption: i.alt })));
      if (kind === 'csv') {
        const r = await exportFoundCsv(found);
        if (!r.ok) showToast(r.message, 'warning');
      } else if (kind === 'docx') await exportFoundDocx(found, pictures);
      else await exportFoundPdf(found, pictures);
    } catch (err) {
      showToast(getErrorMessage(err, 'The file could not be made. Please try again.'), 'error');
    } finally {
      setDownloading('');
    }
  };

  const loading = phase === 'loading';
  const busy = loading || Boolean(saving);

  if (!allowed) {
    return (
      <div className="itin-page">
        <div className="itin-alert" role="status"><Lock size={16} aria-hidden="true" /><span>You do not have permission to use the hotel finder. Ask an administrator.</span></div>
      </div>
    );
  }

  return (
    <div className="itin-page">
      <div className="page-header animate-fade-in">
        <div className="page-header-text">
          <button type="button" className="itin-back" onClick={() => navigate('/hotels')}><ArrowLeft size={14} /> Hotel List</button>
          <div className="page-title-row"><h2 className="page-title">Find hotel info</h2></div>
          <p className="page-subtitle">Paste a hotel's website address. The finder reads its pages and collects the description, rating, contact details, location, rooms, amenities, rates (when the website prints them) and pictures.</p>
        </div>
      </div>

      <form className="glass-panel fh-box" onSubmit={submit} noValidate>
        <label className="form-label" htmlFor="finder-address">Hotel website address</label>
        <div className="fh-row">
          <input
            id="finder-address"
            type="text"
            inputMode="url"
            className="form-input"
            placeholder="e.g. www.grandlakepalace.com"
            value={address}
            onChange={(e) => { setAddress(e.target.value); if (addressError) setAddressError(''); }}
            aria-invalid={Boolean(addressError)}
            aria-describedby={addressError ? 'finder-address-error' : 'finder-address-hint'}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} <span>{loading ? 'Finding…' : 'Find details'}</span>
          </button>
        </div>
        {addressError ? <p className="field-error" id="finder-address-error" role="alert">{addressError}</p> : <p className="fh-hint" id="finder-address-hint">Use the hotel's own website. The home page is best; the finder also reads its contact, rooms and facilities pages. It obeys each website's rules for automatic readers.</p>}
        <p className="fh-hint">
          A website that does not allow automatic reading?{' '}
          <button type="button" className="fh-link-btn" onClick={() => setPasteOpen((o) => !o)} aria-expanded={pasteOpen}>{pasteOpen ? 'Hide pasting' : "Paste the page's text instead"}</button>
        </p>
        {pasteOpen && (
          <div className="fh-paste">
            <label className="form-label" htmlFor="finder-paste">The page's text</label>
            <textarea id="finder-paste" className="form-input" value={pasteText} onChange={(e) => { setPasteText(e.target.value); setPasteError(''); }} placeholder="Open the hotel's page in your browser, press Ctrl+A, then Ctrl+C, and paste here (Ctrl+V)." disabled={busy} aria-invalid={Boolean(pasteError)} />
            {pasteError && <p className="field-error" role="alert">{pasteError}</p>}
            <p className="fh-hint">The address above is optional here; it helps to know which website the text came from.</p>
            <button type="button" className="btn btn-outline" onClick={submitPaste} disabled={busy}><ClipboardPaste size={15} /> Find details in this text</button>
          </div>
        )}
        {loading && (
          <ol className="fh-steps" aria-live="polite" aria-label="What the finder is doing">
            {FIND_STEPS.map((text, i) => <li key={text} className={i < step ? 'is-done' : i === step ? 'is-now' : ''}>{i < step ? <Check size={14} aria-hidden="true" /> : i === step ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <span style={{ width: 14 }} />} {text}</li>)}
          </ol>
        )}
      </form>

      {phase === 'error' && failure && (
        <div className="fh-error" role="alert">
          <p><AlertCircle size={16} aria-hidden="true" style={{ verticalAlign: '-3px' }} /> {failure.message}</p>
          <div className="fh-error-actions">
            {failure.canPaste && !pasteOpen && <button type="button" className="btn btn-outline btn-sm" onClick={() => setPasteOpen(true)}><ClipboardPaste size={14} /> Paste the page's text</button>}
            {failure.code !== 'BAD_URL' && failure.code !== 'BLOCKED_ADDRESS' && failure.code !== 'BUSY' && address.trim() && <button type="button" className="btn btn-outline btn-sm" onClick={submit}>Try again</button>}
          </div>
        </div>
      )}

      {phase === 'done' && data && (
        <>
          <div className="glass-panel fh-head" style={{ padding: '12px 16px' }}>
            <div className="fh-actions" aria-label="What to do with these details">
              <button type="button" className="btn btn-primary" onClick={save} disabled={busy || Boolean(saved)}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />} <span>{saving || (saved ? 'Saved' : 'Save to the app')}</span>
              </button>
              <button type="button" className="btn btn-outline" onClick={addToList} disabled={busy || !can('hotels', 'canCreate')}><Hotel size={15} /> Add to the hotel list</button>
              <button type="button" className="btn btn-outline" onClick={() => download('docx')} disabled={busy || Boolean(downloading)}>{downloading === 'docx' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Word</button>
              <button type="button" className="btn btn-outline" onClick={() => download('pdf')} disabled={busy || Boolean(downloading)}>{downloading === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} PDF</button>
              <button type="button" className="btn btn-outline" onClick={() => download('csv')} disabled={busy || Boolean(downloading)}>{downloading === 'csv' ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />} CSV</button>
            </div>
          </div>
          {saved && (
            <div className="fh-saved-note" role="status">
              <Check size={16} aria-hidden="true" />
              <span><strong>{saved.name}</strong> is saved in Found hotels.</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/hotels/found/${saved._id}`)}>Open it</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate('/hotels?tab=found')}>See Found hotels</button>
            </div>
          )}
          <FindResult data={data} selected={selected} onToggleImage={toggleImage} onSelectAll={() => setSelected(new Set(data.hotel.images.map((i) => i.url)))} onSelectNone={() => setSelected(new Set())} />
        </>
      )}
    </div>
  );
};

export default HotelFinderPage;
