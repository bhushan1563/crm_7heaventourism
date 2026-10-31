// Builds an upload-ready zip of the app for Hostinger (hPanel file upload / Node.js app) or a plain `unzip` onto a VPS.
//
//   npm run package                -> release/7heaven-crm-v<version>-<date>.zip
//   npm run package -- --no-apk    same without the ~64 MB Android app download (backend/src/uploads/7heaven.apk)
//
// What goes in: every file git would commit (so .gitignore decides: no .env, node_modules, CSVs, "old data/", backups) plus the
// freshly built frontend/dist. Shell scripts, nginx and .env.example files are forced to Unix (LF) line endings, because a
// script saved with CRLF fails on Linux. The build is re-run first so the zip never contains a stale web app.
// It refuses to write the zip if anything that looks like a secret or customer data would be inside.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
// Run npm through node itself (npm sets npm_execpath) so no shell is involved on Windows.
const npmBuild = () => (process.env.npm_execpath
  ? run(process.execPath, [process.env.npm_execpath, 'run', 'build'], { stdio: 'ignore' })
  : run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { stdio: 'ignore', shell: process.platform === 'win32' }));
const withoutApk = process.argv.includes('--no-apk'); // the Android app download (~64 MB) is optional for the server

let zipSync;
try {
  ({ zipSync } = await import('fflate'));
} catch {
  console.error('The "fflate" package is missing - run `npm ci` in the repo root first.');
  process.exit(1);
}

console.log('Building the web app ...');
npmBuild();
const dist = path.join(root, 'frontend', 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('frontend/dist/index.html is missing after the build.');
  process.exit(1);
}

const listed = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
const files = new Set(listed.filter((f) => fs.existsSync(path.join(root, f)) && fs.statSync(path.join(root, f)).isFile() && !(withoutApk && /\.apk$/i.test(f))));
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
for (const abs of walk(dist)) files.add(path.relative(root, abs).split(path.sep).join('/'));

// --- Safety checks -----------------------------------------------------------------------------------------------
const forbidden = [...files].filter((f) =>
  /(^|\/)node_modules\//.test(f) || /(^|\/)\.git\//.test(f) || /^old data\//i.test(f) || /^backups\//.test(f) || /^release\//.test(f) ||
  /\.csv$/i.test(f) || /(^|\/)\.env(\.local)?$/.test(f) || /\.(pem|key)$/i.test(f));
if (forbidden.length) {
  console.error('Refusing to package - these files must not ship:\n  ' + forbidden.join('\n  '));
  process.exit(1);
}

const TEXT = /\.(js|jsx|mjs|cjs|json|css|html|md|txt|sh|conf|yml|yaml|example|svg|bat|env\.development|env\.production)$|(^|\/)\.env\.[a-z]+$|^\.[a-z]+$/i;
const FORCE_LF = /\.(sh|conf|cjs|mjs)$|\.env\.example$/;
const uriWithPassword = /mongodb(?:\+srv)?:\/\/([^:\s/'"`<>]+):([^@\s'"`<>]+)@/g;
const placeholderPassword = /^(password|pass|your[-_]?password|<.*>|\$\{.*\}|\*+|x+|secret)$/i;
const problems = [];
const entries = {};
let totalBytes = 0;

for (const rel of [...files].sort()) {
  let data = fs.readFileSync(path.join(root, rel));
  if (TEXT.test(rel) && data.length < 2_000_000) {
    let text = data.toString('utf8');
    for (const m of text.matchAll(uriWithPassword)) {
      if (!placeholderPassword.test(m[2])) problems.push(`${rel}: contains a database URI with a password (user "${m[1]}")`);
    }
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) problems.push(`${rel}: contains a private key`);
    if (FORCE_LF.test(rel) && text.includes('\r')) data = Buffer.from(text.replace(/\r\n?/g, '\n'), 'utf8');
  }
  const executable = /\.sh$/.test(rel);
  // os: 3 = Unix, attrs carries the file mode in the high 16 bits, so `unzip` restores the execute bit on deploy scripts.
  entries[rel] = [new Uint8Array(data), { level: /\.(webp|png|jpe?g|apk|traineddata)$/i.test(rel) ? 0 : 9, mtime: new Date(), os: 3, attrs: ((executable ? 0o100755 : 0o100644) << 16) >>> 0 }];
  totalBytes += data.length;
}
if (problems.length) {
  console.error('Refusing to package - possible secrets found:\n  ' + problems.join('\n  '));
  process.exit(1);
}

const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const outDir = path.join(root, 'release');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `7heaven-crm-v${version}-${date}.zip`);
fs.writeFileSync(out, zipSync(entries));

const sha = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
console.log(`\n${Object.keys(entries).length} files, ${(totalBytes / 1048576).toFixed(1)} MB uncompressed -> ${(fs.statSync(out).size / 1048576).toFixed(1)} MB zip`);
console.log(out);
console.log(`sha256 ${sha}`);
console.log('Contains no .env, no customer data (CSVs / "old data"), no node_modules. Secrets are created on the server by deploy/setup-vps.sh or set in hPanel.');
