import api, { API_ORIGIN, getErrorMessage } from './api';
import { preparePhoto } from '../utils/photos';

/** Address of a stored photo. `variant` is 'full' (document quality) or 'thumb' (small preview for lists). */
export const mediaUrl = (token, variant = 'full') => `${API_ORIGIN}/media/${encodeURIComponent(token)}${variant === 'thumb' ? '/thumb' : ''}`;

/**
 * Shrinks a photo in the browser, uploads it and returns the reference to keep on the record: { token, width, height }.
 * Throws an Error whose message can be shown to the user as it is.
 * @param {File} file
 * @param {'hotel'|'itinerary'|'quotation'} purpose which kind of record the photo is for (decides who may upload)
 * @param {(percent: number) => void} [onProgress]
 */
export const uploadPhoto = async (file, purpose, onProgress) => {
  const prepared = await preparePhoto(file);
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('image', prepared.full, 'photo.jpg');
  form.append('thumb', prepared.thumb, 'thumb.jpg');
  let response;
  try {
    response = await api.post('/media', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
      onUploadProgress: (event) => event.total && onProgress?.(Math.round((event.loaded / event.total) * 100))
    });
  } catch (error) {
    throw new Error(getErrorMessage(error, 'The photo could not be uploaded. Please try again.'));
  }
  if (!response.data?.success) throw new Error(response.data?.message || 'The photo could not be uploaded.');
  const { token, width, height } = response.data.data;
  return { token, width, height };
};

export const mediaService = { uploadPhoto, mediaUrl };
export default mediaService;
