import React, { useEffect, useState } from 'react';
import { paginatedMarkup } from '../utils/quotationPdfGenerator';

const OFF_SCREEN = { position: 'fixed', left: '-9999px', top: '-9999px', width: '794px' };

/**
 * Shows a quotation document the way the downloaded PDF has it: the same pages, split, filled and numbered by the same code. `sourceId` is
 * the id of the drawn document to lay out (usually `children` itself) and `version` changes whenever it does. Until the pages are ready,
 * `children` (the continuous document) is shown; it stays mounted, off screen, as the source for the next layout.
 */
export const PaginatedPreview = ({ sourceId, version, children }) => {
  const [markup, setMarkup] = useState('');
  useEffect(() => {
    let current = true;
    Promise.resolve()
      .then(() => paginatedMarkup(sourceId))
      .then((html) => { if (current && html) setMarkup(html); })
      .catch(() => { if (current) setMarkup(''); }); // the continuous document is shown instead
    return () => { current = false; };
  }, [sourceId, version]);

  return (
    <>
      {markup && <div data-testid="paginated-preview" dangerouslySetInnerHTML={{ __html: markup }} />}
      <div style={markup ? OFF_SCREEN : undefined} aria-hidden={markup ? 'true' : undefined}>{children}</div>
    </>
  );
};

export default PaginatedPreview;
