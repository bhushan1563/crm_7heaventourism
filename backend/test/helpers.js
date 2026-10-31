// Test environment: must be applied before any app module is imported.
// MONGODB_URI is set (empty) so dotenv can never load a real connection string from backend/.env, and the app
// never connects to a database - every test here runs without one.
process.env.NODE_ENV = 'test';
process.env.ENV_FILE = '/nonexistent/.env'; // never read the developer's real backend/.env during tests
process.env.VERCEL = '1'; // export the app without listening
process.env.MONGODB_URI = '';
process.env.JWT_SECRET = 'unit-test-secret-unit-test-secret-unit-test-secret';

export const startApp = async () => {
  const { default: app } = await import('../src/server.js');
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    close: () => new Promise((resolve) => server.close(resolve))
  };
};

/** Minimal Express response double. */
export const fakeRes = () => {
  const res = {
    statusCode: 200,
    body: undefined,
    locals: {},
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    }
  };
  return res;
};
