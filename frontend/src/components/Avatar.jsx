import React from 'react';

/** A person's photo, or their initial on a gradient when they have not uploaded one. */
export const Avatar = ({ user, size = 32, className = '', style }) => {
  const initial = (user?.firstName?.[0] || user?.email?.[0] || 'U').toUpperCase();
  const box = { width: size, height: size, ...style };

  if (user?.avatar) {
    return <img className={`avatar avatar-photo ${className}`} src={user.avatar} alt="" style={box} draggable={false} />;
  }

  return (
    <span className={`avatar ${className}`} style={{ ...box, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {initial}
    </span>
  );
};

export default Avatar;
