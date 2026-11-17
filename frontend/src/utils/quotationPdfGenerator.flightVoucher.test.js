import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { printFlightVoucher } from './quotationPdfGenerator';
import { mediaUrl } from '../services/mediaService';

// The Print Voucher button writes the flight voucher into a window of its own: it must show the screenshots, and must not let a quotation
// field become markup.

let written;
beforeEach(() => {
  written = '';
  const printWindow = { closed: false, focus: vi.fn(), print: vi.fn(), close: vi.fn(), addEventListener: vi.fn(), document: { open: vi.fn(), write: (html) => { written += html; }, close: vi.fn() } };
  vi.spyOn(window, 'open').mockReturnValue(printWindow);
});
afterEach(() => vi.restoreAllMocks());

const quotation = (over = {}) => ({ quotationNo: '7H-QT-2026-001', flightDetails: [], ...over });

describe('the flight voucher', () => {
  it('shows each screenshot of the flight, in order, with its caption, above the typed flights', () => {
    printFlightVoucher(quotation({
      flightImages: [{ token: 'A'.repeat(24), width: 1080, height: 1920, caption: 'Onward flight' }, { token: 'B'.repeat(24), width: 1600, height: 700, caption: '' }],
      flightDetails: [{ flightType: 'Departure', airline: 'Indigo', fromAirport: 'AMD', toAirport: 'VNS' }]
    }));
    const first = written.indexOf(`src="${mediaUrl('A'.repeat(24))}"`);
    const second = written.indexOf(`src="${mediaUrl('B'.repeat(24))}"`);
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(written).toContain('Onward flight');
    expect(written.indexOf('Indigo')).toBeGreaterThan(second);
  });

  it('does not say that no flight was entered when the screenshots are the flight', () => {
    printFlightVoucher(quotation({ flightImages: [{ token: 'A'.repeat(24), width: 1, height: 1, caption: '' }] }));
    expect(written).not.toContain('No specific flight segments entered');
    printFlightVoucher(quotation());
    expect(written).toContain('No specific flight segments entered');
  });

  it('turns every quotation field into text, so a caption or a token can never inject markup or script', () => {
    printFlightVoucher(quotation({ flightImages: [{ token: '"><script>steal()</script>', width: 1, height: 1, caption: '<img src=x onerror="steal()">' }] }));
    expect(written).not.toContain('<script>steal()');
    expect(written).not.toContain('<img src=x');
    expect(written).toContain('&lt;img src=x onerror=&quot;steal()&quot;&gt;');
  });
});
