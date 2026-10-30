/**
 * Formats a date string (YYYY-MM-DD, ISO, or Date) into DD-MM-YYYY display format
 * @param {string|Date} dateStr 
 * @returns {string} Formatted date string in DD-MM-YYYY format
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const str = String(dateStr).trim();

  // If already in DD-MM-YYYY (e.g. 15-08-2026)
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    return str;
  }

  // If in YYYY-MM-DD (e.g. 2026-08-15)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [year, month, day] = str.split('-');
    return `${day}-${month}-${year}`;
  }

  // If Date object or ISO string (e.g. 2026-08-15T00:00:00.000Z)
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

/**
 * Converts a date string or Date object into YYYY-MM-DD for HTML5 date inputs
 * @param {string|Date} dateVal
 * @returns {string} YYYY-MM-DD format string
 */
export const toInputDate = (dateVal) => {
  if (!dateVal) return '';
  const str = String(dateVal).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.split('T')[0];
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
};

export default formatDate;
