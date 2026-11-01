import React from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Images, Trash2 } from 'lucide-react';
import PhotoGallery from '../PhotoGallery';
import LazyRichTextEditor from '../LazyRichTextEditor';
import { LIMITS, excerpt } from '../../utils/itinerary';

/**
 * One day of an itinerary. Collapsed it shows a one-line summary, so a long itinerary stays easy to scan and only the
 * day being edited carries a text editor.
 */
export const DayEditor = ({ index, total, day, open, error, disabled, onToggle, onChange, onMove, onDuplicate, onRemove }) => {
  const bodyId = `day-body-${index}`;
  const photoCount = day.photos?.length || 0;

  return (
    <section className={`day-card${open ? ' is-open' : ''}${error ? ' has-error' : ''}`} id={`day-${index}`}>
      <div className="day-head">
        <button type="button" className="day-toggle" onClick={onToggle} aria-expanded={open} aria-controls={bodyId}>
          {open ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
          <span className="day-number">Day {index + 1}</span>
          <span className="day-title-preview">{day.title.trim() || <em>Untitled day</em>}</span>
          {photoCount > 0 && (
            <span className="day-photos">
              <Images size={13} aria-hidden="true" /> {photoCount}
            </span>
          )}
        </button>
        {!disabled && (
          <span className="day-tools">
            <button type="button" className="btn-icon btn-outline" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move Day ${index + 1} up`} title="Move up">
              <ArrowUp size={14} />
            </button>
            <button type="button" className="btn-icon btn-outline" onClick={() => onMove(1)} disabled={index === total - 1} aria-label={`Move Day ${index + 1} down`} title="Move down">
              <ArrowDown size={14} />
            </button>
            <button type="button" className="btn-icon btn-outline" onClick={onDuplicate} disabled={total >= LIMITS.maxDays} aria-label={`Duplicate Day ${index + 1}`} title="Duplicate this day">
              <Copy size={14} />
            </button>
            <button type="button" className="btn-icon btn-outline itin-danger" onClick={onRemove} aria-label={`Remove Day ${index + 1}`} title="Remove this day">
              <Trash2 size={14} />
            </button>
          </span>
        )}
      </div>

      {error && (
        <p className="field-error day-error" role="alert">
          {error}
        </p>
      )}

      {open ? (
        <div className="day-body" id={bodyId}>
          <div className="day-fields">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label" htmlFor={`day-title-${index}`}>Title *</label>
              <input
                id={`day-title-${index}`}
                type="text"
                className="form-input"
                value={day.title}
                maxLength={LIMITS.dayTitle}
                placeholder="e.g. Arrival in Bali & transfer to Ubud"
                aria-invalid={Boolean(error)}
                disabled={disabled}
                onChange={(e) => onChange({ title: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={`day-stay-${index}`}>Overnight stay</label>
              <input id={`day-stay-${index}`} type="text" className="form-input" value={day.stay} maxLength={LIMITS.dayStay} placeholder="e.g. Ubud" disabled={disabled} onChange={(e) => onChange({ stay: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={`day-meals-${index}`}>Meals</label>
              <input id={`day-meals-${index}`} type="text" className="form-input" value={day.meals} maxLength={LIMITS.dayMeals} placeholder="e.g. Breakfast, Dinner" disabled={disabled} onChange={(e) => onChange({ meals: e.target.value })} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">What happens this day</label>
            <LazyRichTextEditor
              value={day.description}
              onChange={(description) => onChange({ description })}
              maxLength={LIMITS.dayDescription}
              minHeight={150}
              ariaLabel={`Description of Day ${index + 1}`}
              placeholder="Describe the day: sightseeing, transfers, timings…"
              disabled={disabled}
            />
          </div>

          <PhotoGallery
            photos={day.photos}
            onChange={(photos) => onChange({ photos })}
            purpose="itinerary"
            max={LIMITS.photosPerDay}
            disabled={disabled}
            label={`Photos for Day ${index + 1}`}
            help="Shown with this day in quotations, the Word file and the PDF."
          />
        </div>
      ) : (
        (day.description || photoCount > 0) && (
          <p className="day-excerpt" id={bodyId}>
            {excerpt(day.description, 160) || 'Photos only.'}
          </p>
        )
      )}
    </section>
  );
};

export default DayEditor;
