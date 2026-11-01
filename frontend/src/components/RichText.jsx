import React, { useMemo } from 'react';
import { looksLikeHtml, sanitizeForDisplay } from '../utils/richText';
import './richtext.css';

/**
 * Shows stored text. Formatted text (bold, colour, highlight, size, lists) is cleaned again before it reaches the page;
 * plain text from older records is shown as text, keeping its line breaks.
 */
export const RichText = ({ value, as: Tag = 'div', className = '', style }) => {
  const html = useMemo(() => (looksLikeHtml(value) ? sanitizeForDisplay(value) : null), [value]);
  if (html === null) {
    return (
      <Tag className={`rich-text rich-plain ${className}`.trim()} style={style}>
        {value || ''}
      </Tag>
    );
  }
  return <Tag className={`rich-text ${className}`.trim()} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
};

export default RichText;
