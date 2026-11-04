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
import { addFoundToHotelList } from '../utils/addFoundToHotels';
import { exportFoundCsv, exportFoundDocx, exportFoundPdf, loadPictures } from '../utils/hotelFinderExport';
import FindResult from '../components/hotelFinder/FindResult';
import './itineraries.css';
import '../components/hotelFinder/hotelFinder.css';

const KEEP_BY_DEFAULT = 8;
const PARALLEL = 3;

const isNameSuspicious = (name) => !name || /^skip\s+to/i.test(name) || /^(?:home|menu|navigation|cookie|loading)$/i.test(name);

/** Merges a second paste result into the first, keeping existing non-empty values and adding new ones. */
const mergeHotelData = (base, extra) => {
  const h1 = base.hotel || {};
  const h2 = extra.hotel || {};
  const merged = { ...h1 };
  for (const key of ['name', 'description', 'propertyType', 'starRating', 'tagline', 'website', 'checkIn', 'checkOut', 'priceLevel']) {
    if (!h1[key] && h2[key]) merged[key] = h2[key];
  }
  if (!h1.rates && h2.rates) merged.rates = h2.rates;
  if (!h1.guestRating && h2.guestRating) merged.guestRating = h2.guestRating;
  if (!h1.geo && h2.geo) merged.geo = h2.geo;
  const a1 = h1.address || {};
  const a2 = h2.address || {};
  const mergedAddr = { ...a2 };
  for (const k of ['full', 'street', 'locality', 'region', 'postalCode', 'country']) if (a1[k]) mergedAddr[k] = a1[k];
  merged.address = mergedAddr;
  const union = (a, b, key) => { const seen = new Set((a || []).map((x) => (key ? x[key] : x)?.toLowerCase?.())); return [...(a || []), ...(b || []).filter((x) => !seen.has((key ? x[key] : x)?.toLowerCase?.()))]; };
  merged.amenities = union(h1.amenities, h2.amenities);
  merged.phones = union(h1.phones, h2.phones);
  merged.emails = union(h1.emails, h2.emails);
  merged.rooms = union(h1.rooms, h2.rooms, 'name');
  merged.images = union(h1.images, h2.images, 'url');
  const fi1 = base.fieldInfo || {};
  const fi2 = extra.fieldInfo || {};
  const fieldInfo = { ...fi2 };
  for (const k of Object.keys(fi1)) {
    if (!fi2[k] || (fi1[k]?.confidence ?? 0) >= (fi2[k]?.confidence ?? 0)) fieldInfo[k] = fi1[k];
  }
  const missing = [...new Set([...(extra.completeness?.missing || []), ...(base.completeness?.missing || [])].filter((f) => !Object.keys(merged).includes(f) || !merged[f]))];
  return { ...base, hotel: merged, fieldInfo, pages: [...(base.pages || []), ...(extra.pages || [])], warnings: [...new Set([...(base.warnings || []), ...(extra.warnings || [])])], completeness: { ...extra.completeness, missing } };
};

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
  const [morePasteOpen, setMorePasteOpen] = useState(false);
  const [morePasteText, setMorePasteText] = useState('');
  const [morePasteError, setMorePasteError] = useState('');
  const [merging, setMerging] = useState(false);
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
    if (!record) return;
    setSaving('Adding to the hotel list…');
    const r = await addFoundToHotelList(record);
    setSaving('');
    if (r.ok) {
      showToast('Added to the hotel list.', 'success');
      navigate(`/hotels/${r.hotel._id}/edit`);
    } else if (r.needsForm) navigate(`/hotels/new?fromFound=${record._id}`);
    else showToast(r.message, 'error');
  };

  const submitMorePaste = async (e) => {
    e?.preventDefault();
    if (!morePasteText.trim()) {
      setMorePasteError('Paste the other page\'s text first.');
      return;
    }
    setMorePasteError('');
    setMerging(true);
    try {
      const typed = address.trim() && checkAddress(address).ok ? address.trim() : '';
      const res = await hotelFinderService.findText(morePasteText, typed);
      if (res.success) {
        setData((prev) => mergeHotelData(prev, res.data));
        setMorePasteText('');
        setMorePasteOpen(false);
        showToast('Extra page added — details merged in.', 'success');
      } else {
        setMorePasteError(res.message || 'Could not read that page.');
      }
    } catch (err) {
      setMorePasteError(getErrorMessage(err, 'Could not read that page. Please try again.'));
    } finally {
      setMerging(false);
    }
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
  const busy = loading || Boolean(saving) || merging;

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
              <button type="button" className="btn btn-outline" onClick={addToList} disabled={busy || !can('hotels', 'canCreate')}><Hotel size={15} /> Save to hotel list</button>
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
          {isNameSuspicious(data.hotel.name) && (
            <div className="fh-error" role="alert" style={{ background: 'var(--color-warning-bg, #fefce8)', borderColor: 'var(--color-warning, #ca8a04)' }}>
              <p><AlertCircle size={16} aria-hidden="true" style={{ verticalAlign: '-3px' }} /> The hotel name could not be found automatically. Please type the correct name in the form below before saving, or use <strong>Add details from another page</strong> to paste the About or Contact page.</p>
            </div>
          )}
          <div className="glass-panel fh-box" style={{ marginTop: 12 }}>
            <p className="fh-hint" style={{ marginBottom: 6 }}>
              <button type="button" className="fh-link-btn" onClick={() => setMorePasteOpen((o) => !o)} aria-expanded={morePasteOpen}>{morePasteOpen ? 'Hide' : 'Add details from another page'}</button>
              {' '}— paste the Contact, About or Rooms page to fill in missing details.
            </p>
            {morePasteOpen && (
              <form className="fh-paste" onSubmit={submitMorePaste} noValidate>
                <label className="form-label" htmlFor="finder-more-paste">Another page's text</label>
                <textarea id="finder-more-paste" className="form-input" value={morePasteText} onChange={(e) => { setMorePasteText(e.target.value); setMorePasteError(''); }} placeholder="Open the Contact or About page, press Ctrl+A, then Ctrl+C, and paste here." disabled={merging} aria-invalid={Boolean(morePasteError)} />
                {morePasteError && <p className="field-error" role="alert">{morePasteError}</p>}
                <button type="submit" className="btn btn-outline" disabled={merging}>{merging ? <><Loader2 size={15} className="animate-spin" /> Adding…</> : <><ClipboardPaste size={15} /> Add details from this page</>}</button>
              </form>
            )}
          </div>
          <FindResult data={data} selected={selected} onToggleImage={toggleImage} onSelectAll={() => setSelected(new Set(data.hotel.images.map((i) => i.url)))} onSelectNone={() => setSelected(new Set())} />
        </>
      )}
    </div>
  );
};

export default HotelFinderPage;
