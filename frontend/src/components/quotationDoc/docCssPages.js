// The stylesheet of the pages that carry the offer: hotels and options, the pricing tables, flights, the visa and land service bodies,
// the terms and the acceptance.
import { COLORS as C, FONT_SERIF } from './tokens';

export const OFFER_CSS = `
/* ---- hotels ---- */
.qd-hotel { border: 1px solid ${C.rule}; background: ${C.panel}; margin: 0 0 12px; overflow: hidden; }
/* A photo is never cropped: it keeps its own shape (a very tall one is fitted whole inside the frame, on the band colour). */
.qd-hotel .strip { display: flex; justify-content: center; gap: 6px; padding: 10px 16px 0; }
.qd-hotel .strip img { display: block; flex: none; border-radius: 2px; }
.qd-hotel .row { display: flex; gap: 14px; padding: 12px 16px 14px; }
.qd-hotel .ph { flex: none; }
.qd-hotel .ph img { display: block; border-radius: 2px; }
.qd-hotel .main { flex: 1; min-width: 0; }
.qd-hotel.is-side .facts { grid-template-columns: 1fr 1fr; }
.qd-hotel .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.qd-hotel .nm { font-family: ${FONT_SERIF}; font-size: 16px; font-weight: 600; color: ${C.navy}; line-height: 1.25; }
.qd-hotel .bk { font-size: 11px; color: ${C.navy}; margin-top: 2px; }
.qd-hotel .rc { font-size: 11.5px; font-weight: 600; color: ${C.teal}; margin-top: 2px; }
.qd-hotel .ad { font-size: 11px; color: ${C.muted}; margin-top: 3px; }
.qd-hotel .star { flex: none; font-size: 10px; font-weight: 700; color: #8a6a1c; background: #fff4d6; border: 1px solid ${C.goldPale}; padding: 3px 9px; letter-spacing: 0.04em; }
.qd-hotel .facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px 14px; margin-top: 9px; padding-top: 8px; border-top: 1px dashed ${C.rule}; font-size: 11.2px; color: ${C.ink}; }
.qd-hotel .facts b { color: ${C.navy}; font-weight: 700; }
.qd-hotel .line { margin-top: 7px; font-size: 10.8px; color: ${C.muted}; line-height: 1.45; }
.qd-hotel .line b { color: ${C.navy}; }
table.qd-rates { width: 100%; border-collapse: collapse; margin-top: 9px; }
table.qd-rates th { background: ${C.band}; border: 1px solid ${C.rule}; padding: 5px 7px; font-size: 8.5px; letter-spacing: 0.12em; text-transform: uppercase; color: ${C.muted}; font-weight: 700; text-align: right; white-space: nowrap; }
table.qd-rates th:first-child { text-align: left; }
table.qd-rates td { border: 1px solid ${C.rule}; padding: 5px 7px; font-size: 11px; color: ${C.ink}; text-align: right; white-space: nowrap; }
table.qd-rates td:first-child { text-align: left; font-weight: 700; white-space: normal; }
table.qd-rates tfoot td { background: ${C.band}; font-weight: 700; }
.qd-sub { font-size: 11px; font-weight: 700; letter-spacing: 0.18em; color: ${C.teal}; text-transform: uppercase; margin: 2px 0 10px; }
.qd-note { font-size: 11.4px; color: ${C.muted}; line-height: 1.5; margin: 0 0 12px; }

/* ---- hotel options ---- */
.qd-opt-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: ${C.navy}; color: #fff; padding: 9px 16px; border-bottom: 3px solid ${C.gold}; }
.qd-opt-head .k { font-size: 8.5px; font-weight: 700; letter-spacing: 0.22em; color: ${C.goldLight}; text-transform: uppercase; }
.qd-opt-head .n { font-family: ${FONT_SERIF}; font-size: 16px; font-weight: 500; line-height: 1.2; }
.qd-opt-head .rec { background: ${C.gold}; color: #fff; font-size: 8.5px; font-weight: 700; letter-spacing: 0.16em; padding: 3px 9px; }
.qd-opt { border: 1px solid ${C.rule}; border-top: 0; background: ${C.panel}; }
.qd-opt.is-rec { border-color: ${C.gold}; }
.qd-opt .qd-hotel { border: 0; border-top: 1px solid ${C.rule}; margin: 0; }
.qd-opt .qd-hotel:first-child { border-top: 0; }
.qd-opt-total { display: flex; align-items: center; justify-content: space-between; background: ${C.band}; border-top: 1px solid ${C.rule}; padding: 10px 16px; }
.qd-opt-total .k { font-size: 10.5px; font-weight: 700; letter-spacing: 0.16em; color: ${C.navy}; text-transform: uppercase; }
.qd-opt-total .v { font-family: ${FONT_SERIF}; font-size: 18px; font-weight: 600; color: ${C.navy}; white-space: nowrap; }
.qd-opt .sm { text-align: right; font-size: 10.5px; color: ${C.muted}; padding: 0 16px 8px; background: ${C.band}; }
.qd-cmp { display: grid; gap: 10px; margin: 0 0 14px; }
.qd-cmp .col { border: 1px solid ${C.rule}; background: ${C.panel}; }
.qd-cmp .col.rec { border: 2px solid ${C.gold}; }
.qd-cmp .hd { background: ${C.navy}; color: #fff; font-family: ${FONT_SERIF}; font-size: 13px; padding: 7px 10px; }
.qd-cmp .pr { padding: 8px 10px; border-bottom: 1px solid ${C.rule}; background: ${C.band}; }
.qd-cmp .pr b { display: block; font-family: ${FONT_SERIF}; font-size: 17px; color: ${C.navy}; }
.qd-cmp .pr span { font-size: 10px; color: ${C.muted}; }
.qd-cmp .hs { padding: 8px 10px; font-size: 11px; line-height: 1.4; }
.qd-cmp .hs .nm { font-family: ${FONT_SERIF}; font-weight: 600; font-size: 12.5px; color: ${C.navy}; }

/* ---- price tables ---- */
table.qd-ptable { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 6px 0 0; background: ${C.panel}; }
table.qd-ptable th.opt { background: ${C.band}; border: 1px solid ${C.rule}; border-bottom: 0; text-align: left; font-family: ${FONT_SERIF}; font-size: 14.5px; font-weight: 600; color: ${C.navy}; padding: 9px 11px; }
table.qd-ptable th { background: ${C.navy}; color: #fff; border: 1px solid ${C.navy}; padding: 8px 6px; font-size: 9px; letter-spacing: 0.14em; font-weight: 600; text-transform: uppercase; text-align: center; }
table.qd-ptable th.l { text-align: left; padding-left: 11px; }
table.qd-ptable td { border: 1px solid ${C.rule}; padding: 6px 10px; font-size: 12px; color: ${C.ink}; text-align: right; height: 28px; }
table.qd-ptable td.l { text-align: left; font-weight: 700; color: ${C.navy}; }
table.qd-ptable td.c { text-align: center; }
table.qd-ptable td.f { font-weight: 700; color: ${C.navy}; }
table.qd-ptable tr.grand td { background: ${C.band}; border-top: 2px solid ${C.navy}; font-weight: 700; color: ${C.navy}; padding: 8px 11px; }
table.qd-ptable td.gv { background: #f6e7b4; font-family: ${FONT_SERIF}; font-size: 14.5px; font-weight: 600; white-space: nowrap; }
.qd-pricelist { border: 1px solid ${C.rule}; background: ${C.panel}; padding: 14px 18px; margin: 0 0 14px; }
.qd-pricelist h3 { margin: 0 0 8px; font-family: ${FONT_SERIF}; font-size: 16px; font-weight: 600; color: ${C.navy}; }
.qd-pricelist .ln { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; font-size: 12px; padding: 4px 0; border-bottom: 1px dotted ${C.rule}; }
.qd-pricelist .ln:last-of-type { border-bottom: 0; }
.qd-pricelist .ln b { color: ${C.navy}; font-weight: 600; }
.qd-pricelist .ln span { color: ${C.teal}; font-weight: 700; text-align: right; }
.qd-pricelist .tot { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.qd-pricelist .chip { background: #f6e7b4; border: 1px solid ${C.goldPale}; padding: 6px 14px; font-size: 12.5px; font-weight: 700; color: ${C.navy}; }
.qd-pricelist .gt { font-size: 12px; font-weight: 700; color: ${C.teal}; border: 1px solid ${C.teal}; padding: 5px 12px; }
.qd-pricelist .nt { margin-top: 8px; font-size: 10.5px; color: ${C.muted}; font-style: italic; }

/* ---- flights ---- */
.qd-flight { border: 1px solid ${C.rule}; background: ${C.panel}; margin: 0 0 10px; }
.qd-flight .hd { display: flex; justify-content: space-between; align-items: center; gap: 8px; background: ${C.band}; border-bottom: 1px solid ${C.rule}; padding: 8px 14px; font-size: 11px; color: ${C.muted}; }
.qd-flight .hd b { color: ${C.navy}; }
.qd-flight .hd .rt { color: ${C.teal}; font-weight: 700; }
.qd-flight .grid { display: grid; grid-template-columns: 1.2fr 2fr 1fr 2fr; align-items: center; gap: 8px; padding: 12px 14px; }
.qd-flight .al { font-family: ${FONT_SERIF}; font-weight: 600; font-size: 14px; color: ${C.navy}; }
.qd-flight .fn { font-size: 11px; font-weight: 700; color: ${C.muted}; }
.qd-flight .ap { font-size: 11px; color: ${C.muted}; }
.qd-flight .tm { font-family: ${FONT_SERIF}; font-size: 18px; font-weight: 600; color: ${C.navy}; }
.qd-flight .mid { text-align: center; font-size: 9.5px; color: ${C.muted}; }
.qd-flight .mid .bar { display: flex; align-items: center; gap: 4px; margin: 2px 0; color: ${C.gold}; }
.qd-flight .mid .bar i { flex: 1; height: 1px; background: ${C.rule}; }
.qd-flight .mid .st { color: ${C.teal}; font-weight: 700; }
.qd-flight .bg { display: flex; gap: 18px; padding: 8px 14px; border-top: 1px dashed ${C.rule}; font-size: 10.8px; color: ${C.muted}; }
.qd-flight .bg b { color: ${C.navy}; }
.qd-shot { margin: 0 0 12px; text-align: center; }
.qd-shot img { display: block; margin: 0 auto; border: 1px solid ${C.rule}; background: #fff; }
.qd-shot figcaption { margin-top: 3px; font-size: 10px; color: ${C.muted}; font-style: italic; }
.qd-ticket { border: 1px solid ${C.teal}; background: ${C.panel}; padding: 12px 16px; }
.qd-ticket b { color: ${C.teal}; font-size: 12px; }
.qd-ticket .tx { margin-top: 4px; font-size: 11.5px; color: ${C.ink}; line-height: 1.5; }

/* ---- visa and land service ---- */
.qd-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 0 0 14px; align-items: stretch; }
.qd-grid2 > .qd-panel { height: 100%; }
.qd-grid2.one { grid-template-columns: 1fr; }
.qd-kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 6px 18px; font-size: 12px; color: ${C.ink}; }
.qd-kv b { color: ${C.navy}; }
.qd-check { list-style: none; margin: 0; padding: 0; }
.qd-check li { display: flex; gap: 8px; font-size: 12.2px; line-height: 1.5; margin: 0 0 6px; }
.qd-check li i { flex: none; font-style: normal; font-weight: 700; color: ${C.teal}; }
table.qd-table td.r { text-align: right; }
.qd-total { display: flex; justify-content: space-between; align-items: center; background: ${C.band}; border: 1px solid ${C.rule}; border-top: 2px solid ${C.navy}; padding: 10px 14px; margin: -14px 0 14px; font-size: 12.5px; font-weight: 700; color: ${C.navy}; }
.qd-total .v { font-family: ${FONT_SERIF}; font-size: 16px; }

/* ---- the overview of a library itinerary ---- */
.qd-gallery { display: flex; justify-content: center; margin: 0 0 12px; }
.qd-gallery > div { width: 100%; align-items: center; }
.qd-overview-text { font-size: 12.8px; line-height: 1.7; color: ${C.ink}; text-align: justify; margin: 0 0 10px; }

/* ---- terms and acceptance ---- */
.qd-accept { margin-top: 6px; }
.qd-sign { display: flex; gap: 34px; padding: 50px 20px 0; }
.qd-sign > div { flex: 1; border-top: 1.5px solid ${C.navy}; padding-top: 7px; }
.qd-sign .k { font-size: 10px; font-weight: 700; letter-spacing: 0.2em; color: ${C.navy}; text-transform: uppercase; }
.qd-sign .d { margin-top: 3px; font-size: 11.2px; color: ${C.muted}; }
.qd-fine { margin: 20px 30px 0; text-align: center; font-size: 11px; line-height: 1.55; color: ${C.muted}; }
.qd-booktext { font-size: 12px; line-height: 1.5; color: ${C.ink}; text-align: left; }
`;
