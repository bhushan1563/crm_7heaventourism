// The look of the quotation document (measured from the client's sample): colours, fonts and the A4 page at 96 dpi.
export const PAGE_W = 794;
export const PAGE_H = 1123;

export const COLORS = {
  navy: '#0a2742',
  navyLine: '#2a4c6e',
  ink: '#12263b',
  muted: '#3b525b',
  teal: '#0b7480',
  gold: '#c09a3e',
  goldLight: '#e6cb7e',
  goldPale: '#f3e3ae',
  cream: '#fffcf4',
  panel: '#fffdf8',
  band: '#f9f3e3',
  rule: '#e2d4a9',
  ruleSoft: '#e4d7ae',
  slate: '#c7d4dc'
};

export const FONT_SERIF = "'Lora', Georgia, 'Times New Roman', serif";
export const FONT_SANS = "'Montserrat', 'Plus Jakarta Sans', -apple-system, Roboto, Arial, sans-serif";

/** The font families the document needs (the app and the print window both load them from Google Fonts). */
export const DOC_FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Montserrat:wght@400;500;600;700;800&display=swap';
