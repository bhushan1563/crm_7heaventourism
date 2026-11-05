import { describe, expect, it } from 'vitest';
import { NEW_VERSION_MESSAGE, getErrorMessage } from './api';

describe('getErrorMessage', () => {
  it('gives the server\'s own message first, and a plain sentence for a lost connection', () => {
    expect(getErrorMessage({ response: { data: { message: 'Quotation not found.' } } })).toBe('Quotation not found.');
    expect(getErrorMessage({ code: 'ECONNABORTED' })).toMatch(/timed out/);
    expect(getErrorMessage({ request: {} })).toMatch(/Cannot reach the server/);
  });

  it('says what happened, and what to do, when a tab left open during an update asks for a file that is gone', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://crm.example.in/assets/jspdf.es.min-DEttlUE5.js', // Chrome
      'error loading dynamically imported module: https://crm.example.in/assets/html2canvas.esm-BfxBtG_O.js', // Firefox
      'Importing a module script failed.', // Safari
      'Loading chunk 7 failed.',
      'Unable to preload CSS for /assets/index.css'
    ]) {
      expect(getErrorMessage(new Error(message))).toBe(NEW_VERSION_MESSAGE);
    }
    expect(NEW_VERSION_MESSAGE).toMatch(/refresh the page \(Ctrl \+ Shift \+ R\)/);
  });

  it('keeps the general sentence for anything else, or the one the caller gave', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
    expect(getErrorMessage(new Error('boom'), 'The PDF could not be made.')).toBe('The PDF could not be made.');
    expect(getErrorMessage(undefined)).toBe('Something went wrong. Please try again.');
  });
});
