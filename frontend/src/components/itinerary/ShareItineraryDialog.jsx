import React from 'react';
import { COMPANY } from '../../config';
import { defaultItineraryMessage, itineraryEmailSubject } from '../../utils/shareContact';
import ShareDialog from '../quotation/ShareDialog';

/**
 * Sends an itinerary to a client by WhatsApp or e-mail, as a PDF or a Word file. See ShareDialog. An itinerary of the library belongs to
 * no client, so the window always asks for the number or address (nothing is kept anywhere). `getItinerary` returns the whole itinerary
 * to print (the saved one, or what is on screen in the editor); the heavy file makers load only when a file is made.
 */
export const ShareItineraryDialog = ({ itinerary, isOpen, onClose, getItinerary, senderName = '', senderNumber = '' }) => {
  if (!itinerary) return null;

  const makeFile = async (format) => {
    const whole = await getItinerary();
    const generate = format === 'docx' ? (await import('../../utils/itineraryDocx')).generateItineraryDocx : (await import('../../utils/itineraryPdf')).generateItineraryPdf;
    const { blob, filename } = await generate(whole);
    return { blob, filename };
  };

  return (
    <ShareDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Send this itinerary"
      subtitle={[itinerary.title, itinerary.destination].filter(Boolean).join(' · ')}
      resetKey={itinerary._id || itinerary.title || 'itinerary'}
      noun="itinerary"
      record={{}}
      canWord
      wordNote="editable"
      messageFor={(format) => defaultItineraryMessage({ itinerary, format, senderName, senderNumber, company: COMPANY })}
      subjectText={itineraryEmailSubject(itinerary)}
      senderNumber={senderNumber}
      makeFile={makeFile}
    />
  );
};

export default ShareItineraryDialog;
