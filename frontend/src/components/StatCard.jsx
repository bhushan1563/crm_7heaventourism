import React from 'react';

export const StatCard = ({ title, value, subtitle, icon: Icon, color = '#2563EB', trend }) => {
  return (
    <div className="kpi-card">
      <div className="kpi-top">
        <span className="kpi-label">{title}</span>
        {Icon && (
          <div className="kpi-icon" style={{ background: `${color}14`, color }}>
            <Icon size={18} />
          </div>
        )}
      </div>

      <div>
        <div className="kpi-value">
          {value}
          {trend && <span className="kpi-trend">{trend}</span>}
        </div>
        {subtitle && <div className="kpi-sub">{subtitle}</div>}
      </div>
    </div>
  );
};

export default StatCard;
