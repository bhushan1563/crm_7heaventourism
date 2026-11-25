import React from 'react';
import { photoRows } from '../../utils/itineraryDoc';
import { mediaUrl } from '../../services/mediaService';
import { API_ORIGIN } from '../../services/api';

const photoCrossOrigin = API_ORIGIN ? 'anonymous' : undefined;

/** Photos in small rows, each row one height, wide photos on their own row. Scales with the page width. */
export const DayPhotos = ({ photos, maxRowHeight = 150 }) => {
  if (!photos?.length) return null;
  const gap = 6;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px` }}>
      {photoRows(photos, 3).map((row, r) => {
        const aspectSum = row.reduce((sum, { photo }) => sum + photo.width / photo.height, 0);
        return (
          <div key={r} style={{ display: 'flex', gap: `${gap}px`, alignItems: 'flex-start', width: '100%', maxWidth: `${Math.round(maxRowHeight * aspectSum + gap * (row.length - 1))}px` }}>
            {row.map(({ photo }, k) => (
              <figure key={`${photo.token}-${k}`} style={{ margin: 0, flex: `${photo.width / photo.height} 1 0`, minWidth: 0 }}>
                <img src={mediaUrl(photo.token)} alt={photo.caption || ''} width={photo.width} height={photo.height} crossOrigin={photoCrossOrigin} style={{ display: 'block', width: '100%', height: 'auto', borderRadius: '3px' }} />
                {photo.caption && <figcaption style={{ marginTop: '2px', fontSize: '9px', color: '#3b525b', fontStyle: 'italic', textAlign: 'center' }}>{photo.caption}</figcaption>}
              </figure>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default DayPhotos;
