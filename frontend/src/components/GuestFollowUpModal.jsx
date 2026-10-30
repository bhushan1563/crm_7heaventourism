import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Phone,
  Mail,
  Send,
  Calendar,
  User,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  History,
  FileText,
  Sparkles,
  X
} from 'lucide-react';
import Modal from './Modal';
import { formatDate } from '../utils/dateHelper';
import { FOLLOW_UP_TEMPLATES, FOLLOW_UP_CHANNELS } from '../config';

export const GuestFollowUpModal = ({
  isOpen,
  onClose,
  guest,
  currentUser,
  onFollowUpLogged
}) => {
  if (!guest) return null;

  const staffName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() : '7Heaven Team';
  const cleanPhone = (guest.contactNumber || '').replace(/[^0-9]/g, '');

  const [selectedTemplate, setSelectedTemplate] = useState('inquiry_followup');
  const [customMessage, setCustomMessage] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('WhatsApp');
  const [followUpNote, setFollowUpNote] = useState('');
  const [updateStatus, setUpdateStatus] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Template message generator
  const getTemplateText = (templateKey) => {
    switch (templateKey) {
      case 'inquiry_followup':
        return `Hello ${guest.guestNames}, Greetings from 7Heaven Tourism! 🌟\n\nWe are following up regarding your travel inquiry for *${guest.destination}* (Ref: ${guest.srNo}, Travel Date: ${formatDate(guest.travelDate)}).\n\nWould you like us to share customized package options and luxury itinerary details for your ${guest.paxCount || 2} Pax group? Feel free to let us know your preferred dates or any special preferences.\n\nWarm regards,\n${staffName}\n7Heaven Tourism\n📞 +91 7862829178`;

      case 'quotation_discussion':
        return `Dear ${guest.guestNames},\n\nWe have prepared a tailor-made luxury tour package for *${guest.destination}* as per your request (Ref: ${guest.srNo}).\n\nPlease let us know if you would like any modifications in hotels, flights, or sightseeing activities. When would be a convenient time for a brief 2-minute discussion?\n\nBest regards,\n${staffName}\n7Heaven Tourism`;

      case 'confirmation_reminder':
        return `Dear ${guest.guestNames},\n\nThank you for choosing 7Heaven Tourism for your upcoming journey to *${guest.destination}*! ✈️\n\nWe are ready to secure your preferred hotel accommodations and arrangements. Please let us know if you need any assistance with final booking details.\n\nRegards,\n${staffName}\n7Heaven Tourism`;

      case 'travel_date_approaching':
        return `Dear ${guest.guestNames},\n\nYour travel date (*${formatDate(guest.travelDate)}*) for *${guest.destination}* is approaching soon! 🎉\n\nOur operations team is getting all logistics and travel vouchers finalized. Please let us know if you require any additional airport assistance or vehicle arrangements.\n\nWarm regards,\n${staffName}\n7Heaven Tourism`;

      default:
        return `Hello ${guest.guestNames}, Greetings from 7Heaven Tourism! Regarding your inquiry for ${guest.destination}...`;
    }
  };

  useEffect(() => {
    setCustomMessage(getTemplateText(selectedTemplate));
    setFollowUpNote('');
  }, [selectedTemplate, guest]);

  // Actions
  const handleOpenWhatsApp = () => {
    const encoded = encodeURIComponent(customMessage);
    const phoneParam = cleanPhone.startsWith('91') || cleanPhone.length > 10 ? cleanPhone : `91${cleanPhone}`;
    const url = `https://wa.me/${phoneParam}?text=${encoded}`;
    window.open(url, '_blank');
  };

  const handleOpenEmail = () => {
    if (!guest.email) {
      alert('No email address registered for this guest.');
      return;
    }
    const subject = encodeURIComponent(`7Heaven Travel Inquiry Follow-up: ${guest.destination} (${guest.srNo})`);
    const body = encodeURIComponent(customMessage);
    window.location.href = `mailto:${guest.email}?subject=${subject}&body=${body}`;
  };

  const handlePhoneCall = () => {
    window.location.href = `tel:${guest.contactNumber}`;
  };

  const handleSaveFollowUpLog = async (e) => {
    e.preventDefault();
    if (!followUpNote.trim() && !customMessage.trim()) return;

    try {
      setSubmitting(true);
      const noteToSave = followUpNote.trim() || `Sent ${selectedChannel} follow-up message using template "${selectedTemplate.replace('_', ' ')}"`;
      await onFollowUpLogged(guest._id, {
        note: noteToSave,
        channel: selectedChannel,
        updateStatusToFollowUp: updateStatus
      });
      onClose();
    } catch (err) {
      console.error('Follow-up error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Notify & Follow-up: ${guest.guestNames}`}
      subtitle={`Inquiry #${guest.srNo} • ${guest.destination} • Travel Date: ${formatDate(guest.travelDate)}`}
      maxWidth="680px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Guest Summary Card */}
        <div
          style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            fontSize: '0.825rem'
          }}
        >
          <div>
            <div style={{ color: '#64748B', fontSize: '0.725rem', fontWeight: 600 }}>Guest & Contact</div>
            <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{guest.guestNames}</div>
            <div style={{ color: '#2563EB', fontWeight: 600, fontSize: '0.8rem' }}>{guest.contactNumber}</div>
          </div>
          <div>
            <div style={{ color: '#64748B', fontSize: '0.725rem', fontWeight: 600 }}>Destination & Pax</div>
            <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{guest.destination}</div>
            <div style={{ color: '#475569' }}>{guest.paxCount || 2} Pax • {formatDate(guest.travelDate)}</div>
          </div>
          <div>
            <div style={{ color: '#64748B', fontSize: '0.725rem', fontWeight: 600 }}>Assigned Team</div>
            <div style={{ color: '#0F172A', fontWeight: 600, marginTop: '2px' }}>Sales: <strong style={{ color: '#2563EB' }}>{guest.sales}</strong></div>
            <div style={{ color: '#0F172A', fontWeight: 600 }}>Ops: <strong style={{ color: '#0D9488' }}>{guest.ops}</strong></div>
          </div>
        </div>

        {/* Quick Launch Action Buttons */}
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
            1-Click Quick Connect:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <button
              type="button"
              onClick={() => {
                setSelectedChannel('WhatsApp');
                handleOpenWhatsApp();
              }}
              className="btn btn-success"
              style={{ padding: '10px', fontSize: '0.825rem', justifyContent: 'center' }}
            >
              <MessageSquare size={16} />
              <span>WhatsApp Chat</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedChannel('Email');
                handleOpenEmail();
              }}
              className="btn btn-secondary"
              style={{ padding: '10px', fontSize: '0.825rem', justifyContent: 'center' }}
            >
              <Mail size={16} />
              <span>Send Email</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedChannel('Phone');
                handlePhoneCall();
              }}
              className="btn btn-outline"
              style={{ padding: '10px', fontSize: '0.825rem', justifyContent: 'center' }}
            >
              <Phone size={16} color="#2563EB" />
              <span>Call Guest</span>
            </button>
          </div>
        </div>

        {/* Template Selector & Live Message Editor */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label className="form-label" style={{ marginBottom: 0 }}>
              Message Template:
            </label>
            <select
              className="form-select"
              style={{ width: 'auto', padding: '4px 10px', fontSize: '0.775rem' }}
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
            >
              {FOLLOW_UP_TEMPLATES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <textarea
            className="form-textarea"
            rows="5"
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            style={{ fontSize: '0.825rem', lineHeight: '1.45', fontFamily: 'monospace' }}
          />
        </div>

        {/* Log Interaction Section */}
        <form onSubmit={handleSaveFollowUpLog} style={{ borderTop: '1px solid #E2E8F0', paddingTop: '14px' }}>
          <div style={{ fontSize: '0.825rem', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
            Log Interaction in Guest History:
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Discussed 5-star hotel options via WhatsApp, guest will confirm tomorrow"
              value={followUpNote}
              onChange={(e) => setFollowUpNote(e.target.value)}
            />

            <select
              className="form-select"
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
            >
              {FOLLOW_UP_CHANNELS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#475569', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={updateStatus}
                onChange={(e) => setUpdateStatus(e.target.checked)}
              />
              <span>Set Guest Inquiry Status to <strong>"Follow up"</strong></span>
            </label>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-outline btn-sm"
              >
                Close
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={submitting}
              >
                {submitting ? 'Recording...' : 'Save Follow-Up Log'}
              </button>
            </div>
          </div>
        </form>

        {/* Past Follow-up History Timeline */}
        {guest.followUpNotes && guest.followUpNotes.length > 0 && (
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', fontWeight: 700, color: '#64748B', marginBottom: '8px' }}>
              <History size={13} />
              <span>Past Follow-up Logs ({guest.followUpNotes.length})</span>
            </div>
            <div style={{ maxHeight: '130px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
              {guest.followUpNotes.map((log, idx) => (
                <div
                  key={idx}
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #F1F5F9',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B', fontSize: '0.7rem' }}>
                    <span><strong>{log.by || 'Staff'}</strong> via <em>{log.channel || 'Interaction'}</em></span>
                    <span>{log.date ? new Date(log.date).toLocaleString() : ''}</span>
                  </div>
                  <div style={{ color: '#0F172A' }}>{log.note}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default GuestFollowUpModal;
