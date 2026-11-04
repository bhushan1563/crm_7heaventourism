import React from 'react';
import useQuotationFiles from '../../hooks/useQuotationFiles';
import quotationService from '../../services/quotationService';
import { getErrorMessage } from '../../services/api';
import { COMPANY } from '../../config';
import { defaultEmailSubject, defaultShareMessage, shareFileName } from '../../utils/shareContact';
import ShareDialog from './ShareDialog';

/**
 * Sends a quotation to the client as a PDF or a Word file (Word is for visa quotations), by WhatsApp or e-mail. If the quotation has
 * no WhatsApp number (or e-mail address) the window asks for one, and offers to keep it on the quotation. See ShareDialog.
 */
export const ShareQuotationDialog = ({ quotation, isOpen, onClose, canEdit = false, onContactSaved, senderName = '', senderNumber = '' }) => {
  const files = useQuotationFiles();
  if (!quotation) return null;

  const makeFile = async (format) => {
    const made = format === 'docx' ? await files.docx(quotation) : await files.pdf(quotation);
    return { blob: made.blob, filename: made.filename || shareFileName(quotation, format) };
  };

  // Typed contact details are kept on the quotation (a partial update: only these two fields change).
  const keepContact = async (patch) => {
    try {
      const res = await quotationService.updateQuotation(quotation._id, patch);
      if (res.success) {
        onContactSaved?.(patch);
        return null;
      }
      return res.message || 'The contact details could not be saved on the quotation.';
    } catch (error) {
      return getErrorMessage(error, 'The contact details could not be saved on the quotation.');
    }
  };

  return (
    <ShareDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Share this quotation"
      subtitle={[quotation.quotationNo, quotation.clientName, quotation.destination].filter(Boolean).join(' · ')}
      resetKey={quotation._id}
      noun="quotation"
      record={quotation}
      canWord={true}
      messageFor={(format) => defaultShareMessage({ quotation, format, senderName, senderNumber, company: COMPANY })}
      subjectText={defaultEmailSubject(quotation)}
      senderNumber={senderNumber}
      makeFile={makeFile}
      canKeep={canEdit && Boolean(quotation._id)}
      keepContact={keepContact}
      host={files.host}
    />
  );
};

export default ShareQuotationDialog;
