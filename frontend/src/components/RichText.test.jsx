import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import RichText from './RichText';
import RichTextEditor from './RichTextEditor';

afterEach(cleanup);

describe('RichText (display)', () => {
  it('shows formatted text with its formatting', () => {
    const { container } = render(<RichText value='<p><strong>Bold</strong> and <span style="color:#dc2626;font-size:18px">red 18</span> <mark style="background-color:#fde047">marked</mark></p>' />);
    expect(container.querySelector('strong').textContent).toBe('Bold');
    expect(container.querySelector('span').getAttribute('style')).toContain('color:#dc2626');
    expect(container.querySelector('mark').textContent).toBe('marked');
  });

  it('never runs script or keeps handlers, even if a bad value reaches the page', () => {
    const { container } = render(<RichText value={'<p onclick="steal()">hi</p><script>window.__pwned = 1</script><img src=x onerror="window.__pwned = 1">'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toMatch(/onclick|onerror/i);
    expect(window.__pwned).toBeUndefined();
  });

  it('shows older plain text as text, with line breaks, and escapes it', () => {
    const { container } = render(<RichText value={'Day 1: arrive at 5 < 6 pm\nTransfer & check-in'} />);
    expect(container.querySelector('.rich-plain').textContent).toBe('Day 1: arrive at 5 < 6 pm\nTransfer & check-in');
  });

  it('shows plain text that merely contains angle brackets exactly as typed', () => {
    const { container } = render(<RichText value={'Price: <TBC> per pax'} />);
    expect(container.querySelector('.rich-plain').textContent).toBe('Price: <TBC> per pax');
  });

  it('handles empty values', () => {
    for (const empty of [undefined, null, '']) {
      const { container } = render(<RichText value={empty} />);
      expect(container.textContent).toBe('');
    }
  });
});

describe('RichTextEditor (rendering; typing and formatting are covered by the browser walk-through)', () => {
  it('shows the toolbar with a label on every control', async () => {
    const { findByRole, container } = render(<RichTextEditor value="" onChange={() => {}} ariaLabel="Day description" />);
    const toolbar = await findByRole('toolbar', { name: 'Text formatting' });
    for (const label of ['Bold', 'Italic', 'Underline', 'Font size', 'Text colour', 'Highlight', 'Bulleted list', 'Numbered list', 'Clear formatting', 'Undo', 'Redo']) {
      expect(toolbar.querySelector(`[aria-label="${label}"]`), label).not.toBeNull();
    }
    expect(container.querySelector('[role=textbox]').getAttribute('aria-label')).toBe('Day description');
  });

  it('shows existing formatted text and older plain text, and the character count', async () => {
    const formatted = render(<RichTextEditor value="<p>Hello <strong>world</strong></p>" onChange={() => {}} maxLength={100} />);
    await formatted.findByRole('toolbar');
    expect(formatted.container.querySelector('.rich-editor-content strong').textContent).toBe('world');
    expect(formatted.container.querySelector('.rich-count').textContent).toBe('11 / 100');
    cleanup();

    const plain = render(<RichTextEditor value={'First line\nSecond line'} onChange={() => {}} />);
    await plain.findByRole('toolbar');
    expect(plain.container.querySelector('.rich-editor-content').textContent).toContain('First line');
  });

  it('warns in plain words when the text is too long', async () => {
    const { findByRole, container } = render(<RichTextEditor value={`<p>${'x'.repeat(30)}</p>`} onChange={() => {}} maxLength={20} />);
    await findByRole('toolbar');
    expect(container.querySelector('[role=alert]').textContent).toBe('This text is too long: 30 of 20 characters.');
  });

  it('shows a server message under the field', async () => {
    const { findByRole, container } = render(<RichTextEditor value="" onChange={() => {}} error="Itinerary description is required." />);
    await findByRole('toolbar');
    expect(container.querySelector('[role=alert]').textContent).toBe('Itinerary description is required.');
  });

  it('locks every control when disabled', async () => {
    const { findByRole, container } = render(<RichTextEditor value="<p>x</p>" onChange={() => {}} disabled />);
    await findByRole('toolbar');
    for (const button of container.querySelectorAll('.rich-toolbar button')) expect(button.disabled).toBe(true);
    expect(container.querySelector('.rich-size select').disabled).toBe(true);
  });
});
