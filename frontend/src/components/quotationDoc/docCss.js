// The stylesheet of the quotation document. It travels inside the document (a <style> element), because the PDF is made from a copy of the
// document in a window of its own that receives only the markup. Everything is measured at 96 dpi on an A4 page (794 x 1123 px).
// Only what html2canvas can draw is used: no clip-path, no filters, no text inside SVG.
import { COLORS as C, FONT_SANS, FONT_SERIF } from './tokens';
import { JOURNEY_CSS } from './docCssBody';
import { OFFER_CSS } from './docCssPages';

const BASE = `
.qd, .qd * { box-sizing: border-box; }
.qd { font-family: ${FONT_SANS}; color: ${C.ink}; -webkit-font-smoothing: antialiased; }
.qd-page { position: relative; width: 794px; max-width: 794px; min-height: 1123px; background: ${C.cream}; color: ${C.ink}; font-family: ${FONT_SANS}; display: flex; flex-direction: column; overflow: visible; }
.qd-page.is-fixed { height: 1123px; overflow: hidden; }
.qd-inner { position: relative; flex: 1; display: flex; flex-direction: column; padding: 0 68px; min-height: 1123px; }
.qd-flow { display: flex; flex-direction: column; flex: 1; padding-bottom: 14px; }
.qd-serif { font-family: ${FONT_SERIF}; }
.qd p { margin: 0; }

/* ---- the frame: three lines, a corner piece in each corner, a flourish top and bottom ---- */
.qd-frame { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
.qd-frame > i { position: absolute; display: block; border: 1px solid; }
.qd-fr1 { inset: 24px; border-color: ${C.ruleSoft} !important; }
.qd-fr2 { inset: 30px; border-color: ${C.navy} !important; }
.qd-fr3 { inset: 40px; border-color: ${C.gold} !important; }
.qd-frame.is-cover .qd-fr1 { border-color: ${C.navyLine} !important; }
.qd-frame.is-cover .qd-fr2 { border-color: ${C.gold} !important; }
.qd-frame.is-cover .qd-fr3 { border-color: ${C.goldLight} !important; }
.qd-fr-top, .qd-fr-bottom { position: absolute; left: 50%; margin-left: -66px; width: 132px; height: 40px; }
.qd-fr-top { top: 18px; }
.qd-fr-bottom { bottom: 18px; }
.qd-fr-top .qd-mask, .qd-fr-bottom .qd-mask { position: absolute; left: 0; right: 0; top: 4px; bottom: 4px; background: ${C.cream}; }
.qd-frame.is-cover .qd-mask { background: ${C.navy}; }
.qd-fr-top svg, .qd-fr-bottom svg { position: absolute; left: 0; top: 0; }
.qd-corner { position: absolute; display: block; width: 38px; height: 38px; }
.qd-corner svg { display: block; }
.qd-corner.tl { left: 36px; top: 45px; }
.qd-corner.tr { right: 36px; top: 45px; }
.qd-corner.bl { left: 36px; bottom: 45px; }
.qd-corner.br { right: 36px; bottom: 45px; }

/* ---- running header and footer of a page inside ---- */
.qd-head { position: relative; height: 113px; flex: none; z-index: 1; }
.qd-head-row { position: absolute; left: 4px; right: 1px; top: 63px; display: flex; align-items: center; justify-content: space-between; font-size: 10px; font-weight: 700; letter-spacing: 0.24em; text-transform: uppercase; line-height: 18px; }
.qd-head-brand { color: ${C.navy}; }
.qd-head-label { color: ${C.teal}; }
.qd-head-mid { flex: 1; display: flex; align-items: center; justify-content: center; margin: 0 16px; height: 18px; }
.qd-head-mid .gl { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, ${C.rule}); }
.qd-head-mid .gr { flex: 1; height: 1px; background: linear-gradient(270deg, transparent, ${C.rule}); }
.qd-head-mid svg { flex: none; margin: 0 8px; }
.qd-head-rule { position: absolute; left: 0; right: 0; top: 89px; height: 1px; background: ${C.rule}; }
.qd-head-rule i { position: absolute; display: block; transform: rotate(45deg); }
.qd-head-rule i.c { left: 50%; top: -4px; margin-left: -4px; width: 7px; height: 7px; background: ${C.gold}; }
.qd-head-rule i.s { top: -2px; width: 4px; height: 4px; background: ${C.rule}; }
.qd-head-rule i.s.l { left: 0; }
.qd-head-rule i.s.r { right: 0; }

.qd-foot { position: relative; flex: none; height: 112px; z-index: 1; margin-top: auto; }
.qd-foot-rule { position: absolute; left: 0; right: 0; top: 0; height: 1px; background: ${C.rule}; }
.qd-foot-rule i { position: absolute; display: block; transform: rotate(45deg); }
.qd-foot-rule i.c { left: 50%; top: -4px; margin-left: -4px; width: 7px; height: 7px; background: ${C.gold}; }
.qd-foot-rule i.s { top: -2px; width: 4px; height: 4px; background: ${C.rule}; }
.qd-foot-rule i.s.l { left: 0; }
.qd-foot-rule i.s.r { right: 0; }
.qd-foot-row { position: absolute; left: 45px; right: 45px; top: 12px; height: 38px; display: flex; align-items: center; justify-content: space-between; font-size: 10px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: ${C.navy}; }
.qd-foot-label { font-weight: 500; letter-spacing: 0.2em; }
.qd-foot-brand, .qd-foot-label { white-space: nowrap; }
.qd-foot-row.is-compact { font-size: 9px; letter-spacing: 0.12em; }
.qd-foot-row.is-compact .qd-foot-label { letter-spacing: 0.1em; }
.qd-foot-num { position: relative; width: 38px; height: 38px; border-radius: 50%; border: 1px solid ${C.navy}; background: ${C.cream}; display: flex; align-items: center; justify-content: center; font-family: ${FONT_SERIF}; font-size: 13px; font-weight: 500; letter-spacing: 0; color: ${C.navy}; }
.qd-foot-num::before { content: ''; position: absolute; inset: 3px; border-radius: 50%; border: 1px solid ${C.goldLight}; }
.qd-foot-flour { flex: none; width: 60px; height: 14px; }

/* ---- the section banner: a navy plate with pointed ends, a diamond and a hairline on each side ---- */
.qd-banner { display: flex; align-items: center; margin: 0 0 22px; }
.qd-banner .ln { flex: 1; height: 1px; background: ${C.rule}; }
.qd-banner .dm { flex: none; width: 10px; height: 10px; background: ${C.gold}; transform: rotate(45deg); margin: 0 14px; }
.qd-banner .plate { position: relative; flex: none; display: flex; align-items: stretch; }
.qd-banner .tip { width: 0; height: 0; border-style: solid; }
.qd-banner .tip.l { border-width: 17px 11px 17px 0; border-color: transparent ${C.navy} transparent transparent; }
.qd-banner .tip.r { border-width: 17px 0 17px 11px; border-color: transparent transparent transparent ${C.navy}; }
.qd-banner .txt { background: ${C.navy}; color: #fffdf8; height: 34px; padding: 0 22px; display: flex; align-items: center; font-family: ${FONT_SERIF}; font-weight: 500; font-size: 14.5px; letter-spacing: 0.28em; text-transform: uppercase; white-space: nowrap; }
.qd-banner.is-tight { margin-bottom: 16px; }

/* ---- the intro band of a numbered section ---- */
.qd-band { display: flex; align-items: center; background: ${C.band}; border: 1px solid ${C.rule}; padding: 18px 22px 18px 20px; margin: 0 0 20px; min-height: 120px; }
.qd-band .num { flex: none; font-family: ${FONT_SERIF}; font-size: 34px; font-weight: 500; color: ${C.teal}; width: 52px; padding-right: 12px; margin-right: 14px; border-right: 1px solid ${C.rule}; line-height: 1; text-align: center; }
.qd-band .tx { flex: 1; min-width: 0; }
.qd-band h2 { margin: 0 0 6px; font-family: ${FONT_SERIF}; font-size: 22px; font-weight: 500; color: ${C.navy}; line-height: 1.2; }
.qd-band p { font-size: 12px; line-height: 1.5; color: ${C.muted}; max-width: 440px; }
.qd-band .art { flex: none; width: 90px; height: 70px; display: flex; align-items: center; justify-content: center; margin-left: 12px; }

/* ---- a box of notes: a numbered title and a list of diamonds ---- */
.qd-panel { background: ${C.panel}; border: 1px solid ${C.rule}; }
.qd-panel-head { display: flex; align-items: center; height: 40px; padding: 0 14px 0 14px; border-bottom: 1px solid ${C.rule}; }
.qd-panel-head .badge { flex: none; width: 20px; height: 20px; border-radius: 50%; background: ${C.navy}; color: #fff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-right: 10px; }
.qd-panel-head .badge-art { flex: none; width: 20px; height: 20px; margin-right: 10px; display: flex; }
.qd-panel-head .ttl { flex: 1; font-size: 11.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: ${C.navy}; }
.qd-panel-head .ico { flex: none; width: 16px; height: 16px; opacity: 0.9; }
.qd-panel-body { padding: 12px 14px 14px; }
.qd-list { list-style: none; margin: 0; padding: 0; }
.qd-list li { position: relative; padding-left: 16px; margin: 0 0 6px; font-size: 12.2px; line-height: 1.5; color: ${C.ink}; }
.qd-list li:last-child { margin-bottom: 0; }
.qd-list li::before { content: ''; position: absolute; left: 2px; top: 6px; width: 6px; height: 6px; border: 1px solid ${C.gold}; transform: rotate(45deg); }
.qd-list.is-solid li::before { background: ${C.gold}; border-color: ${C.gold}; width: 5px; height: 5px; top: 7px; }
.qd-list.cols2 { column-count: 2; column-gap: 18px; }
.qd-list.cols2 li { break-inside: avoid; }
.qd-rich p { margin: 0 0 4px; }
.qd-rich ul, .qd-rich ol { margin: 0 0 4px; padding-left: 16px; text-align: left; }
.qd-rich li { margin: 2px 0; }
.qd-rich mark { padding: 0 1px; border-radius: 2px; color: #111827; }
.qd-line p { display: inline; margin: 0; }
.qd-line ul, .qd-line ol { margin: 0; }
`;

const COVER = `
.qd-cover { background: ${C.navy}; color: #fff; }
.qd-cover .abs { position: absolute; }
.qd-cover .brand { left: 0; right: 0; top: 63px; text-align: center; font-weight: 700; font-size: 14.5px; letter-spacing: 0.3em; color: ${C.goldLight}; text-transform: uppercase; line-height: 18px; padding-left: 0.3em; }
.qd-cover .sub { left: 0; right: 0; top: 87px; text-align: center; font-size: 9px; font-weight: 500; letter-spacing: 0.3em; color: ${C.slate}; text-transform: uppercase; line-height: 14px; padding-left: 0.3em; }
.qd-cover .flour { left: 50%; top: 106px; width: 200px; margin-left: -100px; height: 9px; }
.qd-cover .flour::before { content: ''; position: absolute; left: 0; right: 0; top: 4px; height: 1px; background: linear-gradient(90deg, transparent, ${C.gold} 25%, ${C.gold} 75%, transparent); }
.qd-cover .flour::after { content: ''; position: absolute; left: 50%; top: 1px; margin-left: -3px; width: 7px; height: 7px; background: ${C.goldLight}; transform: rotate(45deg); }
.qd-cover .photo { left: 68px; top: 125px; width: 658px; height: 454px; overflow: hidden; background: ${C.navy}; }
.qd-cover .dome { overflow: hidden; position: absolute; left: -185px; top: 15px; width: 1028px; height: 1028px; border-radius: 50%; background-size: 658px 454px, 658px 454px; background-position: 185px -15px, 185px -15px; background-repeat: no-repeat; }
.qd-cover .photo svg.edge { position: absolute; left: 0; top: 0; }
.qd-cover .logo { left: 50%; top: 148px; width: 64px; height: 64px; margin-left: -32px; border-radius: 50%; background: rgba(10,39,66,0.55); border: 1px solid ${C.goldLight}; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.qd-cover .logo img { width: 54px; height: 54px; object-fit: contain; border-radius: 50%; display: block; }
.qd-cover .titleblock { left: 68px; width: 658px; top: 376px; text-align: center; }
.qd-cover .kicker { font-size: 11.5px; font-weight: 800; letter-spacing: 0.34em; color: #f8e08f; text-shadow: 0 2px 10px rgba(4,14,28,0.9), 0 0 3px rgba(4,14,28,0.85); text-transform: uppercase; padding-left: 0.36em; line-height: 14px; }
.qd-cover .title { font-family: ${FONT_SERIF}; font-weight: 700; color: #fff; text-shadow: 0 3px 16px rgba(4,14,28,0.92), 0 0 4px rgba(4,14,28,0.8); letter-spacing: 0.09em; text-transform: uppercase; line-height: 1.05; margin-top: 8px; padding-left: 0.09em; }
.qd-cover .country { margin-top: 6px; font-size: 12.5px; font-weight: 800; letter-spacing: 0.46em; color: #f8e08f; text-shadow: 0 2px 10px rgba(4,14,28,0.9), 0 0 3px rgba(4,14,28,0.85); text-transform: uppercase; padding-left: 0.5em; line-height: 16px; }
.qd-cover .tagline { margin-top: 8px; font-family: ${FONT_SERIF}; font-style: italic; font-weight: 500; font-size: 17px; color: #fff; text-shadow: 0 2px 10px rgba(4,14,28,0.9), 0 0 3px rgba(4,14,28,0.85); line-height: 22px; }
.qd-cover .card-wrap { left: 142px; top: 534px; width: 510px; height: 114px; border: 1px solid ${C.goldLight}; padding: 2px; background: ${C.navy}; }
.qd-cover .card { position: relative; width: 100%; height: 100%; background: ${C.cream}; border-top: 3px solid ${C.gold}; display: flex; flex-direction: column; align-items: center; padding-top: 11px; }
.qd-cover .card .len { font-weight: 800; font-size: 21px; letter-spacing: 0.07em; color: ${C.navy}; text-transform: uppercase; line-height: 28px; }
.qd-cover .card .dates { margin-top: 3px; font-weight: 600; font-size: 12.3px; letter-spacing: 0.2em; color: ${C.teal}; text-transform: uppercase; line-height: 18px; padding-left: 0.2em; }
.qd-cover .card .pills { margin-top: 8px; display: flex; gap: 10px; }
.qd-cover .pill { display: flex; align-items: center; gap: 7px; height: 32px; padding: 0 14px; border: 1px solid ${C.goldPale}; background: #fffdf8; font-size: 11.5px; color: ${C.navy}; white-space: nowrap; }
.qd-cover .pill b { font-weight: 700; }
.qd-cover .caption { left: 68px; width: 658px; top: 655px; text-align: center; font-family: ${FONT_SERIF}; font-style: italic; font-size: 11px; color: ${C.slate}; }
.qd-cover .caption span { position: relative; padding: 0 12px; background: ${C.navy}; }
.qd-cover .caption::before { content: ''; position: absolute; left: 0; right: 0; top: 8px; height: 1px; background: ${C.navyLine}; }
.qd-cover .rule { left: 68px; width: 658px; height: 1px; background: ${C.gold}; }
.qd-cover .prep { left: 68px; width: 658px; top: 685px; height: 81px; display: flex; }
.qd-cover .prep > div { flex: 1; text-align: center; padding-top: 15px; }
.qd-cover .prep > div + div { border-left: 1px solid ${C.navyLine}; margin: 12px 0; padding-top: 3px; }
.qd-cover .prep .k { font-size: 9px; font-weight: 700; letter-spacing: 0.26em; color: ${C.goldLight}; text-transform: uppercase; padding-left: 0.26em; line-height: 14px; }
.qd-cover .prep .v { margin-top: 5px; font-family: ${FONT_SERIF}; font-size: 19.5px; color: #fff; line-height: 26px; }
.qd-cover .prep .d { margin-top: 3px; font-size: 11.2px; color: ${C.slate}; line-height: 16px; }
.qd-cover .stats { left: 68px; width: 658px; top: 786px; display: flex; }
.qd-cover .stats > div { flex: 1; text-align: center; padding: 0 12px; }
.qd-cover .stats > div + div { border-left: 1px solid ${C.navyLine}; }
.qd-cover .stats .n { font-family: ${FONT_SERIF}; font-size: 37px; font-weight: 400; color: ${C.goldLight}; line-height: 44px; }
.qd-cover .stats .l { margin-top: 6px; font-size: 11px; line-height: 17px; color: #fff; }
.qd-back .scene { left: 68px; top: 362px; width: 660px; height: 153px; }
.qd-back .scene-cap { left: 0; right: 0; top: 524px; text-align: center; font-family: ${FONT_SERIF}; font-style: italic; font-size: 12px; color: ${C.slate}; }
.qd-back .thanks { left: 68px; width: 658px; top: 604px; text-align: center; }
.qd-back .lotus, .qd-back .dv { display: flex; align-items: center; justify-content: center; gap: 8px; height: 12px; }
.qd-back .lotus span, .qd-back .dv span { width: 44px; height: 1px; background: ${C.navyLine}; }
.qd-back .lotus i, .qd-back .dv i { width: 6px; height: 6px; background: ${C.goldLight}; transform: rotate(45deg); }
.qd-back .k { margin-top: 14px; font-size: 9.5px; font-weight: 600; letter-spacing: 0.3em; color: ${C.goldLight}; text-transform: uppercase; padding-left: 0.3em; }
.qd-back .nm { margin-top: 8px; font-family: ${FONT_SERIF}; font-size: 25px; font-weight: 400; letter-spacing: 0.04em; color: #fff; line-height: 32px; }
.qd-back .tg { margin-top: 6px; font-family: ${FONT_SERIF}; font-style: italic; font-size: 15px; color: ${C.goldLight}; line-height: 22px; }
.qd-back .pt { margin-top: 12px; font-size: 10px; font-weight: 600; letter-spacing: 0.1em; color: ${C.slate}; line-height: 15px; padding: 0 40px; }
.qd-back .dv { margin-top: 14px; }
.qd-back .addr { margin-top: 16px; font-size: 11.5px; line-height: 18px; color: #fff; }
.qd-back .reach { margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 12px; font-size: 11.5px; line-height: 18px; color: #fff; }
.qd-back .reach i { width: 5px; height: 5px; background: ${C.goldLight}; transform: rotate(45deg); }
.qd-back .web { margin-top: 8px; font-size: 11.5px; line-height: 18px; color: #fff; }
.qd-back .web.id { margin-top: 2px; color: ${C.slate}; }
`;

const WELCOME = `
.qd-letter { display: flex; gap: 46px; align-items: stretch; }
.qd-letter .body { flex: 1; min-width: 0; }
.qd-letter .body p { font-size: 13.3px; line-height: 1.7; text-align: justify; margin: 0 0 11px; color: ${C.ink}; }
.qd-letter .body p .dc { float: left; font-family: ${FONT_SERIF}; font-size: 46px; line-height: 40px; color: ${C.teal}; font-weight: 600; padding: 3px 7px 0 0; }
.qd-letter .sign { border-top: 1px solid ${C.rule}; margin-top: 14px; padding-top: 14px; }
.qd-letter .sign .nm { font-family: ${FONT_SERIF}; font-style: italic; font-size: 19px; color: ${C.navy}; line-height: 26px; }
.qd-letter .sign .lc { margin-top: 3px; font-size: 9.5px; letter-spacing: 0.24em; color: ${C.muted}; text-transform: uppercase; }
.qd-toc { flex: none; width: 264px; border: 1px solid ${C.rule}; background: ${C.panel}; padding: 18px 18px 20px; margin-top: 0; }
.qd-toc .t { text-align: center; font-size: 10.5px; font-weight: 700; letter-spacing: 0.24em; color: ${C.teal}; text-transform: uppercase; padding: 0 0 9px 0.24em; border-bottom: 1px solid ${C.rule}; margin-bottom: 8px; }
.qd-toc-row { display: flex; align-items: baseline; font-size: 12.6px; color: ${C.ink}; padding: 5px 0; line-height: 18px; }
.qd-toc-row .rn { flex: none; width: 40px; font-family: ${FONT_SERIF}; font-size: 12.5px; color: ${C.teal}; }
.qd-toc-row .tt { flex: none; max-width: 150px; }
.qd-toc-row .dots { flex: 1; border-bottom: 1px dotted ${C.rule}; margin: 0 5px 3px; min-width: 10px; }
.qd-toc-row .pg { flex: none; font-family: ${FONT_SERIF}; font-size: 13px; color: ${C.navy}; }
.qd-toc-row.sub { padding: 3px 0; font-size: 12px; color: ${C.muted}; }
.qd-toc-row.sub .rn { width: 58px; }
.qd-toc .meta { margin-top: 12px; padding-top: 12px; text-align: center; font-size: 10.6px; line-height: 18px; color: ${C.muted}; position: relative; }
.qd-toc .meta::before { content: ''; position: absolute; left: 14%; right: 14%; top: 0; height: 1px; background: linear-gradient(90deg, transparent, ${C.gold}, transparent); }
.qd-scene { margin-top: auto; padding-top: 30px; text-align: center; }
.qd-scene .cap { font-family: ${FONT_SERIF}; font-style: italic; font-size: 12px; color: ${C.muted}; margin-top: 18px; padding-bottom: 10px; }
`;

export const DOC_CSS = [BASE, COVER, WELCOME, JOURNEY_CSS, OFFER_CSS].join('\n');
