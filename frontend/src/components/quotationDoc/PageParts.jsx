import React from 'react';
import { BottomOrnament, FooterFlourishLeft, FooterFlourishRight, HeaderLotus, TopOrnament } from './art';
import { toDocumentHtml } from '../../utils/richText';

/** The three frame lines and the flourish at the top and bottom, behind everything on a page. */
export const Frame = ({ cover = false }) => {
  const variant = cover ? 'cover' : undefined;
  return (
    <div className={`qd-frame${cover ? ' is-cover' : ''}`} aria-hidden="true">
      <i className="qd-fr1" />
      <i className="qd-fr2" />
      <i className="qd-fr3" />
      <div className="qd-fr-top"><span className="qd-mask" /><TopOrnament variant={variant} width={94} height={18} style={{ left: 19, top: 3 }} /></div>
      <div className="qd-fr-bottom"><span className="qd-mask" /><BottomOrnament variant={variant} width={94} height={18} style={{ left: 19, top: 3 }} /></div>
    </div>
  );
};

/** The company name on the left and what the page is about on the right, over a hairline with a diamond. */
export const RunningHeader = ({ brand, label }) => (
  <div className="qd-head">
    <div className="qd-head-row">
      {/* two sides of equal width, so the emblem is exactly in the middle of the page whatever the two texts say */}
      <span className="qd-head-side"><span className="qd-head-brand">{brand}</span><span className="gl" /></span>
      <span className="qd-head-mid"><HeaderLotus width={22} height={13} /></span>
      <span className="qd-head-side"><span className="gr" /><span className="qd-head-label">{label}</span></span>
    </div>
    <div className="qd-head-rule"><i className="s l" /><i className="c" /><i className="s r" /></div>
  </div>
);

/** The page number sits in a ring; it is filled in once the pages are known (see finalize.js), so it is empty in the markup. */
export const PageFooter = ({ brand, label }) => (
  <div className="qd-foot">
    <div className="qd-foot-rule"><i className="s l" /><i className="c" /><i className="s r" /></div>
    <div className={`qd-foot-row${Math.max(String(brand).length, String(label).length) > 22 ? ' is-compact' : ''}`}>
      {/* two sides of equal width, so the page number is exactly in the middle of the page */}
      <span className="qd-foot-side"><span className="qd-foot-brand">{brand}</span><FooterFlourishLeft className="qd-foot-flour" width={46} height={8} /></span>
      <span className="qd-foot-num"><span data-pageno="" /></span>
      <span className="qd-foot-side"><FooterFlourishRight className="qd-foot-flour" width={46} height={8} /><span className="qd-foot-label">{label}</span></span>
    </div>
  </div>
);

/** A page of the document: the frame, the running header, the flowing content and the footer. */
export const Page = ({ id, model, header, children, className = '', flowClass = '', fixed = false }) => (
  <div className={`quotation-page qd-page ${className}${fixed ? ' is-fixed' : ''}`} id={id} data-qd-page="">
    <Frame />
    <div className="qd-inner">
      <RunningHeader brand={model.brand} label={header} />
      <div className={`quotation-flow qd-flow ${flowClass}`}>{children}</div>
      <PageFooter brand={model.brand} label={model.footerLabel} />
    </div>
  </div>
);

/** A navy plate with pointed ends between two hairlines, each with a diamond. Its own block so the PDF may move it to the next sheet. */
export const SectionBanner = ({ children, keep = true, tight = false, ...rest }) => (
  <div className={`${keep ? 'quotation-keep qd-keepnext ' : ''}qd-banner${tight ? ' is-tight' : ''}`} {...rest}>
    <span className="ln" />
    <span className="dm" />
    <span className="plate"><i className="tip l" /><span className="txt">{children}</span><i className="tip r" /></span>
    <span className="dm" />
    <span className="ln" />
  </div>
);

/** The beige band that opens a numbered section: its number, its title, a line about it and a small drawing. */
export const IntroBand = ({ numeral, title, text, art, section }) => (
  <div className="quotation-keep qd-keepnext qd-band" data-section={section}>
    <span className="num">{numeral}</span>
    <div className="tx">
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
    {art && <span className="art">{art}</span>}
  </div>
);

/** A box with a numbered (or ticked) title and the lines of a list under it. */
export const Panel = ({ badge, title, icon, children, keep = true, className = '', style }) => (
  <div className={`${keep ? 'quotation-keep ' : ''}qd-panel ${className}`} style={style}>
    <div className="qd-panel-head">
      {typeof badge === 'object' && badge !== null ? <span className="badge-art">{badge}</span> : <span className="badge">{badge}</span>}
      <span className="ttl">{title}</span>
      {icon && <span className="ico">{icon}</span>}
    </div>
    <div className="qd-panel-body">{children}</div>
  </div>
);

const CHUNK = 14; // the most lines one box holds: a very long list continues in further boxes, which can go on the next page

/** A list in a box, or in as many boxes ("... (continued)") as it needs. `columns` 2 holds twice as many lines in each. */
export const ListBoxes = ({ badge, title, icon, items, columns = 1, solid = false }) => {
  const size = CHUNK * columns;
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => (
    <Panel key={i} badge={badge} title={i ? `${title} (continued)` : title} icon={icon} style={{ marginBottom: 14 }}>
      <DiamondList items={items.slice(i * size, (i + 1) * size)} columns={columns} solid={solid} />
    </Panel>
  ));
};

/** One line of formatted text (kept as typed: bold, colour, highlight). */
export const RichLine = ({ html }) => <span className="qd-rich qd-line" dangerouslySetInnerHTML={{ __html: toDocumentHtml(html) }} />;

/** A list with the document's diamonds. `items` are typed texts. */
export const DiamondList = ({ items, solid = false, columns = 1 }) => (
  <ul className={`qd-list${solid ? ' is-solid' : ''}${columns === 2 ? ' cols2' : ''}`}>
    {items.map((item, i) => <li key={i}><RichLine html={item} /></li>)}
  </ul>
);
