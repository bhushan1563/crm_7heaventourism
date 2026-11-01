import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FormattedLine from './FormattedLine';

afterEach(cleanup);

const line = (props = {}) => {
  const onChange = vi.fn();
  const view = render(<FormattedLine value="" onChange={onChange} ariaLabel="Inclusion 1" placeholder="Inclusion item..." {...props} />);
  return { onChange, ...view };
};

describe('FormattedLine', () => {
  it('shows the placeholder when empty, and the text when it has some', () => {
    line();
    expect(screen.getByText('Inclusion item...')).toBeInTheDocument();
    cleanup();
    line({ value: 'Daily breakfast' });
    expect(screen.getByRole('button', { name: /Inclusion 1: Daily breakfast\. Press to edit and format/ })).toBeInTheDocument();
  });

  it('shows formatted text with its formatting, and plain text containing angle brackets exactly as typed', () => {
    const { container } = line({ value: '<p>Daily <strong>breakfast</strong> <span style="color:#dc2626">red</span></p>' });
    expect(container.querySelector('strong').textContent).toBe('breakfast');
    expect(container.querySelector('span[style]').getAttribute('style')).toContain('color:#dc2626');
    cleanup();
    const plain = line({ value: 'Price: <TBC> per pax' });
    expect(plain.container.textContent).toBe('Price: <TBC> per pax');
    expect(plain.container.querySelector('TBC')).toBeNull();
  });

  it('never runs script or keeps handlers, even if a bad value reaches the page', () => {
    const { container } = line({ value: '<p onclick="steal()">hi</p><script>window.__pwned = 1</script>' });
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toMatch(/onclick/i);
    expect(window.__pwned).toBeUndefined();
  });

  it('opens the formatting toolbar for that line when pressed', async () => {
    line({ value: 'Daily breakfast' });
    await userEvent.click(screen.getByRole('button', { name: /Press to edit and format/ }));
    const toolbar = await screen.findByRole('toolbar', { name: 'Text formatting' }, { timeout: 8000 });
    for (const label of ['Bold', 'Font size', 'Text colour', 'Highlight']) expect(toolbar.querySelector(`[aria-label="${label}"]`), label).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Inclusion 1' })).toBeInTheDocument();
  });

  it('turns text with no formatting back into plain text when the user leaves the line', async () => {
    const { onChange } = line({ value: '<p>Hello there</p>' });
    await userEvent.click(screen.getByRole('button', { name: /Press to edit and format/ }));
    await screen.findByRole('toolbar');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Inclusion 1' }), { key: 'Escape' });
    expect(onChange).toHaveBeenCalledWith('Hello there');
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('leaves formatted text, and text that is already plain, untouched when the user leaves the line', async () => {
    const formatted = line({ value: '<p><strong>Bold</strong></p>' });
    await userEvent.click(screen.getByRole('button', { name: /Press to edit and format/ }));
    await screen.findByRole('toolbar');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Inclusion 1' }), { key: 'Escape' });
    expect(formatted.onChange).not.toHaveBeenCalled();
    cleanup();

    const plain = line({ value: 'Plain text' });
    await userEvent.click(screen.getByRole('button', { name: /Press to edit and format/ }));
    await screen.findByRole('toolbar');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Inclusion 1' }), { key: 'Escape' });
    expect(plain.onChange).not.toHaveBeenCalled();
  });

  it('cannot be opened when disabled', async () => {
    line({ value: 'Locked', disabled: true });
    const button = screen.getByRole('button', { name: /Press to edit and format/ });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});
