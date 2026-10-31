import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, ImagePlus, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import Modal from './Modal';
import { mediaUrl, uploadPhoto } from '../services/mediaService';
import { photoProblem } from '../utils/photos';
import './photos.css';

const PARALLEL_UPLOADS = 3;

/**
 * Photo picker for a record. `photos` is the list kept on the record: [{ token, width, height, caption }].
 * Photos are shrunk in the browser, uploaded to the server and added to the list; the first photo is the cover.
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
  const inputRef = useRef(null);
  const latest = useRef(photos);
  const queue = useRef([]);
  const running = useRef(0);
  const [pending, setPending] = useState([]); // uploads in progress or failed
  const [notes, setNotes] = useState([]); // files that were turned away, with the reason
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    latest.current = photos;
  }, [photos]);

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
          commit([...latest.current, { ...ref, caption: '' }]);
          setPending((list) => list.filter((p) => p.id !== item.id));
        })
        .catch((error) => patchPending(item.id, { error: error.message || 'The photo could not be uploaded.' }))
        .finally(() => {
          running.current -= 1;
          pump();
        });
    }
  }, [commit, purpose]);

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || disabled) return;
    const messages = [];
    const accepted = [];
    let room = max - latest.current.length - pending.length;
    for (const file of files) {
      const problem = photoProblem(file);
      if (problem) messages.push(problem);
      else if (room <= 0) messages.push(`Only ${max} photos fit here. "${file.name}" was not added.`);
      else {
        accepted.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name, file, progress: 0, error: '' });
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
    <div className="photo-gallery">
      <div className="photo-gallery-head">
        <label className="form-label" htmlFor={inputId} style={{ margin: 0 }}>
          {label} <span className="photo-count">({photos.length}/{max})</span>
        </label>
      </div>
      {help && <p className="photo-help">{help}</p>}

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
          if (canAdd) addFiles(e.dataTransfer.files);
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

        {canAdd && (
          <button type="button" className="photo-add" onClick={() => inputRef.current?.click()}>
            <ImagePlus size={22} />
            <span>{total === 0 ? 'Add photos' : 'Add more'}</span>
            <small>or drop them here</small>
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
