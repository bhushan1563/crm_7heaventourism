import React from 'react';
import { toDisplayHtml } from '../../utils/richText';
import { formatDate } from '../../utils/dateHelper';
import { durationText } from '../../utils/confirmation';

const rs = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;

const Heading = ({ children }) => (
  <h3 className="quotation-keep" style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '3px', margin: '14px 0 8px' }}>
    {children}
  </h3>
);

/**
 * The first page of a booking confirmation: who and where, the travellers, what has been paid and what is due, the additional
 * details and the notes. The quotation pages follow it. `DocumentHeader`, `DocumentFooter` and `pageContainerStyle` come from the
 * quotation document so the page looks like the rest; `view` is the booking information (see `bookingView`).
 */
export const BookingPage = ({ confirmation, view, id, DocumentHeader, DocumentFooter, pageContainerStyle }) => {
  const cancelled = confirmation.status === 'Cancelled';
  const facts = [
    ['Confirmation no', confirmation.confirmationNo],
    ['Client', confirmation.clientName],
    ['Destination', confirmation.destination],
    ['Duration', durationText(confirmation.duration)],
    ['Travel date', view.travelDate ? formatDate(view.travelDate) : ''],
    ['Guests', confirmation.paxDetails],
    ['Hotel option', confirmation.optionName],
    ['Quotation', confirmation.quotationNo],
    ['Confirmed on', confirmation.confirmedAt ? formatDate(confirmation.confirmedAt) : '']
  ].filter(([, value]) => value);
  const cell = { padding: '4px 6px', fontSize: '9.5px', color: '#1f2937' };
  const travellerColumns = '0.4fr 3fr 0.7fr 1.6fr 2.2fr';
  const contactColumns = '1.4fr 2.4fr 2.2fr';
  const pay = view.payment;

  return (
    <div className="quotation-page" id={`${id}-booking`} style={pageContainerStyle}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <DocumentHeader />

        <div style={{ textAlign: 'center', margin: '4px 0 10px' }}>
          <h2 style={{ fontSize: '19px', fontWeight: 800, color: cancelled ? '#b91c1c' : '#047857', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>Booking Confirmation</h2>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginTop: '3px' }}>{confirmation.destination}</div>
        </div>

        {cancelled && (
          <div className="quotation-keep" style={{ marginBottom: '10px', padding: '6px 10px', border: '1.5px solid #fecaca', borderRadius: '6px', backgroundColor: '#fef2f2', color: '#b91c1c', fontSize: '10px', fontWeight: 700, textAlign: 'center' }}>
            THIS BOOKING WAS CANCELLED{confirmation.cancelReason ? `: ${confirmation.cancelReason}` : ''}
          </div>
        )}

        <Heading>Confirmation Details</Heading>
        <div className="quotation-keep" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '3px 14px', padding: '6px 9px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '9.5px', color: '#334155' }}>
          {facts.map(([label, value]) => (
            <div key={label}>
              <strong style={{ color: '#0f172a' }}>{label}:</strong> {value}
            </div>
          ))}
        </div>

        {view.travellers.length > 0 && (
          <>
            <Heading>Travellers</Heading>
            <div className="quotation-keep" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: travellerColumns, backgroundColor: '#0f172a', color: '#ffffff', fontSize: '8.5px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {['#', 'Name', 'Age', 'Passport no.', 'Note'].map((h) => (
                  <div key={h} style={{ padding: '5px 6px' }}>{h}</div>
                ))}
              </div>
              {view.travellers.map((t, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: travellerColumns, borderTop: '1px solid #e2e8f0', backgroundColor: i % 2 ? '#f8fafc' : '#ffffff' }}>
                  <div style={cell}>{i + 1}</div>
                  <div style={{ ...cell, fontWeight: 700, color: '#0f172a' }}>{t.name}</div>
                  <div style={cell}>{t.age ?? '–'}</div>
                  <div style={cell}>{t.passportNo || '–'}</div>
                  <div style={cell}>{t.notes || '–'}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {view.contacts?.length > 0 && (
          <>
            <Heading>Contacts</Heading>
            <div className="quotation-keep" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: contactColumns, backgroundColor: '#0f172a', color: '#ffffff', fontSize: '8.5px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {['Role', 'Name', 'Contact number'].map((h) => (
                  <div key={h} style={{ padding: '5px 6px' }}>{h}</div>
                ))}
              </div>
              {view.contacts.map((c, i) => (
                <div key={c.key || c.label} style={{ display: 'grid', gridTemplateColumns: contactColumns, borderTop: '1px solid #e2e8f0', backgroundColor: i % 2 ? '#f8fafc' : '#ffffff' }}>
                  <div style={{ ...cell, fontWeight: 700, color: '#0f172a' }}>{c.label}</div>
                  <div style={cell}>{c.name || '–'}</div>
                  <div style={cell}>
                    {c.numbers.length ? c.numbers.map((n, k) => <div key={k}>{n}</div>) : '–'}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {view.showPricing && (
          <>
        <Heading>Payment</Heading>
        <div className="quotation-keep" style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
          {[['Total amount', rs(pay.totalAmount)], ['Received', rs(pay.received)]].map(([label, value], i) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', fontSize: '10px', borderTop: i ? '1px solid #e2e8f0' : 'none', backgroundColor: i % 2 ? '#f8fafc' : '#ffffff' }}>
              <span style={{ color: '#334155' }}>{label}</span>
              <strong style={{ color: '#0f172a' }}>{value}</strong>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: '11.5px', fontWeight: 800, color: '#0f172a', borderTop: '2px solid #0f172a', backgroundColor: pay.balance > 0 ? '#fef9c3' : '#ecfdf5' }}>
            <span>{pay.balance > 0 ? 'Balance to pay' : 'Fully paid'}</span>
            <span>{pay.balance > 0 ? rs(pay.balance) : rs(0)}</span>
          </div>
        </div>
        {(pay.balance > 0 && pay.balanceDueDate) || pay.note ? (
          <div className="quotation-keep" style={{ fontSize: '9.5px', color: '#334155', marginTop: '4px' }}>
            {pay.balance > 0 && pay.balanceDueDate && <div><strong style={{ color: '#0f172a' }}>Balance due by:</strong> {formatDate(pay.balanceDueDate)}</div>}
            {pay.note && <div><strong style={{ color: '#0f172a' }}>Note:</strong> {pay.note}</div>}
          </div>
        ) : null}
          </>
        )}

        {view.customFields.length > 0 && (
          <>
            <Heading>Additional Details</Heading>
            <div className="quotation-keep" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '3px 14px', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '9.5px', color: '#334155' }}>
              {view.customFields.map((f, i) => (
                <div key={i}>
                  <strong style={{ color: '#0f172a' }}>{f.label}:</strong> {f.value || '–'}
                </div>
              ))}
            </div>
          </>
        )}

        {view.notes && (
          <>
            <Heading>Notes</Heading>
            <div className="qd-rich" style={{ fontSize: '9.5px', lineHeight: '1.45', color: '#1f2937' }} dangerouslySetInnerHTML={{ __html: toDisplayHtml(view.notes) }} />
          </>
        )}
      </div>
      <DocumentFooter />
    </div>
  );
};

export default BookingPage;
