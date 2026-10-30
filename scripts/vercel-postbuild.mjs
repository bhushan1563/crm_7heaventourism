// Vercel build step: publish backend/src/uploads (the Android APK) as static files at /static,
// so the CDN serves the 67 MB download instead of the serverless function.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(root, 'backend', 'src', 'uploads');
const to = path.join(root, 'frontend', 'dist', 'static');

if (fs.existsSync(from)) {
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`[postbuild] copied ${path.relative(root, from)} -> ${path.relative(root, to)}`);
} else {
  console.log('[postbuild] no backend/src/uploads folder, nothing to copy');
}
