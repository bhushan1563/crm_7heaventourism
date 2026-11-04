import React, { useState } from 'react';
import { ExternalLink, MapPin, Star } from 'lucide-react';
import { API_ORIGIN } from '../../services/api';
import { LEVEL_HELP, LEVEL_WORDS, mapUrl, ratesText, timeWords } from '../../utils/hotelFinder';
import { starLabel } from '../../utils/hotel';
import './hotelFinder.css';

/** A small coloured dot that says how sure the finder is about a fact (and says it in words too, for people who cannot see colours). */
export const Level = ({ level }) => (level ? <span className={`fh-level fh-level-${level}`} role="img" aria-label={LEVEL_WORDS[level]} title={`${LEVEL_WORDS[level]}. ${LEVEL_HELP[level]}`} /> : null);

const Empty = ({ children = 'Not found on the website' }) => <span className="fh-empty">{children}</span>;

const Picture = ({ image, on, onToggle }) => {
  const [broken, setBroken] = useState(false);
  return (
    <label className={`fh-pic${on ? ' is-on' : ''}${broken ? ' is-broken' : ''}`} title={image.alt || 'Hotel picture'}>
      <img src={`${API_ORIGIN}${image.preview}`} alt={image.alt || 'Hotel picture'} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      <input type="checkbox" checked={on} onChange={() => onToggle(image.url)} aria-label={`Keep this picture${image.alt ? `: ${image.alt}` : ''}`} />
    </label>
  );
};

/**
 * What the finder found, laid out in cards: every fact with a dot for how sure the finder is, the pictures to choose from, where it
 * looked, and what it could not do. `data` is the `data` of a find.
 */
export const FindResult = ({ data, selected, onToggleImage, onSelectAll, onSelectNone }) => {
  const { hotel, fieldInfo = {}, completeness, pages = [], skipped = [], warnings = [] } = data;
  const a = hotel.address || {};
  const level = (key) => fieldInfo[key]?.level;
  const map = mapUrl(hotel.geo);
  const images = hotel.images || [];

  return (
    <div className="fh-result">
      <section className="glass-panel fh-head" aria-label="The hotel">
        <div>
          <h3>{hotel.name || 'Name not found'} <Level level={level('name')} /></h3>
          <p className="fh-head-meta">
            {hotel.propertyType && <span className="fh-chip">{hotel.propertyType}</span>}
            {hotel.starRating && hotel.starRating !== 'Unrated' && <span className="fh-chip"><Star size={12} aria-hidden="true" /> {starLabel(hotel.starRating)}</span>}
            {hotel.guestRating && <span className="fh-chip">{hotel.guestRating.value} / {hotel.guestRating.best}{hotel.guestRating.count ? ` · ${hotel.guestRating.count.toLocaleString('en-IN')} reviews` : ''}</span>}
            {(a.locality || a.country) && <span><MapPin size={13} aria-hidden="true" /> {[a.locality, a.country].filter(Boolean).join(', ')}</span>}
          </p>
          {hotel.tagline && <p className="fh-hint">{hotel.tagline}</p>}
        </div>
        {completeness && (
          <div className="fh-meter" role="group" aria-label="How complete the details are">
            <div className="fh-meter-bar" aria-hidden="true"><span style={{ width: `${completeness.score}%` }} /></div>
            <small>{completeness.score} out of 100 complete{completeness.missing.length ? `. Not found: ${completeness.missing.join(', ')}.` : '.'}</small>
          </div>
        )}
      </section>

      {warnings.length > 0 && (
        <div className="fh-warn" role="status" aria-label="Things to know">
          {warnings.map((w) => <p key={w}>{w}</p>)}
        </div>
      )}

      <div className="fh-legend" aria-label="What the dots mean">
        {['high', 'medium', 'low'].map((l) => <span key={l}><Level level={l} /> {LEVEL_WORDS[l]}</span>)}
      </div>

      <div className="fh-grid">
        <section className="glass-panel fh-card is-wide" aria-label="About the hotel">
          <h4>About</h4>
          {hotel.description ? <p>{hotel.description} <Level level={level('description')} /></p> : <Empty />}
        </section>

        <section className="glass-panel fh-card" aria-label="Contact">
          <h4>Contact</h4>
          <dl className="fh-facts">
            <dt>Phone</dt>
            <dd>{hotel.phones.length ? hotel.phones.map((p, i) => <span key={p.display}>{p.display}{p.note ? ` (${p.note})` : ''} <Level level={p.level || fieldInfo.phones?.[i]?.level} /></span>) : <Empty />}</dd>
            <dt>Email</dt>
            <dd>{hotel.emails.length ? hotel.emails.map((e, i) => <span key={e}>{e} <Level level={fieldInfo.emails?.[i]?.level} /></span>) : <Empty />}</dd>
            <dt>Website</dt>
            <dd>{hotel.website ? <a href={hotel.website} target="_blank" rel="noopener noreferrer">{hotel.website.replace(/^https?:\/\//, '')} <ExternalLink size={12} aria-hidden="true" /></a> : <Empty />}</dd>
            {hotel.social.length > 0 && (
              <>
                <dt>Social</dt>
                <dd>{hotel.social.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.network}</a>)}</dd>
              </>
            )}
          </dl>
        </section>

        <section className="glass-panel fh-card" aria-label="Location">
          <h4>Location</h4>
          <dl className="fh-facts">
            <dt>Address</dt>
            <dd>{a.full ? <span>{a.full} <Level level={fieldInfo.address?.level} /></span> : <Empty />}</dd>
            <dt>City</dt>
            <dd>{a.locality ? <span>{a.locality} <Level level={fieldInfo.addressParts?.locality?.level} /></span> : <Empty />}</dd>
            <dt>Country</dt>
            <dd>{a.country ? <span>{a.country} <Level level={fieldInfo.addressParts?.country?.level} /></span> : <Empty />}</dd>
            <dt>Map</dt>
            <dd>{map ? <a href={map} target="_blank" rel="noopener noreferrer">Open in Google Maps <ExternalLink size={12} aria-hidden="true" /></a> : <Empty />}</dd>
          </dl>
        </section>

        <section className="glass-panel fh-card" aria-label="Stay">
          <h4>Check-in and rooms</h4>
          <dl className="fh-facts">
            <dt>Check-in</dt>
            <dd>{hotel.checkIn ? <span>{timeWords(hotel.checkIn)} <Level level={level('checkIn')} /></span> : <Empty />}</dd>
            <dt>Check-out</dt>
            <dd>{hotel.checkOut ? <span>{timeWords(hotel.checkOut)} <Level level={level('checkOut')} /></span> : <Empty />}</dd>
          </dl>
          <h4 style={{ marginTop: 14 }}>Rooms</h4>
          {hotel.rooms.length ? (
            <ul className="fh-list">{hotel.rooms.map((r) => <li key={r.name}><strong>{r.name}</strong>{r.details ? <><br /><small>{r.details}</small></> : null}</li>)}</ul>
          ) : <Empty />}
        </section>

        <section className="glass-panel fh-card" aria-label="Rates">
          <h4>Rates</h4>
          {hotel.rates ? (
            <>
              <p><strong>{ratesText(hotel.rates)}</strong> <Level level={level('rates')} /></p>
              <ul className="fh-list">{(hotel.rates.lines || []).map((l) => <li key={l.text}>{l.text}</li>)}</ul>
              <p className="fh-hint">{hotel.rates.note}</p>
            </>
          ) : (
            <p><Empty>{hotel.priceLevel ? 'The website only shows a price level, not actual rates.' : 'No rates found on the website.'}</Empty></p>
          )}
        </section>

        <section className="glass-panel fh-card is-wide" aria-label="Amenities">
          <h4>Amenities</h4>
          {hotel.amenities.length ? <ul className="fh-chips">{hotel.amenities.map((x) => <li key={x}>{x}</li>)}</ul> : <Empty />}
        </section>

        {(hotel.policies?.cancellation || hotel.policies?.children || hotel.policies?.pets) && (
          <section className="glass-panel fh-card is-wide" aria-label="Policies">
            <h4>Policies</h4>
            <dl className="fh-facts">
              {hotel.policies.cancellation && <><dt>Cancellation</dt><dd>{hotel.policies.cancellation}</dd></>}
              {hotel.policies.children && <><dt>Children</dt><dd>{hotel.policies.children}</dd></>}
              {hotel.policies.pets && <><dt>Pets</dt><dd>{hotel.policies.pets}</dd></>}
            </dl>
          </section>
        )}

        <section className="glass-panel fh-card is-wide" aria-label="Pictures">
          <h4>Pictures</h4>
          {images.length ? (
            <>
              <p className="fh-hint">
                {selected.size} of {images.length} will be kept when you save.{' '}
                <button type="button" className="fh-link-btn" onClick={onSelectAll}>Select all</button> · <button type="button" className="fh-link-btn" onClick={onSelectNone}>None</button>
              </p>
              <div className="fh-pics">
                {images.map((image) => <Picture key={image.url} image={image} on={selected.has(image.url)} onToggle={onToggleImage} />)}
              </div>
              <p className="fh-hint">These are the website's own pictures. Check that you may use them before they go in a quotation.</p>
            </>
          ) : <Empty>No hotel pictures were found.</Empty>}
        </section>

        <section className="glass-panel fh-card is-wide" aria-label="Where it came from">
          <h4>Where it came from</h4>
          <ul className="fh-list">
            {pages.map((p) => <li key={p.url || p.label}>{p.label}{p.url ? <>: <a href={p.url} target="_blank" rel="noopener noreferrer">{p.title || p.url}</a></> : null}</li>)}
            {skipped.map((s) => <li key={s.url}><small>Not read: {s.url} ({s.reason})</small></li>)}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default FindResult;
