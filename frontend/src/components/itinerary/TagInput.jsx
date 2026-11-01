import React, { useId, useState } from 'react';
import { X } from 'lucide-react';
import { LIMITS, addTag } from '../../utils/itinerary';

/**
 * Short free-form labels (tags such as beach or honeymoon; a hotel's amenities). Enter or a comma adds one; the cross
 * removes it. `rules` are the options of addTag (limits, whether to lower-case, how to name things in messages).
 */
export const TagInput = ({ tags, onChange, disabled = false, rules = {}, label = 'Add a tag', placeholder = 'e.g. beach, honeymoon, family', removeLabel = 'Remove tag' }) => {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const max = rules.max ?? LIMITS.tags;
  const maxLength = rules.maxLength ?? LIMITS.tagLength;

  const commit = (raw) => {
    const result = addTag(tags, raw, rules);
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
              <button type="button" onClick={() => onChange(tags.filter((t) => t !== tag))} aria-label={`${removeLabel} ${tag}`}>
                <X size={12} />
              </button>
            )}
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={text}
          disabled={disabled || tags.length >= max}
          placeholder={tags.length ? 'Add another…' : placeholder}
          aria-label={label}
          aria-invalid={Boolean(error)}
          maxLength={maxLength + 1}
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
