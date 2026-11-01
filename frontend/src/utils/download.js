/** Saves a Blob to the user's computer under the given file name (works for Word, PDF, anything). */
export const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before the address is released.
  setTimeout(() => URL.revokeObjectURL(url), 15000);
};
