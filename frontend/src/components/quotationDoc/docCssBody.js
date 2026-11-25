// The stylesheet of the pages that carry the trip itself: the route, the overview, the list of days and the day cards.
import { COLORS as C, FONT_SERIF } from './tokens';

export const JOURNEY_CSS = `
/* ---- the route (in place of a map) and the overview table ---- */
.qd-route { position: relative; border: 1px solid ${C.rule}; background: ${C.panel}; padding: 4px; margin: 0 0 18px; }
.qd-route-in { border: 1px solid ${C.rule}; background: linear-gradient(180deg, #fffdf8, #f8f1de); padding: 22px 26px 18px; min-height: 150px; position: relative; }
.qd-route .cap { font-size: 9.5px; font-weight: 700; letter-spacing: 0.22em; color: ${C.teal}; text-transform: uppercase; margin-bottom: 16px; }
.qd-route .compass { position: absolute; right: 18px; top: 12px; }
.qd-route .row { display: flex; align-items: flex-start; justify-content: center; margin-bottom: 16px; }
.qd-route .row:last-child { margin-bottom: 0; }
.qd-stop { flex: 0 0 25%; min-width: 0; text-align: center; position: relative; }
.qd-stop .dot { position: relative; z-index: 1; width: 32px; height: 32px; margin: 0 auto; border-radius: 50%; background: ${C.navy}; border: 2px solid ${C.cream}; box-shadow: 0 0 0 1px ${C.gold}; color: #fff; font-size: 13px; font-weight: 700; line-height: 28px; }
.qd-stop .ln { position: absolute; top: 15px; left: calc(50% + 20px); right: calc(-50% + 20px); border-top: 2px dashed ${C.goldLight}; }
.qd-stop .nm { margin-top: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.navy}; padding: 0 4px; line-height: 15px; }
.qd-stop .nt { margin-top: 2px; font-size: 10.5px; color: ${C.muted}; }
.qd-facts { margin: 0 0 10px; display: flex; align-items: flex-start; gap: 10px; font-size: 12.2px; line-height: 1.5; color: ${C.muted}; }
.qd-facts b { color: ${C.navy}; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
.qd-facts .ic { flex: none; width: 21px; height: 21px; margin-top: -1px; }
table.qd-table { width: 100%; border-collapse: collapse; margin: 0 0 14px; background: ${C.panel}; }
table.qd-table th { background: ${C.navy}; color: #fff; font-size: 10px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; padding: 12px 8px; text-align: center; border: 1px solid ${C.navy}; }
table.qd-table td { border: 1px solid ${C.rule}; padding: 12px 12px; font-size: 12.6px; color: ${C.ink}; line-height: 1.4; }
table.qd-table td.c { text-align: center; }
table.qd-table tr.total td { background: ${C.band}; font-weight: 700; }

/* ---- the shape of the journey: a list of the days ---- */
.qd-shape { display: flex; align-items: stretch; margin: 0; }
.qd-shape .rail { flex: none; width: 52px; display: flex; flex-direction: column; align-items: center; }
.qd-shape .circle { flex: none; width: 50px; height: 50px; border-radius: 50%; background: ${C.navy}; border: 2px solid ${C.cream}; box-shadow: 0 0 0 1.5px ${C.gold}; color: ${C.goldLight}; font-family: ${FONT_SERIF}; font-size: 17px; line-height: 46px; text-align: center; margin: 0; }
.qd-shape .dash { flex: 1; width: 0; border-left: 2px dashed ${C.teal}; margin: 5px 0 5px 0; min-height: 14px; }
.qd-shape.last .dash { visibility: hidden; }
.qd-shape .card { flex: 1; margin: 0 0 12px 24px; display: flex; align-items: center; background: ${C.band}; border: 1px solid ${C.rule}; border-left: 3px solid ${C.teal}; padding: 9px 14px 9px 15px; min-height: 56px; }
.qd-shape .main { flex: 1; min-width: 0; }
.qd-shape .when { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; color: ${C.muted}; text-transform: uppercase; margin-right: 8px; }
.qd-shape .place { font-family: ${FONT_SERIF}; font-size: 15.5px; font-weight: 600; color: ${C.navy}; line-height: 1.25; }
.qd-shape .blurb { margin-top: 3px; font-size: 11.8px; color: ${C.ink}; line-height: 1.4; }
.qd-shape .night { flex: none; width: 104px; border-left: 1px solid ${C.rule}; margin: 0 16px; padding: 2px 0 2px 0; text-align: center; font-size: 8.5px; font-weight: 700; letter-spacing: 0.22em; color: ${C.muted}; text-transform: uppercase; }
.qd-shape .night b { display: block; margin-top: 3px; font-size: 11.5px; letter-spacing: 0.02em; color: ${C.teal}; text-transform: none; }
.qd-shape .map { flex: none; border: 1px solid ${C.gold}; color: ${C.gold}; font-size: 9px; font-weight: 700; letter-spacing: 0.18em; padding: 5px 9px; text-decoration: none; background: ${C.panel}; line-height: 14px; white-space: nowrap; }

/* ---- a day: a navy band with a ribbon, a drawing, and rows of what happens ---- */
.qd-day { position: relative; margin: 9px 0 0; }
.qd-days-flow > .qd-day:first-child { margin-top: -14px; }
.qd-day-band { position: relative; display: flex; height: 83px; background: ${C.navy}; border-bottom: 4px solid ${C.gold}; padding-left: 87px; }
.qd-day-ribbon { position: absolute; left: 16px; top: -9px; width: 71px; z-index: 2; }
.qd-day-ribbon .body { height: 98px; background: linear-gradient(180deg, #11909b 0%, #0b6b76 100%); color: #fff; text-align: center; padding-top: 13px; }
.qd-day-ribbon .tip { width: 0; height: 0; border-style: solid; border-width: 20px 35.5px 0 35.5px; border-color: #0b6b76 transparent transparent transparent; }
.qd-day-ribbon .d { font-size: 10px; font-weight: 500; letter-spacing: 0.24em; padding-left: 0.24em; line-height: 14px; opacity: 0.95; }
.qd-day-ribbon .n { font-family: ${FONT_SERIF}; font-size: 31px; font-weight: 400; line-height: 38px; }
.qd-day-ribbon .lo { margin-top: 3px; opacity: 0.8; }
.qd-day-head { flex: 1; min-width: 0; padding: 10px 14px 0 17px; display: flex; flex-direction: column; justify-content: center; }
.qd-day-head .dt { font-family: ${FONT_SERIF}; font-size: 15px; font-weight: 400; letter-spacing: 0.05em; text-transform: uppercase; color: #fff; line-height: 20px; }
.qd-day-head .ti { font-family: ${FONT_SERIF}; font-size: 18.5px; font-weight: 500; color: ${C.goldLight}; line-height: 24px; margin-top: 1px; }
.qd-day-head .su { margin-top: 1px; font-size: 11.5px; letter-spacing: 0.05em; color: ${C.goldLight}; line-height: 16px; }
.qd-day-over { flex: none; width: 168px; border-left: 1px solid ${C.navyLine}; padding: 0 12px 0 17px; display: flex; flex-direction: column; justify-content: center; }
.qd-day-over .k { font-size: 8.5px; font-weight: 700; letter-spacing: 0.22em; color: ${C.goldLight}; text-transform: uppercase; line-height: 12px; }
.qd-day-over .v { margin-top: 5px; font-family: ${FONT_SERIF}; font-size: 14px; color: #fff; line-height: 18px; }
.qd-day-body { display: flex; border: 1px solid ${C.rule}; border-top: 0; background: ${C.panel}; }
.qd-day-art { flex: none; width: 102px; display: flex; align-items: center; justify-content: center; border-right: 1px solid ${C.rule}; padding: 18px 0; }
.qd-day-rows { flex: 1; min-width: 0; background: #fffaf0; }
.qd-day-row { display: flex; padding: 6px 12px 6px 17px; border-top: 1px dashed ${C.rule}; }
.qd-day-row:first-child { border-top: 0; }
.qd-day-row .lb { flex: none; width: 151px; display: flex; align-items: flex-start; gap: 10px; padding-top: 1px; font-size: 11.2px; font-weight: 700; letter-spacing: 0.16em; color: ${C.teal}; text-transform: uppercase; line-height: 18px; }
.qd-day-row .lb svg { flex: none; margin-top: 2px; }
.qd-day-row .bl { flex: 1; min-width: 0; }
.qd-day-row.nolabel .bl { padding-left: 4px; }
.qd-day-row ul { list-style: none; margin: 0; padding: 0; }
.qd-day-row li { position: relative; padding-left: 15px; font-size: 12.3px; line-height: 18.6px; color: ${C.ink}; margin: 0; }
.qd-day-row li::before { content: ''; position: absolute; left: 1px; top: 7px; width: 5px; height: 5px; background: ${C.gold}; transform: rotate(45deg); }
.qd-day-row ul.two { column-count: 2; column-gap: 16px; }
.qd-day-row ul.two li { break-inside: avoid; }
.qd-day-photos { padding: 8px 12px 10px 17px; border-top: 1px dashed ${C.rule}; background: #fffaf0; }
.qd-callout { display: flex; align-items: flex-start; border: 1px solid ${C.rule}; border-radius: 14px; background: ${C.panel}; padding: 14px 16px; margin: 9px 0 0; }
.qd-callout .ic { flex: none; width: 52px; padding-right: 14px; margin-right: 14px; border-right: 1px solid ${C.rule}; display: flex; align-items: center; justify-content: center; align-self: stretch; }
.qd-callout .ti { font-family: ${FONT_SERIF}; font-size: 16px; font-weight: 600; color: ${C.navy}; line-height: 22px; }
.qd-callout .tx { margin-top: 3px; font-size: 12.3px; line-height: 1.5; color: ${C.ink}; }
.qd-why { display: flex; align-items: center; border: 1px solid ${C.rule}; border-left: 3px solid ${C.gold}; background: ${C.panel}; padding: 11px 16px 11px 14px; margin: 9px 0 0; }
.qd-why .k { flex: none; width: 82px; font-size: 9.5px; font-weight: 700; letter-spacing: 0.2em; color: ${C.teal}; text-transform: uppercase; line-height: 14px; }
.qd-end { margin: 14px 0 0; padding: 8px 16px; text-align: center; border: 1.5px dashed ${C.rule}; background: ${C.panel}; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.navy}; }
.qd-why .t { flex: 1; font-family: ${FONT_SERIF}; font-style: italic; font-size: 12.8px; line-height: 1.5; color: ${C.ink}; }
`;
