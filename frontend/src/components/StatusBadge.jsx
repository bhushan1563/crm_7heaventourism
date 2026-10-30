import React from 'react';
import { Clock, Send, CheckCircle2, DollarSign, Plane, PhoneForwarded, FileText, AlertCircle, RefreshCw } from 'lucide-react';

export const StatusBadge = ({ status }) => {
  let badgeClass = 'badge-under-process';
  let icon = <Clock size={12} />;

  switch (status) {
    case 'Under Process':
      badgeClass = 'badge-under-process';
      icon = <Clock size={12} />;
      break;
    case 'Follow up':
      badgeClass = 'badge-followup';
      icon = <PhoneForwarded size={12} />;
      break;
    case 'Quoted':
      badgeClass = 'badge-quoted';
      icon = <Send size={12} />;
      break;
    case 'Confirmed':
      badgeClass = 'badge-confirmed';
      icon = <CheckCircle2 size={12} />;
      break;
    case 'Confirmed & Payment received':
      badgeClass = 'badge-confirmed-paid';
      icon = <DollarSign size={12} />;
      break;
    case 'Travelled':
      badgeClass = 'badge-travelled';
      icon = <Plane size={12} />;
      break;
    case 'Draft':
      badgeClass = 'badge-under-process';
      icon = <FileText size={12} />;
      break;
    case 'Revised':
      badgeClass = 'badge-quoted';
      icon = <RefreshCw size={12} />;
      break;
    case 'Expired':
      badgeClass = 'badge-danger';
      icon = <AlertCircle size={12} />;
      break;
    case 'Cancelled':
      badgeClass = 'badge-danger';
      icon = <AlertCircle size={12} />;
      break;
    default:
      badgeClass = 'badge-under-process';
      icon = <Clock size={12} />;
  }

  return (
    <span className={`badge ${badgeClass}`}>
      {icon}
      <span>{status}</span>
    </span>
  );
};

export default StatusBadge;
