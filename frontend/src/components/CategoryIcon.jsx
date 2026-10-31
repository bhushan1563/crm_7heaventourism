import React from 'react';
import { Home, Globe, PlaneTakeoff, FileCheck2, Layers } from 'lucide-react';

// Supplier category -> icon + colour (replaces the emoji that used to stand in for icons).
const CATEGORY_STYLE = {
  Domestic: { Icon: Home, color: '#2563EB' },
  International: { Icon: Globe, color: '#0284C7' },
  'Flight Consolidator': { Icon: PlaneTakeoff, color: '#0E9AA7' },
  Visa: { Icon: FileCheck2, color: '#12B76A' },
  General: { Icon: Layers, color: '#667085' },
  ALL: { Icon: Layers, color: '#667085' }
};

export const CategoryIcon = ({ category, size = 16, tile = false }) => {
  const { Icon, color } = CATEGORY_STYLE[category] || CATEGORY_STYLE.General;

  if (!tile) return <Icon size={size} color={color} aria-hidden="true" style={{ flexShrink: 0 }} />;

  return (
    <span
      aria-hidden="true"
      style={{
        width: size + 16,
        height: size + 16,
        borderRadius: 9,
        background: `${color}14`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}
    >
      <Icon size={size} color={color} />
    </span>
  );
};

export default CategoryIcon;
