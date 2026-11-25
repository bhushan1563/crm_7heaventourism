import React from 'react';
import { Page, SectionBanner } from '../PageParts';
import { SkylineGeneric } from '../art';
import { plural, rangeText, welcomeParagraphs } from '../model';

/** The contents: a row for each numbered section, and under "Day by Day" a row for each stretch of days (filled in once the pages are known). */
const Contents = ({ sections, model }) => (
  <aside className="qd-toc">
    <div className="t">Contents</div>
    {sections.map((s) => (
      <React.Fragment key={s.key}>
        <div className="qd-toc-row">
          <span className="rn">{s.numeral}</span>
          <span className="tt">{s.title}</span>
          <span className="dots" />
          <span className="pg" data-toc={s.key} />
        </div>
        {s.key === 'days' && <div data-toc-days="" />}
      </React.Fragment>
    ))}
    <div className="meta">
      {model.tripId && <div>Trip ID {model.tripId}</div>}
      {(model.nights > 0 || model.days > 0) && <div>{model.nights && model.days ? `${plural(model.nights, 'Night')} & ${plural(model.days, 'Day')}` : plural(model.days || model.nights, model.days ? 'Day' : 'Night')}</div>}
      {model.start && <div>{`${rangeText(model.start, model.end)} ${(model.end || model.start).getUTCFullYear()}`}</div>}
    </div>
  </aside>
);

/** "A note before you travel": the letter, the contents, and the scene at the foot of the page. */
export const WelcomePage = ({ model, sections, id }) => {
  const paras = welcomeParagraphs(model);
  return (
    <Page id={id} model={model} header="Welcome" className="qd-welcome">
      <SectionBanner>A Note Before You Travel</SectionBanner>
      <div className="quotation-keep qd-letter">
        <div className="body">
          {paras.map((text, i) => <p key={i}>{i === 0 ? <><span className="dc">{text.charAt(0)}</span>{text.slice(1)}</> : text}</p>)}
          <div className="sign">
            <div className="nm">{model.company.name}</div>
            {model.locality && <div className="lc">{model.locality}</div>}
          </div>
        </div>
        <Contents sections={sections} model={model} />
      </div>
      <div className="quotation-keep qd-scene">
        <SkylineGeneric width={660} height={153} />
        <div className="cap">{model.place ? `Welcome to ${model.place}` : 'Welcome'}</div>
      </div>
    </Page>
  );
};
