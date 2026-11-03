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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A date the way the client writes it on a hotel quotation: "07 Mar 2026". A date saved as YYYY-MM-DD, or as an ISO text for
 * midnight, is read from its own digits, so the day never moves with the time zone. Anything that is not a date comes back as it
 * was typed, and nothing gives an empty text.
 */
export const formatLongDate = (value) => {
  if (!value) return '';
  const text = String(value).trim();
  const plain = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  const [year, month, day] = plain
    ? [Number(plain[1]), Number(plain[2]), Number(plain[3])]
    : (() => {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? [NaN, NaN, NaN] : [d.getFullYear(), d.getMonth() + 1, d.getDate()];
      })();
  const real = new Date(Date.UTC(year, month - 1, day));
  if (!(year >= 1000 && year <= 9999) || real.getUTCFullYear() !== year || real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day) return text; // not a real day (31 Feb, month 13)
  return `${String(day).padStart(2, '0')} ${MONTHS[month - 1]} ${year}`;
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
