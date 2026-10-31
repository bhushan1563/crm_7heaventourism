import React from 'react';

// Status -> chip colour. A coloured dot + label (no icons) reads cleaner in dense tables.
const CLASS_BY_STATUS = {
  'Under Process': 'badge-under-process',
  'Follow up': 'badge-followup',
  Quoted: 'badge-quoted',
  Confirmed: 'badge-confirmed',
  'Confirmed & Payment received': 'badge-confirmed-paid',
  Travelled: 'badge-travelled',
  Draft: 'badge-under-process',
  Sent: 'badge-quoted',
  Revised: 'badge-quoted',
  Expired: 'badge-danger',
  Cancelled: 'badge-danger'
};

export const StatusBadge = ({ status }) => (
  <span className={`badge ${CLASS_BY_STATUS[status] || 'badge-under-process'}`}>
    <span className="badge-dot" aria-hidden="true" />
    <span>{status}</span>
  </span>
);

export default StatusBadge;
