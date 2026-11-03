import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The client asked for the rupee, not the dollar, everywhere in the interface. Every screen and component is read here, so a dollar
// icon or a dollar amount can never come back unnoticed.

const SRC = path.dirname(fileURLToPath(import.meta.url));

const sources = (dir = SRC) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(full);
    return /\.(jsx?|css)$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name) ? [full] : [];
  });

const files = sources();
const rel = (f) => path.relative(SRC, f).replace(/\\/g, '/');

describe('the interface speaks rupees, not dollars', () => {
  it('reads the whole interface (so the checks below mean something)', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.map(rel)).toContain('pages/QuotationBuilderPage.jsx');
    expect(files.map(rel)).toContain('pages/DashboardPage.jsx');
  });

  it('uses no dollar icon (DollarSign, CircleDollarSign, BadgeDollarSign) anywhere', () => {
    const offenders = files.filter((f) => /\b(?:Circle|Badge|Square)?Dollar(?:Sign)?\b/.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('uses the rupee icon where an amount of money is shown: the Pricing tab, the list card and the dashboard card', () => {
    const text = (name) => fs.readFileSync(path.join(SRC, name), 'utf8');
    expect(text('pages/QuotationBuilderPage.jsx')).toMatch(/label: '5\. Pricing', icon: IndianRupee/);
    expect(text('pages/QuotationListPage.jsx')).toMatch(/<IndianRupee size=\{22\} \/>/);
    expect(text('pages/DashboardPage.jsx')).toMatch(/icon=\{IndianRupee\}/);
  });

  it('writes no amount with a dollar sign, and asks for no dollar currency or US number format, in any screen or document', () => {
    const patterns = [
      /\$\s?\d/, // $500
      /['"`]\$['"`]/, // the sign on its own as text
      />\s*\$\s*</, // the sign alone in a tag
      /\$\$\{/, // "$" followed by a template amount
      /\bUSD\b/,
      /currency:\s*['"][A-Z]{3}['"]/, // Intl currency formatting
      /content:\s*['"]\$/ // a dollar sign drawn by a style sheet
    ];
    const offenders = [];
    for (const f of files) {
      const body = fs.readFileSync(f, 'utf8');
      for (const p of patterns) if (p.test(body)) offenders.push(`${rel(f)} matches ${p}`);
    }
    expect(offenders).toEqual([]);
  });

  it('shows amounts the Indian way (Rs 1,00,000), never with the US grouping', () => {
    const offenders = files.filter((f) => /toLocaleString\(\s*['"]en-US['"]/.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });
});
