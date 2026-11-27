import React from 'react';

// px per pt: the art is drawn in the sample PDF's point units (1pt = 4/3 px at 96dpi).
const PX = 4 / 3;

const sizeOf = (vw, vh, { width, height, size }) => {
  if (size) {
    const k = size / Math.max(vw, vh);
    return [vw * k, vh * k];
  }
  if (width && height) return [width, height];
  if (width) return [width, (width * vh) / vw];
  if (height) return [(height * vw) / vh, height];
  return [vw * PX, vh * PX];
};

/**
 * Builds one art component. `color` is the main colour of the drawing, `accent` its second colour; `variant="cover"` redraws it in the
 * cover's light gold. Size it with `size` (longest side), `width` / `height` (px), or leave it at the sample's own size.
 */
export const makeArt = (displayName, [vx, vy, vw, vh], defaults, render) => {
  const Art = ({ color, accent, variant, width, height, size, style, className, title }) => {
    const cover = variant === 'cover';
    const c = color || (cover ? defaults.cover : defaults.color);
    const a = accent || (cover ? defaults.cover : defaults.accent);
    const [w, h] = sizeOf(vw, vh, { width, height, size });
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${vx} ${vy} ${vw} ${vh}`} width={w} height={h} style={style} className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : 'true'} focusable="false">
        {render(c, a)}
      </svg>
    );
  };
  Art.displayName = displayName;
  return Art;
};

export const TopOrnament = makeArt('TopOrnament', [0, 0, 70.72, 13.4], { color: '#0b7480', accent: '#c09a3e', cover: '#e6cb7e' }, (c, a) => (
  <>
    <path d="M35.36 0.65C37.67 4.21 37.67 9.19 35.36 12.75C33.04 9.19 33.04 4.21 35.36 0.65Z" fill={c}/>
    <path d="M35.36 12.75C32.15 10.8 29.48 7.95 28.33 4.39C31.71 5.19 34.11 8.21 35.36 12.75Z" fill={c} opacity="0.62"/>
    <path d="M35.36 12.75C38.56 10.8 41.23 7.95 42.39 4.39C39.01 5.19 36.6 8.21 35.36 12.75Z" fill={c} opacity="0.62"/>
    <path d="M20.23 6.7L22.99 9.46L20.23 12.22L17.47 9.46L20.23 6.7Z" fill={c} opacity="0.9"/>
    <path d="M50.49 6.7L53.25 9.46L50.49 12.22L47.73 9.46L50.49 6.7Z" fill={c} opacity="0.9"/>
    <path d="M0.65 9.46L14 9.46M56.72 9.46L70.07 9.46" fill="none" stroke={c} strokeWidth="0.8" strokeLinecap="round" opacity="0.55"/>
  </>
));

export const BottomOrnament = makeArt('BottomOrnament', [0, 0, 70.72, 13.4], { color: '#0b7480', accent: '#c09a3e', cover: '#e6cb7e' }, (c, a) => (
  <>
    <path d="M35.36 12.75C37.67 9.19 37.67 4.21 35.36 0.65C33.04 4.21 33.04 9.19 35.36 12.75Z" fill={c}/>
    <path d="M35.36 0.65C32.15 2.61 29.48 5.46 28.33 9.02C31.71 8.21 34.11 5.19 35.36 0.65Z" fill={c} opacity="0.62"/>
    <path d="M35.36 0.65C38.56 2.61 41.23 5.46 42.39 9.02C39.01 8.21 36.6 5.19 35.36 0.65Z" fill={c} opacity="0.62"/>
    <path d="M20.23 6.7L22.99 3.94L20.23 1.18L17.47 3.94L20.23 6.7Z" fill={c} opacity="0.9"/>
    <path d="M50.49 6.7L53.25 3.94L50.49 1.18L47.73 3.94L50.49 6.7Z" fill={c} opacity="0.9"/>
    <path d="M0.65 3.94L14 3.94M56.72 3.94L70.07 3.94" fill="none" stroke={c} strokeWidth="0.8" strokeLinecap="round" opacity="0.55"/>
  </>
));

export const HeaderLotus = makeArt('HeaderLotus', [0, 0, 15.12, 9.27], { color: '#0b7480', accent: '#c09a3e', cover: '#e6cb7e' }, (c, a) => (
  <>
    <path d="M7.56 0.25C8.91 2.84 8.91 6.1 7.56 8.69C6.21 6.1 6.21 2.84 7.56 0.25Z" fill={c} opacity="0.9"/>
    <path d="M7.56 8.69C5.31 7.34 3.4 5.31 2.61 2.84C4.98 3.4 6.66 5.54 7.56 8.69Z" fill={c} opacity="0.62"/>
    <path d="M7.56 8.69C9.81 7.34 11.72 5.31 12.51 2.84C10.15 3.4 8.46 5.54 7.56 8.69Z" fill={c} opacity="0.62"/>
    <path d="M7.56 9.03C5.09 8.8 2.27 7.67 0.25 5.76C3.06 5.65 5.88 6.77 7.56 9.03Z" fill={c} opacity="0.38"/>
    <path d="M7.56 9.03C10.04 8.8 12.85 7.67 14.88 5.76C12.06 5.65 9.25 6.77 7.56 9.03Z" fill={c} opacity="0.38"/>
  </>
));

export const FooterFlourishLeft = makeArt('FooterFlourishLeft', [0, 0, 34.15, 6.05], { color: '#c09a3e', accent: '#0b7480', cover: '#c09a3e' }, (c, a) => (
  <>
    <path d="M33.9 3.5L21.5 3.5" fill="none" stroke={c} strokeWidth="0.71" strokeLinecap="round" opacity="0.6"/>
    <path d="M17.96 1.19L15.66 3.5L17.96 5.8L20.26 3.5L17.96 1.19Z" fill={c}/>
    <path d="M12.65 3.5C9.1 0.55 4.97 0.25 0.25 2.61C4.97 4.38 9.1 4.68 12.65 3.5Z" fill={c} opacity="0.45"/>
  </>
));

export const FooterFlourishRight = makeArt('FooterFlourishRight', [0, 0, 34.86, 6.76], { color: '#c09a3e', accent: '#0b7480', cover: '#c09a3e' }, (c, a) => (
  <>
    <path d="M0.6 3.85L13 3.85" fill="none" stroke={c} strokeWidth="0.71" strokeLinecap="round" opacity="0.6"/>
    <path d="M16.54 1.55L18.85 3.85L16.54 6.15L14.24 3.85L16.54 1.55Z" fill={c}/>
    <path d="M21.86 3.85C25.4 0.9 29.53 0.6 34.25 2.97C29.53 4.74 25.4 5.03 21.86 3.85Z" fill={c} opacity="0.45"/>
  </>
));

export const PageRing = makeArt('PageRing', [0, 0, 28.25, 27.5], { color: '#0a2742', accent: '#c09a3e', cover: '#e6cb7e' }, (c, a) => (
  <>
    <path d="M0.63 13.75C0.62 12.89 0.71 12.03 0.88 11.19C1.05 10.34 1.29 9.52 1.62 8.73C1.95 7.93 2.36 7.17 2.84 6.46C3.32 5.74 3.86 5.08 4.47 4.47C5.08 3.86 5.74 3.32 6.46 2.84C7.17 2.36 7.93 1.95 8.73 1.62C9.52 1.29 10.34 1.05 11.19 0.88C12.03 0.71 12.89 0.62 13.75 0.62L14.5 0.62C15.36 0.62 16.22 0.71 17.06 0.88C17.91 1.05 18.73 1.29 19.52 1.62C20.32 1.95 21.08 2.36 21.79 2.84C22.51 3.32 23.17 3.86 23.78 4.47C24.39 5.08 24.93 5.74 25.41 6.46C25.89 7.17 26.3 7.93 26.63 8.73C26.96 9.52 27.2 10.34 27.37 11.19C27.54 12.03 27.63 12.89 27.63 13.75C27.63 14.61 27.54 15.47 27.37 16.31C27.2 17.16 26.96 17.98 26.63 18.77C26.3 19.57 25.89 20.33 25.41 21.04C24.93 21.76 24.39 22.42 23.78 23.03C23.17 23.64 22.51 24.18 21.79 24.66C21.08 25.14 20.32 25.55 19.52 25.88C18.73 26.21 17.91 26.45 17.06 26.62C16.22 26.79 15.36 26.87 14.5 26.88L13.75 26.88C12.89 26.87 12.03 26.79 11.19 26.62C10.34 26.45 9.52 26.21 8.73 25.88C7.93 25.55 7.17 25.14 6.46 24.66C5.74 24.18 5.08 23.64 4.47 23.03C3.86 22.42 3.32 21.76 2.84 21.04C2.36 20.33 1.95 19.57 1.62 18.77C1.29 17.98 1.05 17.16 0.88 16.31C0.71 15.47 0.62 14.61 0.63 13.75Z" fill="#ffffff"/>
    <path d="M0.63 13.75C0.62 12.89 0.71 12.03 0.88 11.19C1.05 10.34 1.29 9.52 1.62 8.73C1.95 7.93 2.36 7.17 2.84 6.46C3.32 5.74 3.86 5.08 4.47 4.47C5.08 3.86 5.74 3.32 6.46 2.84C7.17 2.36 7.93 1.95 8.73 1.62C9.52 1.29 10.34 1.05 11.19 0.88C12.03 0.71 12.89 0.62 13.75 0.62L14.5 0.62C15.36 0.62 16.22 0.71 17.06 0.88C17.91 1.05 18.73 1.29 19.52 1.62C20.32 1.95 21.08 2.36 21.79 2.84C22.51 3.32 23.17 3.86 23.78 4.47C24.39 5.08 24.93 5.74 25.41 6.46C25.89 7.17 26.3 7.93 26.63 8.73C26.96 9.52 27.2 10.34 27.37 11.19C27.54 12.03 27.63 12.89 27.63 13.75C27.63 14.61 27.54 15.47 27.37 16.31C27.2 17.16 26.96 17.98 26.63 18.77C26.3 19.57 25.89 20.33 25.41 21.04C24.93 21.76 24.39 22.42 23.78 23.03C23.17 23.64 22.51 24.18 21.79 24.66C21.08 25.14 20.32 25.55 19.52 25.88C18.73 26.21 17.91 26.45 17.06 26.62C16.22 26.79 15.36 26.87 14.5 26.88L13.75 26.88C12.89 26.87 12.03 26.79 11.19 26.62C10.34 26.45 9.52 26.21 8.73 25.88C7.93 25.55 7.17 25.14 6.46 24.66C5.74 24.18 5.08 23.64 4.47 23.03C3.86 22.42 3.32 21.76 2.84 21.04C2.36 20.33 1.95 19.57 1.62 18.77C1.29 17.98 1.05 17.16 0.88 16.31C0.71 15.47 0.62 14.61 0.63 13.75Z" fill="none" stroke={c} strokeWidth="0.75"/>
    <path d="M11.53 17.65C11.05 17.65 10.65 17.55 10.33 17.34C10 17.14 9.75 16.87 9.57 16.53C9.38 16.19 9.25 15.82 9.17 15.41C9.09 15.01 9.05 14.6 9.05 14.21C9.05 13.81 9.1 13.4 9.2 12.99C9.29 12.58 9.45 12.2 9.65 11.86C9.86 11.51 10.12 11.23 10.43 11.02C10.75 10.81 11.13 10.7 11.57 10.7C12.03 10.7 12.42 10.81 12.73 11.01C13.05 11.22 13.3 11.5 13.49 11.84C13.67 12.17 13.81 12.55 13.89 12.95C13.97 13.36 14.02 13.76 14.02 14.16C14.02 14.55 13.97 14.95 13.87 15.36C13.78 15.78 13.63 16.15 13.44 16.5C13.24 16.84 12.98 17.12 12.67 17.33C12.35 17.55 11.98 17.65 11.53 17.65ZM11.59 17.18C11.85 17.18 12.06 17.1 12.22 16.94C12.39 16.78 12.52 16.56 12.62 16.29C12.71 16.02 12.78 15.72 12.82 15.38C12.86 15.05 12.88 14.71 12.88 14.36C12.88 13.97 12.86 13.59 12.82 13.21C12.78 12.84 12.72 12.49 12.62 12.18C12.52 11.88 12.38 11.63 12.21 11.44C12.04 11.26 11.82 11.16 11.55 11.16C11.3 11.16 11.08 11.24 10.9 11.4C10.73 11.56 10.59 11.78 10.48 12.05C10.37 12.33 10.3 12.63 10.25 12.97C10.21 13.31 10.18 13.65 10.18 14.01C10.18 14.27 10.19 14.55 10.22 14.84C10.24 15.13 10.28 15.42 10.34 15.69C10.4 15.97 10.48 16.22 10.59 16.45C10.69 16.67 10.83 16.85 10.99 16.98C11.15 17.11 11.35 17.18 11.59 17.18Z" fill={c}/>
    <path d="M14.87 17.5C14.87 17.17 14.92 16.87 15.02 16.61C15.12 16.35 15.25 16.11 15.41 15.9C15.58 15.68 15.77 15.48 15.97 15.28C16.18 15.09 16.39 14.88 16.61 14.67C17.04 14.27 17.35 13.9 17.53 13.56C17.72 13.22 17.81 12.89 17.81 12.57C17.81 12.34 17.78 12.12 17.72 11.9C17.66 11.69 17.55 11.52 17.39 11.38C17.24 11.24 17.01 11.17 16.73 11.17C16.5 11.17 16.3 11.23 16.12 11.34C15.94 11.46 15.81 11.59 15.74 11.76C15.81 11.82 15.85 11.89 15.88 11.97C15.91 12.05 15.92 12.13 15.92 12.2C15.92 12.26 15.9 12.33 15.87 12.41C15.83 12.49 15.78 12.56 15.7 12.61C15.62 12.67 15.52 12.7 15.39 12.7C15.24 12.69 15.11 12.63 15.03 12.52C14.94 12.41 14.9 12.27 14.9 12.12C14.9 11.98 14.94 11.83 15.03 11.67C15.11 11.5 15.24 11.35 15.41 11.2C15.58 11.06 15.79 10.94 16.04 10.84C16.29 10.75 16.58 10.7 16.91 10.7C17.17 10.7 17.41 10.73 17.65 10.79C17.9 10.85 18.12 10.95 18.31 11.09C18.51 11.22 18.66 11.4 18.78 11.62C18.89 11.84 18.95 12.12 18.95 12.45C18.95 12.6 18.92 12.77 18.86 12.95C18.79 13.13 18.69 13.33 18.54 13.54C18.39 13.75 18.19 13.98 17.94 14.22C17.69 14.47 17.39 14.75 17.01 15.05C16.61 15.38 16.29 15.69 16.05 15.98C15.81 16.26 15.67 16.5 15.63 16.69L17.37 16.74C17.63 16.75 17.85 16.74 18.05 16.73C18.24 16.72 18.39 16.66 18.5 16.57C18.61 16.48 18.67 16.32 18.67 16.1L19.06 16.1L19 17.5L14.87 17.5Z" fill={c}/>
    <path d="M3.63 13.8L3.63 13.7C3.63 13.04 3.69 12.39 3.82 11.74C3.95 11.09 4.14 10.46 4.39 9.85C4.65 9.23 4.96 8.65 5.32 8.1C5.69 7.55 6.11 7.04 6.58 6.58C7.04 6.11 7.55 5.69 8.1 5.32C8.65 4.96 9.24 4.65 9.85 4.39C10.46 4.14 11.09 3.95 11.74 3.82C12.39 3.69 13.04 3.63 13.7 3.63L13.8 3.63C14.46 3.63 15.11 3.69 15.76 3.82C16.41 3.95 17.04 4.14 17.65 4.39C18.26 4.65 18.85 4.96 19.4 5.32C19.95 5.69 20.46 6.11 20.92 6.58C21.39 7.04 21.81 7.55 22.18 8.1C22.54 8.65 22.85 9.23 23.11 9.85C23.36 10.46 23.55 11.09 23.68 11.74C23.81 12.39 23.88 13.04 23.88 13.7L23.88 13.8C23.88 14.46 23.81 15.11 23.68 15.76C23.55 16.41 23.36 17.04 23.11 17.65C22.85 18.26 22.54 18.85 22.18 19.4C21.81 19.95 21.39 20.46 20.92 20.92C20.46 21.39 19.95 21.81 19.4 22.18C18.85 22.54 18.26 22.85 17.65 23.11C17.04 23.36 16.41 23.55 15.76 23.68C15.11 23.81 14.46 23.87 13.8 23.88L13.7 23.88C13.04 23.87 12.39 23.81 11.74 23.68C11.09 23.55 10.46 23.36 9.85 23.11C9.24 22.85 8.65 22.54 8.1 22.18C7.55 21.81 7.04 21.39 6.58 20.92C6.11 20.46 5.69 19.95 5.32 19.4C4.96 18.85 4.65 18.26 4.39 17.65C4.14 17.04 3.95 16.41 3.82 15.76C3.69 15.11 3.63 14.46 3.63 13.8Z" fill="none" stroke={a} strokeWidth="0.75" opacity="0.6"/>
  </>
));

export const DiamondSolid = makeArt('DiamondSolid', [0, 0, 6.86, 6.86], { color: '#c09a3e', accent: '#0b7480', cover: '#e6cb7e' }, (c, a) => (
  <>
    <path d="M3.43 0.25L6.61 3.43L3.43 6.61L0.25 3.43Z" fill={c}/>
  </>
));

export const DiamondOutline = makeArt('DiamondOutline', [0, 0, 6.33, 6.33], { color: '#c09a3e', accent: '#0b7480', cover: '#e6cb7e' }, (c, a) => (
  <>
    <path d="M3.17 0.52L5.82 3.17L3.17 5.82L0.52 3.17Z" fill="none" stroke={c} strokeWidth="0.75"/>
  </>
));

export const DiamondRuleLeft = makeArt('DiamondRuleLeft', [0, 0, 18.74, 5.1], { color: '#c09a3e', accent: '#0b7480', cover: '#e6cb7e' }, (c, a) => (
  <>
    <path d="M18.49 2.55L6.09 2.55" fill="none" stroke={c} strokeWidth="0.71" strokeLinecap="round" opacity="0.6"/>
    <path d="M2.55 0.25L0.25 2.55L2.55 4.85L4.85 2.55L2.55 0.25Z" fill={c}/>
  </>
));

export const DiamondRuleRight = makeArt('DiamondRuleRight', [0, 0, 19.45, 5.81], { color: '#c09a3e', accent: '#0b7480', cover: '#e6cb7e' }, (c, a) => (
  <>
    <path d="M0.6 2.91L13 2.91" fill="none" stroke={c} strokeWidth="0.71" strokeLinecap="round" opacity="0.6"/>
    <path d="M16.54 0.6L18.85 2.91L16.54 5.21L14.24 2.91L16.54 0.6Z" fill={c}/>
  </>
));

/** Plain diamond of any size, any colour. */
export const Diamond = ({ color = '#c09a3e', size = 8, style, className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width={size} height={size} style={style} className={className} aria-hidden="true" focusable="false">
    <path d="M5 0 10 5 5 10 0 5Z" fill={color} />
  </svg>
);

/** The flourish to put on either side of the page number in the footer. */
export const FooterFlourish = ({ side = 'left', ...rest }) => (side === 'right' ? <FooterFlourishRight {...rest} /> : <FooterFlourishLeft {...rest} />);

/**
 * The navy ribbon behind a section title (A NOTE BEFORE YOU TRAVEL ...): a bar with pointed ends. Sized by `width` and `height` in px;
 * the points are `notch` px deep. Put the title over it.
 */
export const TitleBannerBg = ({ width = 370, height = 35, notch = 13, color = '#0a2742', style, className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={style} className={className} aria-hidden="true" focusable="false">
    <path d={`M0 ${height / 2}L${notch} 0H${width - notch}L${width} ${height / 2}L${width - notch} ${height}H${notch}Z`} fill={color} />
  </svg>
);

export const ART_COLORS = { gold: '#c09a3e', teal: '#0b7480', navy: '#0a2742', coverGold: '#e6cb7e', cream: '#fffcf4' };
