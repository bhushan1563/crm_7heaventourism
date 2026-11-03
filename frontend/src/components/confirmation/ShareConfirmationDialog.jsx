import React, { useRef } from 'react';
import useQuotationFiles from '../../hooks/useQuotationFiles';
import confirmationService from '../../services/confirmationService';
import { getErrorMessage } from '../../services/api';
import { COMPANY } from '../../config';
import { bookingView, quotationOf } from '../../utils/confirmation';
import { confirmationEmailSubject, defaultConfirmationMessage, shareFileName } from '../../utils/shareContact';
import ShareDialog from '../quotation/ShareDialog';
import BookingPage from './BookingPage';

/**
 * Sends a booking confirmation to the client as a PDF (the booking page followed by the quotation exactly as it was sold), by WhatsApp
 * or e-mail. See ShareDialog. The list carries only a summary of each booking, so the whole record is fetched when the file is made.
 * A typed phone number or address is kept on the booking, where the person may change it.
 */
export const ShareConfirmationDialog = ({ confirmation, isOpen, onClose, canEdit = false, onContactSaved, senderName = '', senderNumber = '' }) => {
  const files = useQuotationFiles();
  const whole = useRef({}); // the whole record of each booking asked for, by id
  if (!confirmation) return null;

  const wholeRecord = async () => {
    if (confirmation.quote) return confirmation;
    if (whole.current[confirmation._id]) return whole.current[confirmation._id];
    const res = await confirmationService.get(confirmation._id);
    if (!res.success) throw Object.assign(new Error(res.message), { userMessage: res.message || 'The booking could not be opened.' });
    whole.current[confirmation._id] = res.data;
    return res.data;
  };

  const makeFile = async () => {
    const record = await wholeRecord();
    const view = bookingView(record);
    const before = (parts) => <BookingPage confirmation={record} view={view} {...parts} />;
    const made = await files.pdf(quotationOf(record), { before, filename: shareFileName(record, 'pdf', 'Confirmation') });
    return { blob: made.blob, filename: made.filename };
  };

  // A partial update: only the contact fields change. It carries the version seen, so it can never overwrite someone else's save.
  const keepContact = async (patch) => {
    try {
      const res = await confirmationService.update(confirmation._id, { ...patch, updatedAt: confirmation.updatedAt });
      if (res.success) {
        onContactSaved?.(patch, res.data);
        return null;
      }
      return res.message || 'The contact details could not be saved on the booking.';
    } catch (error) {
      return getErrorMessage(error, 'The contact details could not be saved on the booking.');
    }
  };

  return (
    <ShareDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Share this booking confirmation"
      subtitle={[confirmation.confirmationNo, confirmation.clientName, confirmation.destination].filter(Boolean).join(' · ')}
      resetKey={confirmation._id}
      noun="booking"
      record={confirmation}
      canWord={false}
      wordHint="A booking confirmation is sent as a PDF"
      wordNote="PDF only"
      messageFor={() => defaultConfirmationMessage({ confirmation, senderName, senderNumber, company: COMPANY })}
      subjectText={confirmationEmailSubject(confirmation)}
      senderNumber={senderNumber}
      makeFile={makeFile}
      canKeep={canEdit && Boolean(confirmation._id)}
      keepContact={keepContact}
      host={files.host}
    />
  );
};

export default ShareConfirmationDialog;
