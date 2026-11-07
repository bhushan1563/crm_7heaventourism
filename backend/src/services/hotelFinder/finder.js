import { parseTarget, siteOf } from './addressGuard.js';
import { extractPage, rankPages } from './extract/index.js';
import { completeness, hotelLikeness, isPortal, mergeCandidates } from './merge.js';
import { isPathAllowed, loadRobots } from './robots.js';
import { loadSitemapUrls } from './sitemap.js';
import { readUrl } from './webReader.js';

// The hotel finder: from one address, read the hotel's site (a few well-chosen pages, politely and within a time budget), and give back
// what it says about the hotel, with where each fact came from and how sure it is. It is the only place that decides what to fetch;
// the reading itself is in webReader, the facts are in extract/, the choosing between facts is in merge.

export const FINDER_LIMITS = {
  extraPages: 8, // pages read besides the one that was typed
  budgetMs: 22_000, // for the whole find
  pageTimeoutMs: 7000,
  concurrency: 3,
  pastedChars: 300_000
};

// UTM and other ad-platform tracking parameters — strip them so the page fetch is clean and robots.txt path checks are accurate.
const TRACKING_PARAM = /^(?:utm_|mc_|_ga$|gclid$|gclsrc$|fbclid$|msclkid$|twclid$|li_fat_id$|dclid$)/i;

const cleanStartUrl = (input) => {
  const s = String(input || '').trim();
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
    if ([...u.searchParams.keys()].length === 0) u.search = '';
    return u.toString();
  } catch {
    return s;
  }
};

// A URL path that belongs to a campaign or promotion page rather than the hotel's main content.
const PROMO_PATH = /\/(?:promotions?|deals?|offers?|campaigns?|packages?|specials?|limited[-_]?time|book[-_]?now|book[-_]?online)(?:\/|$)/i;

const fail = (code, message, extra = {}) => ({ ok: false, code, message, canPaste: false, ...extra });

const defaultDeps = { readUrl, loadRobots, loadSitemapUrls };

/** The path and query of an address, as robots.txt rules see them. */
const pathOf = (url) => {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
};

const KIND_LABEL = { start: 'The address you gave', contact: 'Contact page', rooms: 'Rooms page', about: 'About page', facilities: 'Facilities page', rates: 'Rates page', policies: 'Policies page', gallery: 'Gallery page', pasted: 'Pasted text' };

/** Merges what was read into the answer the screens show. */
const assemble = ({ pages, startUrl, site, notes, warnings, started, robotsNote, sitemapFiles, publicUrl, source }) => {
  const candidates = pages.flatMap((p) => p.extraction.candidates);
  const pageKinds = new Map(pages.map((p) => [p.url, p.kind]));
  const { hotel, fieldInfo } = mergeCandidates({ candidates, pageKinds, site, startUrl, publicUrl });
  const words = pages.map((p) => `${p.extraction.page.title} ${p.extraction.page.headings.join(' ')}`).join(' ');
  const hasProperty = candidates.some((c) => c.field === 'propertyType' && c.source !== 'text');
  const likeness = hotelLikeness({ hotel, propertyTypeFound: hasProperty, words });
  const done = completeness(hotel);
  const outWarnings = [...warnings];
  if (isPortal(site)) outWarnings.push('This is a page of a travel portal or social site, not the hotel\'s own website. What it shows is what the portal shows; the hotel\'s own website usually has more and is more reliable.');
  if (pages[0]?.extraction.page.scriptDrawn && done.score < 60) outWarnings.push('This website draws its content with scripts, so only part of it could be read. Open the page in your browser, copy its text and paste it into "Paste the page\'s text" to add more.');
  if (likeness < 2 && done.score > 0) outWarnings.push('This page does not look much like a hotel website (no rooms, check-in times or hotel words were found). Check that the address is the hotel\'s own.');
  if (hotel.rates) outWarnings.push('The rates are as printed on the website. They may be for one room type or a season: check them before quoting a guest.');
  if (!hotel.rates && hotel.priceLevel) outWarnings.push('The website only shows a price level, not actual rates.');
  const failedParts = [...new Set(pages.flatMap((p) => p.extraction.failed))];
  if (failedParts.length) outWarnings.push('Some parts of the page could not be read, so a few details may be missing.');
  return {
    sourceUrl: startUrl,
    site,
    source,
    hotel,
    fieldInfo,
    completeness: done,
    likelyHotel: likeness >= 2,
    pages: pages.map((p) => ({ url: p.url, kind: p.kind, label: KIND_LABEL[p.kind] || 'Page', status: p.status, title: p.extraction.page.title })),
    skipped: notes.skipped,
    warnings: [...new Set(outWarnings)],
    meta: { ms: Date.now() - started, robotsNote, sitemapFiles }
  };
};

/**
 * Finds a hotel's details from the address of its website.
 *
 * @param {string} input   what was typed
 * @param {{ allowPrivate?: boolean, deps?: object, now?: () => number }} [options]  `allowPrivate` and `deps` are for tests and local development only
 * @returns {Promise<{ ok: true, data: object } | { ok: false, code: string, message: string, canPaste: boolean }>}
 */
export const findHotel = async (input, options = {}) => {
  const { allowPrivate = false, deps = {}, budgetMs = FINDER_LIMITS.budgetMs } = options;
  const d = { ...defaultDeps, ...deps };
  const started = Date.now();
  const deadline = started + budgetMs;
  const remaining = () => Math.max(0, deadline - Date.now());
  const readOptions = (extra = {}) => ({ allowPrivate, timeoutMs: Math.min(FINDER_LIMITS.pageTimeoutMs, Math.max(1500, remaining())), ...extra });

  const target = parseTarget(input, { allowPrivate });
  if (!target.ok) return fail(target.code, target.message);

  const isMajorChain = /marriott\.com|hilton\.com|ihg\.com|hyatt\.com|accor\.com/i.test(target.host);

  // 1. What does the site ask of automatic readers?
  const robotsResult = await d.loadRobots(target.origin, readOptions());
  let { robots } = robotsResult;
  if (!isPathAllowed(robots, pathOf(target.url))) {
    const chainNote = isMajorChain ? ` Major hotel chain websites like ${target.host} use anti-bot protection and script-based loading.` : '';
    return fail('ROBOTS_DISALLOWED', `${target.host} asks automatic readers not to read this page (its robots.txt says so), and the finder respects that.${chainNote} You can open the page in your browser, copy its text, and paste it here instead.`, { canPaste: true });
  }

  // 2. The page that was typed.
  const first = await d.readUrl(target.url, readOptions());
  if (!first.ok) {
    const sep = first.message.endsWith('.') ? '' : '.';
    const chainNote = isMajorChain ? `${sep} Major hotel chains like ${target.host} block automated web readers.` : '';
    return fail(first.code, `${first.message}${chainNote}`, { canPaste: ['BLOCKED_BY_SITE', 'TIMEOUT', 'RATE_LIMITED', 'TLS_ERROR', 'SITE_ERROR', 'CONNECTION_LOST', 'NOT_A_PAGE', 'TOO_LARGE', 'CONNECT_FAILED'].includes(first.code) || isMajorChain });
  }
  if (first.blocked) {
    const chainNote = isMajorChain ? ` Hotel chains like ${target.host} block automatic reading.` : '';
    return fail('BLOCKED_BY_SITE', `${target.host} showed a "prove you are not a robot" page instead of the hotel's page.${chainNote} The finder does not try to get past such pages. You can open the page in your browser, copy its text, and paste it here instead.`, { canPaste: true });
  }

  // The page may have sent us to another site (a short link, a chain's own page): from here on the site is where we ended up.
  const finalTarget = parseTarget(first.url, { allowPrivate });
  if (!finalTarget.ok) return fail(finalTarget.code, finalTarget.message);
  const site = siteOf(finalTarget.url);
  const notes = { skipped: [] };
  const warnings = [];
  if (siteOf(target.url) !== site) {
    const again = await d.loadRobots(finalTarget.origin, readOptions());
    robots = again.robots;
    if (!isPathAllowed(robots, pathOf(finalTarget.url))) return fail('ROBOTS_DISALLOWED', `${finalTarget.host} asks automatic readers not to read this page (its robots.txt says so), and the finder respects that. Paste the page's text instead.`, { canPaste: true });
    warnings.push(`The address you gave sent us to ${finalTarget.host}; that is the site that was read.`);
  }
  const publicUrl = (url) => parseTarget(url, { allowPrivate }).ok;

  const startPage = { url: first.url, kind: 'start', status: first.status, extraction: extractPage({ url: first.url, html: first.text }) };
  const pages = [startPage];

  // 3. Which other pages are worth reading (from the links on the page and the sitemap), and only those robots.txt allows.
  const sitemap = remaining() > 3000 ? await d.loadSitemapUrls(finalTarget.origin, robots.sitemaps || [], readOptions({ timeoutMs: Math.min(4500, remaining()) })) : { urls: [], files: [] };

  // Track seen URLs so multi-round link discovery never revisits a page.
  const seenUrls = new Set([first.url]);
  const makePlan = (allLinks, alreadyQueued) => {
    const queuedUrls = new Set(alreadyQueued.map((p) => p.url));
    return rankPages({ start: first.url, links: allLinks, sitemap: sitemap.urls, limit: FINDER_LIMITS.extraPages + 3 })
      .filter((p) => {
        if (seenUrls.has(p.url) || queuedUrls.has(p.url)) return false;
        const ok = isPathAllowed(robots, pathOf(p.url));
        if (!ok) notes.skipped.push({ url: p.url, reason: 'robots.txt asks not to read it' });
        return ok;
      });
  };

  const initialPlan = makePlan(startPage.extraction.links, []).slice(0, FINDER_LIMITS.extraPages);
  initialPlan.forEach((p) => seenUrls.add(p.url));

  // 4. Read pages concurrently; after the first third is read, re-scan all collected links for a second discovery pass.
  // `totalPlanned` tracks every URL committed to the queue (read or still queued) so we never exceed extraPages.
  const queue = [...initialPlan];
  let pagesRead = 0;
  let totalPlanned = initialPlan.length;
  let secondDiscoveryDone = false;
  const worker = async () => {
    while (queue.length) {
      const item = queue.shift();
      if (pagesRead >= FINDER_LIMITS.extraPages || remaining() < 1800) {
        notes.skipped.push({ url: item.url, reason: remaining() < 1800 ? 'out of time' : 'page limit reached' });
        continue;
      }
      const result = await d.readUrl(item.url, readOptions());
      if (!result.ok || result.blocked) {
        notes.skipped.push({ url: item.url, reason: result.ok ? 'the page asks visitors to prove they are not a robot' : result.message });
        continue;
      }
      const page = { url: result.url, kind: item.kind, status: result.status, extraction: extractPage({ url: result.url, html: result.text }) };
      pages.push(page);
      pagesRead += 1;
      seenUrls.add(result.url);
      // After reading roughly the first third, enrich the queue with links found on all pages so far.
      // The `secondDiscoveryDone` flag is set synchronously (before any await) so only one worker ever runs this.
      if (!secondDiscoveryDone && pagesRead >= Math.ceil(FINDER_LIMITS.extraPages / 3)) {
        secondDiscoveryDone = true;
        const canAdd = FINDER_LIMITS.extraPages - totalPlanned;
        if (canAdd > 0) {
          const allLinks = pages.flatMap((p) => p.extraction.links);
          const extra = makePlan(allLinks, queue).slice(0, canAdd);
          totalPlanned += extra.length;
          extra.forEach((p) => { seenUrls.add(p.url); queue.push(p); });
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(FINDER_LIMITS.concurrency, queue.length) }, worker));

  const data = assemble({ pages, startUrl: first.url, site, notes, warnings, started, robotsNote: robotsResult.note, sitemapFiles: sitemap.files, publicUrl, source: 'website' });
  if (robotsResult.note) data.warnings.push(robotsResult.note);

  if (data.completeness.score < 20 && !data.likelyHotel) {
    const chainNote = isMajorChain ? ` Major hotel chain websites like ${target.host} render their content with private client-side scripts.` : '';
    return fail('NOTHING_FOUND', `The page was read, but no hotel details could be found on it.${chainNote} It may not be a hotel's website, or it may draw its content with scripts. Try the hotel's Contact or About page, or paste the page's text.`, { canPaste: true });
  }
  return { ok: true, data };
};

// ---- pasted text ----

const looksLikeHtml = (text) => /<\s*(?:html|body|div|p|h[1-6]|section|article|ul|table|address|script|meta|a)\b/i.test(text);
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SECTION_WORDS = /^(?:rooms?(?:\s*(?:&|and)\s*\w+)?|suites?|accommodations?|amenities|facilities|services|features|contact(?:\s+us)?|about(?:\s+us)?|location|policies|policy|dining|gallery|rates|tariff|offers?|reviews?|how to reach|address|activities|experiences)$/i;
// Nav / accessibility UI lines that appear at the top of pasted page text but carry no hotel information
const NAV_LINE = /^(?:skip(?:\s+to(?:\s+(?:main\s+)?content)?)?(?:\s+navigation)?|cookie\s+(?:settings?|notice|preferences?|consent|policy)|accept(?:\s+all)?\s+cookies?|decline\s+cookies?|privacy\s+settings?|toggle\s+(?:nav(?:igation)?|menu)|site\s+navigation|main\s+menu|enable\s+javascript|javascript\s+(?:is\s+)?required|loading\.\.\.|powered\s+by\s+\w+)$/i;

/** Turns plain pasted text into simple HTML so the same readers can work on it: short lines followed by longer text are headings. */
export const textToHtml = (text) => {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim());
  const out = [];
  const firstLine = lines.findIndex(Boolean);
  lines.forEach((line, i) => {
    if (!line) return;
    if (NAV_LINE.test(line)) return; // skip accessibility / nav UI text that is never hotel content
    const next = lines.slice(i + 1).find(Boolean) || '';
    const shape = line.length <= 60 && /^[\p{Lu}\d]/u.test(line) && !/[.!?,:;]$/.test(line) && !/@|https?:|\d{5,}/.test(line) && line.split(' ').length <= 8;
    // The first line is the title; a known section word is a heading; so is a short line followed by a real sentence or paragraph.
    // A short line followed by another short line is an item of a list, not a heading.
    const heading = shape && (i === firstLine || SECTION_WORDS.test(line) || next.length >= 40 || /^[\p{Lu}\s&\d'-]+$/u.test(line));
    out.push(heading ? `<h2>${escapeHtml(line)}</h2>` : `<p>${escapeHtml(line)}</p>`);
  });
  return `<html><body>${out.join('\n')}</body></html>`;
};

/**
 * Finds a hotel's details from text a person copied from the hotel's page (or from its HTML), for sites that do not allow automatic
 * reading. `url` is optional: the address the text came from (it is not fetched, only used to resolve links and decide the website).
 */
export const findFromText = (input, { url = '', allowPrivate = false } = {}) => {
  const started = Date.now();
  if (typeof input !== 'string' || !input.trim()) return fail('EMPTY_TEXT', "Paste the page's text first: open the hotel's page in your browser, select everything (Ctrl+A), copy (Ctrl+C), and paste it here.");
  let text = input;
  const warnings = [];
  if (text.length > FINDER_LIMITS.pastedChars) {
    text = text.slice(0, FINDER_LIMITS.pastedChars);
    warnings.push(`The pasted text was very long, so only the first ${Math.round(FINDER_LIMITS.pastedChars / 1000)},000 characters were read.`);
  }
  if (text.trim().length < 40) return fail('TEXT_TOO_SHORT', 'That is too short to find hotel details in. Copy the whole page (Ctrl+A, then Ctrl+C) and paste it here.');
  let pageUrl = 'https://pasted-page.invalid/';
  let site = '';
  let startUrl = '';
  if (url && String(url).trim()) {
    const parsed = parseTarget(url, { allowPrivate });
    if (!parsed.ok) return fail(parsed.code, `The address of the page: ${parsed.message}`);
    pageUrl = parsed.url;
    startUrl = parsed.url;
    site = siteOf(parsed.url);
  }
  const html = looksLikeHtml(text) ? text : textToHtml(text);
  const extraction = extractPage({ url: pageUrl, html });
  const publicUrl = (u) => !u.includes('pasted-page.invalid') && parseTarget(u, { allowPrivate }).ok;
  const pages = [{ url: pageUrl, kind: 'pasted', status: 200, extraction }];
  const data = assemble({ pages, startUrl, site, notes: { skipped: [] }, warnings, started, robotsNote: '', sitemapFiles: [], publicUrl, source: 'pasted' });
  data.sourceUrl = startUrl;
  data.pages = [{ url: startUrl, kind: 'pasted', label: KIND_LABEL.pasted, status: 200, title: extraction.page.title }];
  if (data.completeness.score < 20 && !data.likelyHotel) {
    return fail('NOTHING_FOUND', 'No hotel details could be found in that text. Check that it is the hotel\'s own page (its home, About or Contact page), and that you copied the whole page.');
  }
  return { ok: true, data };
};
