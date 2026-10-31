// Integration-test environment: the REAL app (routes, middleware, models) running against a throwaway in-memory MongoDB.
// No mocks, so these tests catch what unit tests cannot: indexes, queries, validation, rights, real HTTP.
// Import this file first in a test file (it sets the environment before any app module is loaded).
process.env.NODE_ENV = 'test';
process.env.ENV_FILE = '/nonexistent/.env'; // never read a developer's real backend/.env
process.env.VERCEL = '1'; // export the app without listening on a fixed port
process.env.JWT_SECRET = 'integration-test-secret-integration-test-secret-1234';

const { MongoMemoryServer } = await import('mongodb-memory-server-core');
const jwt = (await import('jsonwebtoken')).default;

let counter = 0;

/** Starts the app on a random port with its own empty database. Always call `close()` in an `after` hook. */
export const startDbApp = async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('integration');

  const { connectDB, disconnectDB } = await import('../../src/config/db.js');
  await connectDB();
  const { default: app } = await import('../../src/server.js');
  const { config } = await import('../../src/config/env.js');
  const { default: UserModel } = await import('../../src/models/User.js');

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  /** A real user in the database plus a valid session token for them. */
  const makeUser = async (role = 'Sales', extra = {}) => {
    counter += 1;
    const user = await UserModel.create({
      email: `user${counter}@test.local`,
      password: 'password-123',
      firstName: 'Test',
      lastName: `${role}${counter}`,
      phone: '9999999999',
      role,
      active: true,
      deleted: false,
      ...extra
    });
    const token = jwt.sign({ id: String(user._id) }, config.jwtSecret, { algorithm: 'HS256', expiresIn: '1h' });
    return { user, token };
  };

  /**
   * One HTTP call. `json` sends a JSON body; `form` sends multipart (a FormData); `token` adds the Bearer header.
   * Returns the parsed JSON when there is any, plus the raw response and bytes.
   */
  const call = async (path, { method = 'GET', token, json, form, headers = {} } = {}) => {
    const init = { method, headers: { ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (json !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(json);
    } else if (form) {
      init.body = form;
    }
    const res = await fetch(base + path, init);
    const bytes = Buffer.from(await res.arrayBuffer());
    let body;
    try {
      body = JSON.parse(bytes.toString('utf8'));
    } catch {
      body = undefined;
    }
    return { res, status: res.status, body, bytes };
  };

  const close = async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB().catch(() => {});
    await mongod.stop().catch(() => {});
  };

  return { base, makeUser, call, close, config };
};

/** Smallest valid images for each format, with a chosen size in the header (the rest of the file need not decode). */
export const fakeImage = {
  jpeg: (width = 640, height = 480, padding = 0) => {
    const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.alloc(padding, 7), Buffer.from([0xff, 0xd9])]);
  },
  png: (width = 640, height = 480, padding = 0) => {
    const ihdr = Buffer.alloc(25);
    ihdr.writeUInt32BE(13, 0);
    ihdr.write('IHDR', 4, 'latin1');
    ihdr.writeUInt32BE(width, 8);
    ihdr.writeUInt32BE(height, 12);
    ihdr[16] = 8;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, Buffer.alloc(padding, 7)]);
  },
  webp: (width = 640, height = 480, padding = 0) => {
    const head = Buffer.alloc(30);
    head.write('RIFF', 0, 'latin1');
    head.writeUInt32LE(22 + padding, 4);
    head.write('WEBPVP8X', 8, 'latin1');
    head.writeUInt32LE(10, 16);
    head.writeUIntLE(width - 1, 24, 3);
    head.writeUIntLE(height - 1, 27, 3);
    return Buffer.concat([head, Buffer.alloc(padding, 7)]);
  }
};

/** multipart body for POST /api/media. Pass `image: null` to omit the photo, `thumb` to include a preview, `purpose: null` to omit the purpose. */
export const photoForm = ({ image, thumb, purpose = 'hotel', type = 'image/jpeg', filename = 'photo.jpg', extra = {} } = {}) => {
  const form = new FormData();
  if (image) form.append('image', new Blob([image], { type }), filename);
  if (thumb) form.append('thumb', new Blob([thumb], { type }), 'thumb.jpg');
  if (purpose !== null) form.append('purpose', purpose); // pass purpose: null to leave it out
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
};
