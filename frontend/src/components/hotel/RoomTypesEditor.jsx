import React, { useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { HOTEL_LIMITS, emptyRoomType } from '../../utils/hotel';

/** The room categories of a hotel (name and a short description each). Enter in a name adds the next room type. */
export const RoomTypesEditor = ({ rooms, onChange, errors = {}, disabled = false }) => {
  const refs = useRef([]);
  const set = (index, patch) => onChange(rooms.map((room, i) => (i === index ? { ...room, ...patch } : room)));
  const add = (focusIndex) => {
    if (rooms.length >= HOTEL_LIMITS.roomTypes) return;
    onChange([...rooms, emptyRoomType()]);
    setTimeout(() => refs.current[focusIndex]?.focus(), 0);
  };

  return (
    <div className="room-types">
      {rooms.length === 0 && <p className="list-editor-empty">No room types yet. Add the categories this hotel sells, for example Deluxe Room or Sea-view Suite.</p>}
      {rooms.map((room, index) => (
        <div className="room-row" key={index}>
          <div className="room-fields">
            <input
              ref={(el) => (refs.current[index] = el)}
              id={`room-${index}`}
              type="text"
              className="form-input"
              value={room.name}
              maxLength={HOTEL_LIMITS.roomName}
              placeholder="Room type, e.g. Deluxe Room"
              aria-label={`Name of room type ${index + 1}`}
              aria-invalid={Boolean(errors[`room-${index}`])}
              disabled={disabled}
              onChange={(e) => set(index, { name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add(index + 1);
                }
              }}
            />
            <input
              type="text"
              className="form-input"
              value={room.details}
              maxLength={HOTEL_LIMITS.roomDetails}
              placeholder="Details (optional), e.g. King bed, sea view, 38 sq m"
              aria-label={`Details of room type ${index + 1}`}
              disabled={disabled}
              onChange={(e) => set(index, { details: e.target.value })}
            />
          </div>
          {!disabled && (
            <button type="button" className="btn-icon btn-outline" onClick={() => onChange(rooms.filter((_, i) => i !== index))} aria-label={`Remove room type ${index + 1}`}>
              <Trash2 size={14} />
            </button>
          )}
          {errors[`room-${index}`] && (
            <p className="field-error room-error" role="alert">
              {errors[`room-${index}`]}
            </p>
          )}
        </div>
      ))}
      {!disabled && (
        <button type="button" className="btn btn-outline btn-sm" onClick={() => add(rooms.length)} disabled={rooms.length >= HOTEL_LIMITS.roomTypes}>
          <Plus size={13} /> Add a room type
        </button>
      )}
    </div>
  );
};

export default RoomTypesEditor;
