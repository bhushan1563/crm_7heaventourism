import React from 'react';

export const StatCard = ({ title, value, subtitle, icon: Icon, color = '#2563EB', trend }) => {
  return (
    <div
      className="glass-panel"
      style={{
        padding: '22px 24px',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '135px',
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '14px',
        boxShadow: '0 2px 10px -2px rgba(15, 23, 42, 0.05)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: 'var(--font-headline)' }}>
          {title}
        </span>
        {Icon && (
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: `${color}15`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: color
            }}
          >
            <Icon size={20} />
          </div>
        )}
      </div>

      <div style={{ marginTop: '16px' }}>
        <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', display: 'flex', alignItems: 'baseline', gap: '8px', fontFamily: 'var(--font-headline)' }}>
          {value}
          {trend && (
            <span style={{ fontSize: '0.75rem', color: '#16A34A', fontWeight: 600, background: '#DCFCE7', padding: '2px 8px', borderRadius: '9999px' }}>
              {trend}
            </span>
          )}
        </div>
        {subtitle && (
          <div style={{ fontSize: '0.775rem', color: '#64748B', marginTop: '4px', fontWeight: 500 }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
