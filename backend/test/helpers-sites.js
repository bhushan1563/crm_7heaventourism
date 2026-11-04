import http from 'node:http';

// A pretend website on this computer, for testing the hotel finder against real connections. `routes` maps a path to what the
// site answers: an object { status, headers, body, delayMs } or a function (req, res) for anything unusual. Every request is
// recorded in `site.requests` so a test can see what the finder asked for (and what it did not).
export const startSite = async (routes = {}) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const path = req.url.split('#')[0];
    requests.push({ path, headers: req.headers });
    const route = routes[path] ?? routes[req.url.split('?')[0]] ?? routes['*'];
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/html' });
      return res.end('<html><title>Not found</title><body>Not found</body></html>');
    }
    if (typeof route === 'function') return route(req, res);
    if (route.delayMs) await new Promise((resolve) => setTimeout(resolve, route.delayMs));
    res.writeHead(route.status ?? 200, { 'content-type': 'text/html; charset=utf-8', ...(route.headers || {}) });
    return res.end(route.body ?? '');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const site = {
    port,
    origin: `http://127.0.0.1:${port}`,
    requests,
    paths: () => requests.map((r) => r.path),
    close: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    })
  };
  return site;
};

/** Page text with a title and some body, enough to be "a web page". */
export const page = (title, body = '') => `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
