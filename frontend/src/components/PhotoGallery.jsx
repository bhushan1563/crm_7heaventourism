import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, ClipboardPaste, ImagePlus, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import Modal from './Modal';
import { mediaUrl, uploadPhoto } from '../services/mediaService';
import { photoProblem } from '../utils/photos';
import { CLIPBOARD_BLOCKED, NOTHING_PASTED, blobText, fileFromDataUrl, fileFromUrl, imageSources, readClipboard, toPhotoFile } from '../utils/pastedImages';
import './photos.css';

const PARALLEL_UPLOADS = 3;

// The gallery that Ctrl+V is meant for: the one the pointer or the keyboard is on. A page can have many (a day of an itinerary has its own),
// and only one of them may take a pasted picture.
let activeGallery = null;

const isTyping = (el) => Boolean(el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable));

/**
 * Photo picker for a record. `photos` is the list kept on the record: [{ token, width, height, caption }].
 * Photos are shrunk in the browser, uploaded to the server and added to the list; the first photo is the cover.
 * Photos are added by choosing files, by dropping them (also a picture dragged from a web page), or by PASTING a copied picture: copy it
 * on Google or any page (right-click, "Copy image") or take a screenshot, point at the gallery and press Ctrl+V, or use the Paste tile.
 */
export const PhotoGallery = ({
  photos = [],
  onChange,
  purpose,
  max = 20,
  disabled = false,
  label = 'Photos',
  help = 'JPG, PNG or WebP. Large photos are shrunk automatically. The first photo is the cover.',
  captions = true
}) => {
  const inputId = useId();
  const galleryId = useId();
  const inputRef = useRef(null);
  const latest = useRef(photos);
  const queue = useRef([]);
  const running = useRef(0);
  const counter = useRef(0); // numbers the files in the order they were chosen
  const chosenAt = useRef(new Map()); // photo token -> that number, for photos added on this screen
  const [pending, setPending] = useState([]); // uploads in progress or failed
  const [notes, setNotes] = useState([]); // files that were turned away, with the reason
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [fetching, setFetching] = useState(0); // pictures being fetched from a web address
  const pendingRef = useRef([]);
  const pastedCount = useRef(0); // numbers the pictures pasted on this screen ("Pasted photo 3")
  const hover = useRef(false);
  const focused = useRef(false);
  const pasteHandler = useRef(null);

  useEffect(() => {
    latest.current = photos;
  }, [photos]);
  pendingRef.current = pending;

  // Whether Ctrl+V is for this gallery: the pointer is over it or the keyboard is inside it (and it is the one used most recently).
  const refreshActive = () => {
    if (hover.current || focused.current) activeGallery = galleryId;
    else if (activeGallery === galleryId) activeGallery = null;
  };
  useEffect(
    () => () => {
      if (activeGallery === galleryId) activeGallery = null;
    },
    [galleryId]
  );

  const commit = useCallback(
    (next) => {
      latest.current = next; // keep the newest list even if another upload finishes before the parent re-renders
      onChange(next);
    },
    [onChange]
  );

  const patchPending = (id, patch) => setPending((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const pump = useCallback(() => {
    while (running.current < PARALLEL_UPLOADS && queue.current.length) {
      const item = queue.current.shift();
      running.current += 1;
      patchPending(item.id, { error: '', progress: 0 });
      uploadPhoto(item.file, purpose, (progress) => patchPending(item.id, { progress }))
        .then((ref) => {
          // The server stores identical photos once, so choosing the same photo twice gives the same reference back.
          if (latest.current.some((p) => p.token === ref.token)) {
            setNotes((n) => [...n, `"${item.name}" is already in this list, so it was not added again.`]);
          } else {
            // Uploads finish in any order (a small photo overtakes a large one), but the photos must appear in the order
            // they were chosen: the first one chosen is the cover. Slot each one in before the first photo chosen after it.
            const next = [...latest.current];
            const before = next.findIndex((p) => (chosenAt.current.get(p.token) ?? 0) > item.seq);
            next.splice(before === -1 ? next.length : before, 0, { ...ref, caption: '' });
            chosenAt.current.set(ref.token, item.seq);
            commit(next);
          }
          setPending((list) => list.filter((p) => p.id !== item.id));
        })
        .catch((error) => patchPending(item.id, { error: error.message || 'The photo could not be uploaded.' }))
        .finally(() => {
          running.current -= 1;
          pump();
        });
    }
  }, [commit, purpose]);

  const addFiles = (fileList, earlierNotes = []) => {
    const files = Array.from(fileList || []);
    if (disabled) return;
    if (!files.length) {
      if (earlierNotes.length) setNotes(earlierNotes);
      return;
    }
    const messages = [...earlierNotes];
    const accepted = [];
    let room = max - latest.current.length - pendingRef.current.length;
    for (const file of files) {
      const problem = photoProblem(file);
      if (problem) messages.push(problem);
      else if (room <= 0) messages.push(`Only ${max} photos fit here. "${file.name}" was not added.`);
      else {
        accepted.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, seq: (counter.current += 1), name: file.name, file, progress: 0, error: '' });
        room -= 1;
      }
    }
    setNotes(messages);
    if (accepted.length) {
      setPending((list) => [...list, ...accepted]);
      queue.current.push(...accepted);
      pump();
    }
  };

  /**
   * Adds what was pasted (or dragged in from a web page): picture files, or a picture carried in the copied page, or a picture at a web
   * address. Anything the browser or the site will not give us is told in plain words, with what to do instead.
   */
  const takePasted = async ({ files, html, text }) => {
    if (disabled) return;
    if (latest.current.length + pendingRef.current.length >= max) {
      setNotes([`Only ${max} ${max === 1 ? 'photo fits' : 'photos fit'} here. Remove one to add another.`]);
      return;
    }
    const found = [...files];
    const problems = [];
    if (!found.length) {
      const sources = imageSources(html, text);
      if (sources.length) setFetching((n) => n + 1);
      try {
        for (const source of sources) {
          try {
            const file = source.kind === 'data' ? fileFromDataUrl(source.value) : await fileFromUrl(source.value);
            if (file) found.push(file);
          } catch (error) {
            problems.push(error.message);
          }
        }
      } finally {
        if (sources.length) setFetching((n) => n - 1);
      }
    }
    const ready = [];
    for (const file of found) {
      try {
        ready.push(await toPhotoFile(file, (pastedCount.current += 1)));
      } catch (error) {
        problems.push(error.message);
      }
    }
    const notesToShow = [...new Set(problems)];
    if (!ready.length && !notesToShow.length) notesToShow.push(NOTHING_PASTED);
    addFiles(ready, notesToShow);
  };
  pasteHandler.current = takePasted;

  // Ctrl+V: for the gallery the pointer or the keyboard is on. A paste that holds no picture (ordinary text) is left alone.
  useEffect(() => {
    if (disabled) return undefined;
    const onPaste = (event) => {
      if (activeGallery !== galleryId) return;
      const contents = readClipboard(event.clipboardData);
      const hasPicture = contents.files.length > 0 || imageSources(contents.html, contents.text).length > 0;
      if (!hasPicture) return;
      if (isTyping(event.target) && !contents.files.length) return; // text being pasted into a box keeps going there
      event.preventDefault();
      pasteHandler.current?.(contents);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [disabled, galleryId]);

  // The Paste tile, for people who do not know the shortcut: asks the browser for what was copied.
  const pasteFromButton = async () => {
    if (typeof navigator === 'undefined' || typeof navigator.clipboard?.read !== 'function') {
      setNotes([CLIPBOARD_BLOCKED]);
      return;
    }
    try {
      const files = [];
      let html = '';
      let text = '';
      for (const item of await navigator.clipboard.read()) {
        const imageType = item.types.find((type) => /^image\//i.test(type));
        if (imageType) {
          const blob = await item.getType(imageType);
          files.push(new File([blob], '', { type: blob.type || imageType }));
          continue;
        }
        if (item.types.includes('text/html')) html += await blobText(await item.getType('text/html'));
        if (item.types.includes('text/plain')) text += await blobText(await item.getType('text/plain'));
      }
      await takePasted({ files, html, text });
    } catch {
      setNotes([CLIPBOARD_BLOCKED]);
    }
  };

  const retry = (item) => {
    queue.current.push(item);
    patchPending(item.id, { error: '', progress: 0 });
    pump();
  };
  const dismiss = (id) => setPending((list) => list.filter((p) => p.id !== id));

  const move = (index, delta) => {
    const next = [...photos];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };
  const remove = (index) => commit(photos.filter((_, i) => i !== index));
  const setCaption = (index, caption) => commit(photos.map((p, i) => (i === index ? { ...p, caption } : p)));

  const total = photos.length + pending.length;
  const canAdd = !disabled && total < max;

  return (
    <div
      className="photo-gallery"
      onMouseEnter={() => {
        hover.current = true;
        refreshActive();
      }}
      onMouseLeave={() => {
        hover.current = false;
        refreshActive();
      }}
      onFocus={() => {
        focused.current = true;
        refreshActive();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          focused.current = false;
          refreshActive();
        }
      }}
    >
      <div className="photo-gallery-head">
        <label className="form-label" htmlFor={inputId} style={{ margin: 0 }}>
          {label} <span className="photo-count">({photos.length}/{max})</span>
        </label>
      </div>
      {help && <p className="photo-help">{help}</p>}
      {canAdd && <p className="photo-help">You can also paste: copy a picture on Google or any web page (right-click it, then "Copy image"), point at this box and press Ctrl+V.</p>}

      <div
        className={`photo-grid${dragging ? ' is-dragging' : ''}`}
        onDragOver={(e) => {
          if (!canAdd) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!canAdd) return;
          // Files from the computer, or a picture dragged from a web page (which arrives as its page or its address).
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          else takePasted(readClipboard(e.dataTransfer));
        }}
      >
        {photos.map((photo, index) => (
          <figure className="photo-tile" key={photo.token}>
            <button type="button" className="photo-view" onClick={() => setViewing(index)} aria-label={`View photo ${index + 1} larger`}>
              <img src={mediaUrl(photo.token, 'thumb')} alt={photo.caption || `Photo ${index + 1}`} loading="lazy" />
            </button>
            {index === 0 && <span className="photo-cover">Cover</span>}
            {!disabled && (
              <div className="photo-actions">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move photo earlier" title="Move earlier">
                  <ChevronLeft size={15} />
                </button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === photos.length - 1} aria-label="Move photo later" title="Move later">
                  <ChevronRight size={15} />
                </button>
                <button type="button" onClick={() => remove(index)} className="is-danger" aria-label="Remove photo" title="Remove photo">
                  <Trash2 size={15} />
                </button>
              </div>
            )}
            {captions && (
              <input
                type="text"
                className="form-input photo-caption"
                value={photo.caption || ''}
                maxLength={120}
                placeholder="Caption (optional)"
                aria-label={`Caption for photo ${index + 1}`}
                disabled={disabled}
                onChange={(e) => setCaption(index, e.target.value)}
              />
            )}
          </figure>
        ))}

        {pending.map((item) => (
          <div className={`photo-tile photo-pending${item.error ? ' has-error' : ''}`} key={item.id} role="status">
            {item.error ? (
              <>
                <AlertCircle size={20} />
                <span className="photo-pending-name">{item.name}</span>
                <span className="photo-pending-error">{item.error}</span>
                <span className="photo-pending-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => retry(item)}>
                    <RotateCcw size={13} /> Try again
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => dismiss(item.id)} aria-label={`Dismiss ${item.name}`}>
                    <X size={13} />
                  </button>
                </span>
              </>
            ) : (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span className="photo-pending-name">{item.name}</span>
                <span className="photo-progress" aria-hidden="true">
                  <span style={{ width: `${item.progress}%` }} />
                </span>
                <span className="photo-pending-note">
                  {item.progress > 0 && item.progress < 100 ? `Uploading ${item.progress}%` : item.progress >= 100 ? 'Saving…' : 'Preparing…'}
                </span>
              </>
            )}
          </div>
        ))}

        {fetching > 0 && (
          <div className="photo-tile photo-pending" role="status">
            <Loader2 size={20} className="animate-spin" />
            <span className="photo-pending-note">Getting the picture…</span>
          </div>
        )}

        {canAdd && (
          <button type="button" className="photo-add" onClick={() => inputRef.current?.click()}>
            <ImagePlus size={22} />
            <span>{total === 0 ? 'Add photos' : 'Add more'}</span>
            <small>or drop them here</small>
          </button>
        )}

        {canAdd && (
          <button type="button" className="photo-add photo-paste" onClick={pasteFromButton} aria-label="Paste a picture you copied">
            <ClipboardPaste size={22} />
            <span>Paste a picture</span>
            <small>copied from Google or any page</small>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = ''; // choosing the same file again must work
        }}
      />

      <div aria-live="polite">
        {notes.map((note) => (
          <p className="photo-note" key={note} role="alert">
            <AlertCircle size={14} /> {note}
          </p>
        ))}
      </div>

      <Modal
        isOpen={viewing !== null && !!photos[viewing]}
        onClose={() => setViewing(null)}
        title={photos[viewing]?.caption || `Photo ${(viewing ?? 0) + 1} of ${photos.length}`}
        maxWidth="900px"
      >
        {photos[viewing] && (
          <div className="photo-lightbox">
            <button
              type="button"
              className="btn-icon btn-outline"
              onClick={() => setViewing((viewing - 1 + photos.length) % photos.length)}
              aria-label="Previous photo"
              disabled={photos.length < 2}
            >
              <ChevronLeft size={18} />
            </button>
            <img src={mediaUrl(photos[viewing].token)} alt={photos[viewing].caption || `Photo ${viewing + 1}`} />
            <button
              type="button"
              className="btn-icon btn-outline"
              onClick={() => setViewing((viewing + 1) % photos.length)}
              aria-label="Next photo"
              disabled={photos.length < 2}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PhotoGallery;
