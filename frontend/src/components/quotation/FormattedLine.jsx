import React, { useRef, useState } from 'react';
import LazyRichTextEditor from '../LazyRichTextEditor';
import RichText from '../RichText';
import { richToPlainText, simplifyRich } from '../../utils/richText';
import './formattedLine.css';

/**
 * One line of a quotation list (an inclusion, an exclusion, a policy or a note). It looks like a text box; clicking it opens
 * the formatting toolbar (bold, colour, highlight, size) for that line only, so a long list never carries dozens of editors.
 * A line with no formatting is stored as plain text, exactly as typed; formatted lines are stored as safe formatted text.
 */
export const FormattedLine = ({ value, onChange, placeholder = 'Type here…', ariaLabel = 'Line', maxLength = 1000, disabled = false }) => {
  const [editing, setEditing] = useState(false);
  const latest = useRef(value);
  latest.current = value;

  const finish = () => {
    setEditing(false);
    const simple = simplifyRich(latest.current);
    if (simple !== latest.current) onChange(simple); // unformatted text goes back to plain text
  };

  if (!editing) {
    const plain = richToPlainText(value);
    return (
      <button type="button" className="form-input fline" onClick={() => !disabled && setEditing(true)} disabled={disabled} aria-label={`${ariaLabel}: ${plain || 'empty'}. Press to edit and format`}>
        {value ? <RichText value={value} as="span" /> : <span className="fline-placeholder">{placeholder}</span>}
      </button>
    );
  }

  return (
    <div
      className="fline-editing"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) finish();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') finish();
      }}
    >
      <LazyRichTextEditor autoFocus value={value || ''} onChange={onChange} maxLength={maxLength} minHeight={44} ariaLabel={ariaLabel} placeholder={placeholder} />
    </div>
  );
};

export default FormattedLine;
