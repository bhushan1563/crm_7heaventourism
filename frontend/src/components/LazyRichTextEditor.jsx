import React, { Suspense, lazy } from 'react';

// The editor library is large; screens that never show a formatted-text field do not download it.
const RichTextEditor = lazy(() => import('./RichTextEditor'));

export const LazyRichTextEditor = ({ minHeight = 140, ...props }) => (
  <Suspense
    fallback={
      <div className="rich-editor rich-editor-loading" style={{ minHeight: minHeight + 90, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 13 }} role="status">
        Loading the text editor…
      </div>
    }
  >
    <RichTextEditor minHeight={minHeight} {...props} />
  </Suspense>
);

export default LazyRichTextEditor;
