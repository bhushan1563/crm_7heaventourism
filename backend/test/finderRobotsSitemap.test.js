import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import fc from 'fast-check';
import { isPathAllowed, loadRobots, parseRobots } from '../src/services/hotelFinder/robots.js';
import { SITEMAP_LIMITS, loadSitemapUrls, parseSitemap } from '../src/services/hotelFinder/sitemap.js';
import { ROBOTS_TOKEN } from '../src/services/hotelFinder/webReader.js';
import { page, startSite } from './helpers-sites.js';

const local = { allowPrivate: true };
const allowed = (text, path, token) => isPathAllowed(parseRobots(text), path, token);

// ---- robots.txt ----

test('robots.txt: no file or an empty one allows everything', () => {
  assert.equal(allowed('', '/anything'), true);
  assert.equal(allowed('User-agent: *\nDisallow:', '/anything'), true);
  assert.equal(allowed('# only a comment', '/x'), true);
  assert.equal(isPathAllowed({ groups: [], sitemaps: [] }, '/x'), true);
});

test('robots.txt: Disallow and Allow, longest rule wins, Allow wins a tie', () => {
  const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/open\nDisallow: /tie\nAllow: /tie';
  assert.equal(allowed(robots, '/public'), true);
  assert.equal(allowed(robots, '/private'), false);
  assert.equal(allowed(robots, '/private/area'), false);
  assert.equal(allowed(robots, '/private/open/page'), true);
  assert.equal(allowed(robots, '/tie'), true);
  assert.equal(allowed('User-agent: *\nDisallow: /', '/'), false);
  assert.equal(allowed('User-agent: *\nDisallow: /', '/rooms'), false);
});

test('robots.txt: wildcards and the end-of-address mark', () => {
  const robots = 'User-agent: *\nDisallow: /*.pdf$\nDisallow: /search*?q=\nDisallow: /a/*/b';
  assert.equal(allowed(robots, '/brochure.pdf'), false);
  assert.equal(allowed(robots, '/brochure.pdf?x=1'), true);
  assert.equal(allowed(robots, '/brochure.pdfx'), true);
  assert.equal(allowed(robots, '/search?q=hotel'), false);
  assert.equal(allowed(robots, '/search/page?q=hotel'), false);
  assert.equal(allowed(robots, '/a/x/b'), false);
  assert.equal(allowed(robots, '/a/b'), true);
});

test('robots.txt: the group that names us beats the "*" group, and names are matched in any case', () => {
  const robots = `User-agent: *\nDisallow: /\n\nUser-agent: ${ROBOTS_TOKEN.toUpperCase()}\nDisallow: /secret\n`;
  assert.equal(allowed(robots, '/rooms'), true);
  assert.equal(allowed(robots, '/secret/x'), false);
  const blockedUs = `User-agent: *\nAllow: /\n\nUser-agent: ${ROBOTS_TOKEN}\nDisallow: /`;
  assert.equal(allowed(blockedUs, '/'), false);
  // another robot's group says nothing about us
  assert.equal(allowed('User-agent: Googlebot\nDisallow: /', '/rooms'), true);
});

test('robots.txt: several agents share a group, fields in any case, comments and a BOM are ignored', () => {
  const robots = '﻿USER-AGENT: BadBot # comment\nuser-agent: *\nDISALLOW: /x # trailing comment\n\nSitemap: https://hotel.com/sitemap.xml\nSITEMAP: not a url\nCrawl-delay: 10\nHost: hotel.com';
  const parsed = parseRobots(robots);
  assert.equal(parsed.groups.length, 1);
  assert.deepEqual(parsed.groups[0].agents, ['badbot', '*']);
  assert.equal(allowed(robots, '/x'), false);
  assert.equal(allowed(robots, '/y'), true);
  assert.deepEqual(parsed.sitemaps, ['https://hotel.com/sitemap.xml']);
});

test('robots.txt: rules before any User-agent line and lines without a colon are ignored', () => {
  assert.equal(allowed('Disallow: /\nthis line is nonsense\nUser-agent: *\nDisallow: /nope', '/rooms'), true);
});

test('robots.txt property: parsing and judging never throw, and "Disallow: /" with nothing else blocks every path', () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 800 }), fc.string({ maxLength: 60 }), (text, path) => {
      const robots = parseRobots(text);
      assert.equal(typeof isPathAllowed(robots, `/${path}`), 'boolean');
    }),
    { numRuns: 800 }
  );
  fc.assert(
    fc.property(fc.webPath(), (path) => {
      const at = path || '/'; // an address always has at least "/"
      assert.equal(allowed('User-agent: *\nDisallow: /', at), false);
      assert.equal(allowed('User-agent: *\nAllow: /', at), true);
    }),
    { numRuns: 200 }
  );
});

test('loadRobots: reads the file, and what a missing or broken one means', async (t) => {
  const site = await startSite({
    '/robots.txt': { headers: { 'content-type': 'text/plain' }, body: 'User-agent: *\nDisallow: /private\nSitemap: https://hotel.com/map.xml' }
  });
  t.after(() => site.close());
  const found = await loadRobots(site.origin, local);
  assert.equal(found.found, true);
  assert.equal(isPathAllowed(found.robots, '/private'), false);
  assert.deepEqual(found.robots.sitemaps, ['https://hotel.com/map.xml']);

  const none = await startSite({});
  t.after(() => none.close());
  const missing = await loadRobots(none.origin, local);
  assert.deepEqual([missing.found, missing.note], [false, '']);
  assert.equal(isPathAllowed(missing.robots, '/anything'), true);

  const spa = await startSite({ '/robots.txt': { body: page('Single page app', '<div id="root"></div>') } });
  t.after(() => spa.close());
  assert.equal((await loadRobots(spa.origin, local)).found, false, 'a home page served at /robots.txt says nothing');

  const forbidden = await startSite({ '/robots.txt': { status: 403, body: 'no' } });
  t.after(() => forbidden.close());
  const f = await loadRobots(forbidden.origin, local);
  assert.deepEqual([f.found, f.note], [false, '']);
  assert.equal(isPathAllowed(f.robots, '/rooms'), true);

  const down = await startSite({ '/robots.txt': { status: 503, body: 'down' } });
  t.after(() => down.close());
  const d = await loadRobots(down.origin, local);
  assert.equal(d.found, false);
  assert.match(d.note, /robots\.txt could not be read/);
});

test('loadRobots: a huge robots.txt is cut and still parsed', async (t) => {
  const lines = `User-agent: *\nDisallow: /secret\n${'Disallow: /x\n'.repeat(200000)}`;
  const site = await startSite({ '/robots.txt': { headers: { 'content-type': 'text/plain' }, body: lines } });
  t.after(() => site.close());
  const r = await loadRobots(site.origin, local);
  assert.equal(r.found, true);
  assert.equal(isPathAllowed(r.robots, '/secret'), false);
});

// ---- sitemaps ----

const urlset = (...locs) => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map((l) => (typeof l === 'string' ? `<url><loc>${l}</loc></url>` : `<url><loc>${l.loc}</loc>${l.lastmod ? `<lastmod>${l.lastmod}</lastmod>` : ''}${l.priority !== undefined ? `<priority>${l.priority}</priority>` : ''}</url>`)).join('')}</urlset>`;

test('sitemap: a list of pages, with dates and priorities where given', () => {
  const { urls, sitemaps } = parseSitemap(urlset({ loc: 'https://hotel.com/', priority: 1.0, lastmod: '2026-01-02' }, 'https://hotel.com/rooms', { loc: 'https://hotel.com/odd', priority: 7 }));
  assert.deepEqual(urls.map((u) => u.loc), ['https://hotel.com/', 'https://hotel.com/rooms', 'https://hotel.com/odd']);
  assert.deepEqual(urls.map((u) => u.priority), [1, 0.5, 0.5]);
  assert.equal(urls[0].lastmod, '2026-01-02');
  assert.deepEqual(sitemaps, []);
});

test('sitemap: an index of other sitemaps, entities, CDATA, namespaces and image extensions', () => {
  const index = '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://hotel.com/pages.xml</loc></sitemap><sitemap><loc>https://hotel.com/posts.xml</loc></sitemap></sitemapindex>';
  assert.deepEqual(parseSitemap(index).sitemaps, ['https://hotel.com/pages.xml', 'https://hotel.com/posts.xml']);
  const messy = '<urlset xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"><url><loc>https://hotel.com/a?x=1&amp;y=2</loc><image:image><image:loc>https://hotel.com/p.jpg</image:loc></image:image></url><url><loc><![CDATA[https://hotel.com/b]]></loc></url></urlset>';
  assert.deepEqual(parseSitemap(messy).urls.map((u) => u.loc), ['https://hotel.com/a?x=1&y=2', 'https://hotel.com/b']);
});

test('sitemap: a plain list of addresses, a broken file, nonsense and the size limit', () => {
  assert.deepEqual(parseSitemap('https://hotel.com/a\nnot an address\r\nhttps://hotel.com/b\n').urls.map((u) => u.loc), ['https://hotel.com/a', 'https://hotel.com/b']);
  // a file cut off in the middle still gives the pages before the cut
  assert.deepEqual(parseSitemap('<urlset><url><loc>https://hotel.com/a</loc></url><url><loc>https://hotel.com/b</loc></url><url><loc>https://hotel.com/c').urls.map((u) => u.loc), ['https://hotel.com/a', 'https://hotel.com/b']);
  assert.deepEqual(parseSitemap('<html><body>hi</body></html>'), { urls: [], sitemaps: [] });
  assert.deepEqual(parseSitemap(''), { urls: [], sitemaps: [] });
  assert.deepEqual(parseSitemap(null), { urls: [], sitemaps: [] });
  const many = parseSitemap(urlset(...Array.from({ length: 300 }, (_, i) => `https://hotel.com/p${i}`)), { maxUrls: 100 });
  assert.equal(many.urls.length, 100);
  assert.deepEqual(parseSitemap(urlset('javascript:alert(1)', 'ftp://x/y', 'https://hotel.com/ok')).urls.map((u) => u.loc), ['https://hotel.com/ok']);
});

test('sitemap property: parsing never throws and only keeps web addresses', () => {
  fc.assert(
    fc.property(fc.oneof(fc.string({ maxLength: 500 }), fc.array(fc.webUrl(), { maxLength: 8 }).map((list) => urlset(...list))), (text) => {
      const { urls, sitemaps } = parseSitemap(text);
      for (const u of urls) assert.match(u.loc, /^https?:\/\/\S+$/i);
      for (const s of sitemaps) assert.match(s, /^https?:\/\/\S+$/i);
    }),
    { numRuns: 500 }
  );
});

test('loadSitemapUrls: finds /sitemap.xml, keeps only this site\'s pages and says which files it used', async (t) => {
  let good;
  good = await startSite({ '/sitemap.xml': (req, res) => { res.writeHead(200, { 'content-type': 'text/xml' }); res.end(urlset(`${good.origin}/`, `${good.origin}/rooms`, 'https://evil.example.com/phish', 'http://169.254.169.254/latest', `${good.origin}/contact`)); } });
  t.after(() => good.close());
  const g = await loadSitemapUrls(good.origin, [], local);
  assert.deepEqual(g.files, [`${good.origin}/sitemap.xml`]);
  assert.deepEqual(g.urls.map((u) => new URL(u.loc).pathname), ['/', '/rooms', '/contact'], 'pages of other sites are dropped');
});

test('loadSitemapUrls: robots-named maps first, an index leads to its children, gzip is read, and the number of files is capped', async (t) => {
  let site;
  const loc = (p) => `${site.origin}${p}`;
  site = await startSite({
    '/maps/index.xml': (req, res) => { res.writeHead(200, { 'content-type': 'application/xml' }); res.end(`<?xml version="1.0"?><sitemapindex><sitemap><loc>${loc('/maps/pages.xml.gz')}</loc></sitemap><sitemap><loc>${loc('/maps/posts.xml')}</loc></sitemap><sitemap><loc>${loc('/maps/extra1.xml')}</loc></sitemap><sitemap><loc>${loc('/maps/extra2.xml')}</loc></sitemap></sitemapindex>`); },
    '/maps/pages.xml.gz': (req, res) => { res.writeHead(200, { 'content-type': 'application/gzip' }); res.end(zlib.gzipSync(urlset(loc('/rooms'), loc('/contact')))); },
    '/maps/posts.xml': (req, res) => { res.writeHead(200, { 'content-type': 'application/xml' }); res.end(urlset(loc('/blog/one'))); },
    '/maps/extra1.xml': (req, res) => { res.writeHead(200, { 'content-type': 'application/xml' }); res.end(urlset(loc('/never-read-1'))); },
    '/maps/extra2.xml': (req, res) => { res.writeHead(200, { 'content-type': 'application/xml' }); res.end(urlset(loc('/never-read-2'))); }
  });
  t.after(() => site.close());
  const r = await loadSitemapUrls(site.origin, [loc('/maps/index.xml')], local);
  assert.equal(r.files.length, SITEMAP_LIMITS.files);
  assert.deepEqual(r.urls.map((u) => new URL(u.loc).pathname).sort(), ['/blog/one', '/contact', '/rooms']);
  assert.ok(!site.paths().includes('/maps/extra1.xml') && !site.paths().includes('/sitemap.xml'), 'it stopped after enough files and never guessed more once it had pages');
});

test('loadSitemapUrls: a site with no sitemap, or whose every address is its home page, gives nothing and never fails', async (t) => {
  const none = await startSite({});
  t.after(() => none.close());
  assert.deepEqual(await loadSitemapUrls(none.origin, [], local), { urls: [], files: [] });
  const spa = await startSite({ '*': { body: page('App', '<div id="root"></div>') } });
  t.after(() => spa.close());
  assert.deepEqual(await loadSitemapUrls(spa.origin, [], local), { urls: [], files: [] });
  const broken = await startSite({ '/sitemap.xml': { headers: { 'content-type': 'application/xml' }, body: '<urlset><url><loc>' } });
  t.after(() => broken.close());
  assert.deepEqual((await loadSitemapUrls(broken.origin, [], local)).urls, []);
  const bomb = await startSite({ '/sitemap.xml': (req, res) => { res.writeHead(200, { 'content-type': 'application/xml', 'content-encoding': 'gzip' }); res.end(zlib.gzipSync(Buffer.alloc(40 * 1024 * 1024, 0x20))); } });
  t.after(() => bomb.close());
  assert.deepEqual((await loadSitemapUrls(bomb.origin, [], local)).urls, []);
});
