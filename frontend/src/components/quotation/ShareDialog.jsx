import React, { useEffect, useId, useRef, useState } from 'react';
import { Download, FileText, Loader2, Mail, MessageCircle, Share2 } from 'lucide-react';
import Modal from '../Modal';
import { getErrorMessage } from '../../services/api';
import { COMPANY } from '../../config';
import { saveBlob } from '../../utils/download';
import { FORMAT_LABELS, SHARE_LIMITS, contactToSave, emailAddress, mailtoLink, startingEmail, startingPhone, whatsappLink, whatsappNumber } from '../../utils/shareContact';
import './share.css';

// A deliberate message (marked by the file maker) is shown as it is; any other failure gets a general sentence.
const problemText = (error, fallback) => error?.userMessage || getErrorMessage(error, fallback);

const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

/** Opens a mail link the way a click would (a link click is allowed where setting the page address is not always). */
const openMail = (url) => {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
};

/** True where the browser can hand a file straight to another app (WhatsApp, Mail...). */
const canShareFiles = () => {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof File === 'function' && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: MIME.pdf })] });
  } catch {
    return false;
  }
};

/**
 * The window that sends a document to the client by WhatsApp or e-mail: a quotation, or a booking confirmation. The page that opens it
 * says what the document is and how its file is made; this window does the rest.
 *
 * WhatsApp: it asks for the client's number (checked in plain words, +91 added to ten digits), shows the message to change, then opens
 * the chat for that number with the message ready. E-mail: the same, with an address and a subject. If the client has no number (or
 * address) on record the window asks for one, and offers to keep it where the person may change the record.
 *
 * A WhatsApp or e-mail link can open the chat or the mail with the message ready, but cannot carry a file. So the file is saved to the
 * computer first, and the window says to attach it. Where the browser can share a file directly, "Share the file with an app" does that.
 *
 * @param {object} props
 * @param {string} props.resetKey changes when the window is opened for something else, so it starts afresh
 * @param {string} [props.noun] what is being sent, as the messages say it ("quotation", "booking")
 * @param {{ clientPhone?: string, clientEmail?: string }} props.record the contact details on record
 * @param {(format: string) => string} props.messageFor the message to start with for a file kind
 * @param {(format: string) => Promise<{ blob: Blob, filename: string }>} props.makeFile makes the file
 * @param {(patch: object) => Promise<string | null>} [props.keepContact] saves typed contact details; resolves with a warning in words, or null
 * @param {string} [props.senderNumber] the number of the person sending, shown and used in the message ("" = the company's)
 */
export const ShareDialog = ({
  isOpen,
  onClose,
  title = 'Share this quotation',
  subtitle = '',
  resetKey,
  noun = 'quotation',
  record,
  canWord = false,
  wordHint = 'Word files are available for visa quotations',
  wordNote = 'visa only',
  messageFor,
  subjectText = '',
  senderNumber = '',
  makeFile: makeTheFile,
  canKeep = false,
  keepContact: keepTheContact,
  host = null
}) => {
  const ids = useId();
  const [format, setFormat] = useState('pdf');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [messageEdited, setMessageEdited] = useState(false);
  const [keep, setKeep] = useState(true);
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null); // { kind: 'success' | 'error' | 'info', text, link? }
  const [shareable, setShareable] = useState(false);
  const noticeRef = useRef(null);
  const phoneRef = useRef(null);
  const emailRef = useRef(null);

  // Start afresh every time the window is opened for something.
  useEffect(() => {
    if (!isOpen) return;
    setFormat('pdf');
    setPhone(startingPhone(record));
    setEmail(startingEmail(record));
    setMessage(messageFor('pdf'));
    setSubject(subjectText);
    setMessageEdited(false);
    setKeep(true);
    setPhoneError('');
    setEmailError('');
    setBusy('');
    setNotice(null);
    setShareable(canShareFiles());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, resetKey]);

  // The result (and what to do next) can be below the fold of a small window: bring it into view when it appears.
  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [notice]);

  const working = Boolean(busy);
  const hadPhone = Boolean(startingPhone(record));
  const fromNumber = whatsappNumber(senderNumber);

  const chooseFormat = (next) => {
    setFormat(next);
    if (!messageEdited) setMessage(messageFor(next)); // the wording follows the file kind until the person changes it
  };

  const makeFile = () => makeTheFile(format);

  // Keeps typed contact details on the record (only where the person may change it, and only what is new).
  const keepContact = async () => {
    if (!canKeep || !keep || !keepTheContact) return null;
    const patch = contactToSave(record, whatsappNumber(phone), emailAddress(email));
    if (!Object.keys(patch).length) return null;
    return keepTheContact(patch);
  };

  const finish = async (success) => {
    const warning = await keepContact();
    setNotice({ kind: warning ? 'info' : 'success', text: warning ? `${success} (The contact details could not be saved on the ${noun}: ${warning})` : success });
  };

  const send = async (channel) => {
    let phoneResult;
    let emailResult;
    setNotice(null);
    if (channel === 'whatsapp') {
      phoneResult = whatsappNumber(phone);
      setPhoneError(phoneResult.ok ? '' : phoneResult.message);
      if (!phoneResult.ok) return phoneRef.current?.focus();
    } else {
      emailResult = emailAddress(email);
      setEmailError(emailResult.ok ? '' : emailResult.message);
      if (!emailResult.ok) return emailRef.current?.focus();
    }
    setBusy(channel);
    // WhatsApp is opened in a window that is opened right now, while the click still counts, and filled in once the file is ready.
    let popup = null;
    if (channel === 'whatsapp') {
      try {
        popup = window.open('', '_blank');
        popup?.document?.write?.('<p style="font-family:sans-serif;padding:24px">Preparing your WhatsApp message…</p>');
      } catch {
        popup = null;
      }
    }
    try {
      const file = await makeFile();
      saveBlob(file.blob, file.filename);
      if (channel === 'whatsapp') {
        const url = whatsappLink(phoneResult.digits, message);
        if (popup && !popup.closed) {
          popup.location.href = url;
          await finish(`WhatsApp is opening with your message for ${phoneResult.display}. The file ${file.filename} was saved to your computer: attach it in the chat (the paperclip) and press send.`);
        } else {
          setNotice({ kind: 'info', text: `Your browser blocked the WhatsApp window. The file ${file.filename} was saved to your computer.`, link: { href: url, label: `Open WhatsApp for ${phoneResult.display}` } });
          await keepContact();
        }
      } else {
        openMail(mailtoLink(emailResult.value, subject, message));
        await finish(`Your e-mail program is opening with the message for ${emailResult.value}. The file ${file.filename} was saved to your computer: attach it to the e-mail before sending.`);
      }
    } catch (error) {
      try {
        popup?.close();
      } catch {
        /* the window is already gone */
      }
      setNotice({ kind: 'error', text: problemText(error, 'The file could not be prepared. Please try again.') });
    } finally {
      setBusy('');
    }
  };

  const download = async () => {
    setNotice(null);
    setBusy('download');
    try {
      const file = await makeFile();
      saveBlob(file.blob, file.filename);
      setNotice({ kind: 'success', text: `${file.filename} was saved to your computer.` });
    } catch (error) {
      setNotice({ kind: 'error', text: problemText(error, 'The file could not be prepared. Please try again.') });
    } finally {
      setBusy('');
    }
  };

  const shareFile = async () => {
    setNotice(null);
    setBusy('share');
    try {
      const file = await makeFile();
      const shared = new File([file.blob], file.filename, { type: MIME[format] });
      if (!navigator.canShare?.({ files: [shared] })) {
        saveBlob(file.blob, file.filename);
        setNotice({ kind: 'info', text: `This device cannot share this file directly, so ${file.filename} was saved to your computer instead.` });
      } else {
        await navigator.share({ files: [shared], title: subject, text: message });
        await finish('The file was handed to the app you chose.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setNotice({ kind: 'error', text: problemText(error, 'The file could not be shared. Please use "Download" instead.') });
    } finally {
      setBusy('');
    }
  };

  const typedNew = Object.keys(contactToSave(record, whatsappNumber(phone), emailAddress(email))).length > 0;
  const fileKind = FORMAT_LABELS[format];

  return (
    <Modal isOpen={isOpen} onClose={working ? () => {} : onClose} title={title} subtitle={subtitle} maxWidth="640px">
      <div className="share-dialog">
        <div className="share-block">
          <span className="share-label" id={`${ids}-format`}>What to send</span>
          <div className="share-formats" role="radiogroup" aria-labelledby={`${ids}-format`}>
            <button type="button" role="radio" aria-checked={format === 'pdf'} className={format === 'pdf' ? 'is-active' : ''} onClick={() => chooseFormat('pdf')} disabled={working}>
              <FileText size={15} aria-hidden="true" /> PDF <small>ready to read</small>
            </button>
            <button type="button" role="radio" aria-checked={format === 'docx'} className={format === 'docx' ? 'is-active' : ''} onClick={() => chooseFormat('docx')} disabled={working || !canWord} title={canWord ? 'A Word file the client or you can edit' : wordHint}>
              <FileText size={15} aria-hidden="true" /> Word <small>{canWord ? 'editable' : wordNote}</small>
            </button>
          </div>
        </div>

        <div className="share-block">
          <label className="share-label" htmlFor={`${ids}-message`}>Message</label>
          <textarea id={`${ids}-message`} className="form-textarea" rows={5} maxLength={SHARE_LIMITS.message} value={message} onChange={(e) => { setMessage(e.target.value); setMessageEdited(true); }} disabled={working} />
          <span className="share-count">{message.length} / {SHARE_LIMITS.message}</span>
        </div>

        <div className="share-block share-channel">
          <label className="share-label" htmlFor={`${ids}-phone`}>WhatsApp number</label>
          {!hadPhone && !phone.trim() && (
            <p className="share-ask" role="note">No WhatsApp number is saved for this client. Enter it to send on WhatsApp.</p>
          )}
          <div className="share-row">
            <input ref={phoneRef} id={`${ids}-phone`} type="tel" inputMode="tel" autoComplete="off" className="form-input" placeholder="e.g. 98765 43210 or +971 50 123 4567" value={phone} aria-invalid={Boolean(phoneError)} aria-describedby={phoneError ? `${ids}-phone-err` : undefined} onChange={(e) => { setPhone(e.target.value); setPhoneError(''); }} disabled={working} />
            <button type="button" className="btn share-whatsapp" onClick={() => send('whatsapp')} disabled={working}>
              {busy === 'whatsapp' ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />} <span>{busy === 'whatsapp' ? `Preparing the ${fileKind}…` : 'Send on WhatsApp'}</span>
            </button>
          </div>
          {phoneError && <p className="field-error" id={`${ids}-phone-err`} role="alert">{phoneError}</p>}
          <p className="share-from" data-testid="share-from">
            {fromNumber.ok ? (
              <>Your number in the message: <strong>{fromNumber.display}</strong></>
            ) : (
              <>The message carries the company number ({COMPANY.phone}). An Admin can set your own number in Rights &amp; Security.</>
            )}
          </p>
        </div>

        <div className="share-block share-channel">
          <label className="share-label" htmlFor={`${ids}-email`}>E-mail address</label>
          <div className="share-row">
            <input ref={emailRef} id={`${ids}-email`} type="email" inputMode="email" autoComplete="off" className="form-input" placeholder="e.g. name@example.com" value={email} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? `${ids}-email-err` : undefined} onChange={(e) => { setEmail(e.target.value); setEmailError(''); }} disabled={working} />
            <button type="button" className="btn btn-primary" onClick={() => send('email')} disabled={working}>
              {busy === 'email' ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} <span>{busy === 'email' ? `Preparing the ${fileKind}…` : 'Send by e-mail'}</span>
            </button>
          </div>
          {emailError && <p className="field-error" id={`${ids}-email-err`} role="alert">{emailError}</p>}
          <label className="share-subject" htmlFor={`${ids}-subject`}>Subject</label>
          <input id={`${ids}-subject`} type="text" className="form-input" maxLength={SHARE_LIMITS.subject} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={working} />
        </div>

        {canKeep && typedNew && (
          <label className="share-keep">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} disabled={working} />
            <span>Keep these contact details on the {noun}, so they are ready next time</span>
          </label>
        )}

        <p className="edit-hint share-hint">WhatsApp and e-mail links cannot carry a file themselves. The {fileKind} is saved to your computer first and the chat or e-mail opens with your message ready: attach the file there and send.</p>

        <div className="share-more">
          <button type="button" className="btn btn-outline btn-sm" onClick={download} disabled={working}>
            {busy === 'download' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} <span>Only download the {fileKind}</span>
          </button>
          {shareable && (
            <button type="button" className="btn btn-outline btn-sm" onClick={shareFile} disabled={working} title="Hand the file straight to WhatsApp, Mail or another app on this device">
              {busy === 'share' ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} <span>Share the file with an app</span>
            </button>
          )}
        </div>

        <div ref={noticeRef} className={`share-notice${notice ? ` is-${notice.kind}` : ''}`} role="status" aria-live="polite">
          {notice && (
            <>
              {notice.text}
              {notice.link && (
                <>
                  {' '}
                  <a href={notice.link.href} target="_blank" rel="noopener noreferrer">{notice.link.label}</a>
                </>
              )}
            </>
          )}
        </div>
      </div>
      {host}
    </Modal>
  );
};

export default ShareDialog;
