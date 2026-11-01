import React, { useId, useState } from 'react';
import { X } from 'lucide-react';
import { LIMITS, addTag } from '../../utils/itinerary';

/** Free-form tags (beach, honeymoon ...). Enter or a comma adds one; the cross removes it. */
export const TagInput = ({ tags, onChange, disabled = false }) => {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const commit = (raw) => {
    const result = addTag(tags, raw);
    setError(result.error || '');
    if (!result.error) setText('');
    if (result.tags !== tags) onChange(result.tags);
  };

  return (
    <div className="tag-input">
      <div className={`tag-input-box${error ? ' has-error' : ''}`}>
        {tags.map((tag) => (
          <span className="tag-chip" key={tag}>
            {tag}
            {!disabled && (
              <button type="button" onClick={() => onChange(tags.filter((t) => t !== tag))} aria-label={`Remove tag ${tag}`}>
                <X size={12} />
              </button>
            )}
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={text}
          disabled={disabled || tags.length >= LIMITS.tags}
          placeholder={tags.length ? 'Add another…' : 'e.g. beach, honeymoon, family'}
          aria-label="Add a tag"
          aria-invalid={Boolean(error)}
          maxLength={LIMITS.tagLength + 1}
          onChange={(e) => {
            const value = e.target.value;
            if (value.includes(',')) commit(value.replace(/,/g, ''));
            else setText(value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(text);
            } else if (e.key === 'Backspace' && !text && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => text.trim() && commit(text)}
        />
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default TagInput;
