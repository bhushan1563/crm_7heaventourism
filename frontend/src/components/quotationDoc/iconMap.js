// Which drawing goes with a row label or a day: chosen from the words the text uses, so every day gets a fitting one.
import { DayCar, DayDeparture, DayFerry, DayPagoda, DayPagodaWaves, DayPlaneTower, DaySwing, DayTruck, DayVolcano, IconCamera, IconCar, IconCutlery, IconLotus, IconMoon, IconPlane, IconSailboat, IconShrine, IconSunrise, IconTag, IconWaves } from './art';

const ROW_ICONS = [
  [/arriv|landing|flight|airport|depart/, IconPlane],
  [/transfer|drive|vehicle|pick|drop|road|cab|coach|bus|train/, IconCar],
  [/welcome|included|inclusion|garland|check.?in/, IconLotus],
  [/evening|night|overnight|dinner|sunset/, IconMoon],
  [/lunch|breakfast|meal|food|dining/, IconCutlery],
  [/early|morning|sunrise|full day/, IconSunrise],
  [/mid|late|forenoon|noon/, IconWaves],
  [/afternoon|temple|visit|fort|palace|heritage/, IconShrine],
  [/cruise|boat|island|ferry|sail|beach|snorkel|dive/, IconSailboat],
  [/sightsee|photo|view|tour|explore/, IconCamera]
];

/** The small drawing in front of a row label ("Morning", "Transfer" ...). */
export const iconForLabel = (label) => {
  const text = String(label || '').toLowerCase();
  for (const [test, Icon] of ROW_ICONS) if (test.test(text)) return Icon;
  return IconTag;
};

const DAY_ICONS = [
  [/depart|farewell|fly back|flight home|return journey|onward/, DayDeparture],
  [/arriv|welcome|landing|pickup|airport/, DayPlaneTower],
  [/swing|adventure|atv|raft|zip|bungee|trek|quad|paraglid|jet ?ski/, DaySwing],
  [/volcano|mountain|hill|waterfall|terrace|safari|park|zoo|valley|glacier|desert|canyon/, DayVolcano],
  [/temple|pura|mandir|fort|palace|heritage|monument|church|mosque|shrine|cathedral|old town/, DayPagoda],
  [/cruise|boat|ferry|island|speedboat|sea|snorkel|dive|beach|bay|lake|river/, DayFerry],
  [/water ?sports?|waves?|surf/, DayPagodaWaves],
  [/transfer|leisure|relax|free day|at ease|city tour|drive/, DayCar]
];
const FALLBACK = [DayPagoda, DayFerry, DayVolcano, DayCar, DayTruck, DayPagodaWaves];

/** The drawing in the left column of a day: from the words of its title, else a neutral one that varies from day to day. */
export const iconForDay = (title, index = 0) => {
  const text = String(title || '').toLowerCase();
  for (const [test, Icon] of DAY_ICONS) if (test.test(text)) return Icon;
  return FALLBACK[index % FALLBACK.length];
};
