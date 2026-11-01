import React, { useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { LIMITS } from '../../utils/itinerary';

/** An editable list of short lines (inclusions, exclusions). Enter adds the next line. */
export const ListEditor = ({ label, items, onChange, placeholder, disabled = false }) => {
  const refs = useRef([]);
  const set = (index, value) => onChange(items.map((item, i) => (i === index ? value : item)));
  const add = (focusIndex) => {
    if (items.length >= LIMITS.listItems) return;
    onChange([...items, '']);
    setTimeout(() => refs.current[focusIndex]?.focus(), 0);
  };

  return (
    <div className="list-editor">
      {items.length === 0 && <p className="list-editor-empty">Nothing added yet.</p>}
      {items.map((item, index) => (
        <div className="list-editor-row" key={index}>
          <input
            ref={(el) => (refs.current[index] = el)}
            type="text"
            className="form-input"
            value={item}
            maxLength={LIMITS.listItemText}
            placeholder={placeholder}
            aria-label={`${label}, line ${index + 1}`}
            disabled={disabled}
            onChange={(e) => set(index, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add(index + 1);
              }
            }}
          />
          {!disabled && (
            <button type="button" className="btn-icon btn-outline" onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label={`Remove ${label.toLowerCase()} line ${index + 1}`}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button type="button" className="btn btn-outline btn-sm" onClick={() => add(items.length)} disabled={items.length >= LIMITS.listItems}>
          <Plus size={13} /> Add a line
        </button>
      )}
    </div>
  );
};

export default ListEditor;
