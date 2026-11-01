import React, { useCallback, useMemo } from 'react';
import QuotationPreviewModal from '../QuotationPreviewModal';
import BookingPage from './BookingPage';
import { bookingView, quotationOf } from '../../utils/confirmation';

/**
 * The preview, PDF download and print of a booking confirmation: the booking page followed by the quotation pages exactly as they
 * were sold. `form` (optional) puts unsaved edits on the booking page, so what is previewed is what is on the screen.
 */
export const ConfirmationPreview = ({ confirmation, form, isOpen, onClose }) => {
  const view = useMemo(() => bookingView(confirmation, form), [confirmation, form]);
  const quotation = useMemo(() => quotationOf(confirmation), [confirmation]);
  const before = useCallback((parts) => <BookingPage confirmation={confirmation} view={view} {...parts} />, [confirmation, view]);
  if (!confirmation) return null;
  return <QuotationPreviewModal isOpen={isOpen} onClose={onClose} quotation={quotation} before={before} documentLabel="Confirmation" />;
};

export default ConfirmationPreview;
