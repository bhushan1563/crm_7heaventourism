import React, { useState } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PriceTablesEditor from './PriceTablesEditor';
import { blankTable } from '../../utils/priceTables';

afterEach(cleanup);

// Holds the tables the way the builder does, and reports every state it reaches.
const Harness = ({ initial, onState }) => {
  const [tables, setTables] = useState(initial);
  return (
    <PriceTablesEditor
      tables={tables}
      onChange={(next) => {
        setTables(next);
        onState?.(next);
      }}
    />
  );
};
const start = () => [blankTable('Option 1'), blankTable('Option 2')];
const field = (title, row, option = 'Option 1') => screen.getByLabelText(`${title} of ${row} in ${option}`);

describe('PriceTablesEditor', () => {
  it('starts like the company sheet: Option 1 and Option 2, each with Adult, Extra bed, CWB and CNB and the columns of the sheet', () => {
    render(<Harness initial={start()} />);
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Option 1', 'Option 2']);
    const first = screen.getByRole('region', { name: 'Option 1' });
    expect(within(first).getAllByRole('columnheader').map((h) => h.textContent.trim()).filter(Boolean)).toEqual(['Sr No', 'Package', 'Airfare', 'Visa', 'TCS', 'Total', 'PAX', 'Final Price', 'Remove the row']); // the last one is only for screen readers
    expect(within(first).getAllByRole('textbox').map((t) => t.value)).toEqual(['Option 1', 'Adult', 'Extra bed', 'CWB', 'CNB']); // the option's own name, then the rows
    expect(within(first).getByText('Grand Total')).toBeInTheDocument();
  });

  it('works out each Total, each Final Price and the Grand Total as the amounts are typed', async () => {
    const seen = vi.fn();
    render(<Harness initial={start()} onState={seen} />);
    await userEvent.type(field('Package', 'Adult'), '30000');
    await userEvent.type(field('Airfare', 'Adult'), '12000');
    await userEvent.type(field('Visa', 'Adult'), '6000');
    await userEvent.type(field('TCS', 'Adult'), '1500');
    expect(screen.getByLabelText('Total of Adult in Option 1')).toHaveTextContent('49,500');
    expect(screen.getByLabelText('Final Price of Adult in Option 1')).toHaveTextContent('', 'no PAX yet, so no price');
    await userEvent.type(field('PAX', 'Adult'), '2');
    expect(screen.getByLabelText('Final Price of Adult in Option 1')).toHaveTextContent('99,000');
    await userEvent.type(field('Package', 'CWB'), '20000');
    await userEvent.type(field('PAX', 'CWB'), '1');
    const first = screen.getByRole('region', { name: 'Option 1' });
    expect(within(first).getByText('Rs 1,19,000')).toBeInTheDocument(); // 99,000 + 20,000
    const second = screen.getByRole('region', { name: 'Option 2' });
    expect(within(second).getByText('Rs 0')).toBeInTheDocument();
    expect(seen.mock.lastCall[0][0].rows[0]).toMatchObject({ package: '30000', airfare: '12000', visa: '6000', tcs: '1500', pax: '2' });
  });

  it('adds, renames, copies and removes options', async () => {
    const seen = vi.fn();
    render(<Harness initial={start()} onState={seen} />);
    await userEvent.click(screen.getByRole('button', { name: /Add an option/ }));
    expect(seen.mock.lastCall[0].map((t) => t.name)).toEqual(['Option 1', 'Option 2', 'Option 3']);
    await userEvent.clear(screen.getByLabelText('Name of option 1'));
    await userEvent.type(screen.getByLabelText('Name of option 1'), 'Taj Exotica');
    expect(screen.getByRole('region', { name: 'Taj Exotica' })).toBeInTheDocument();
    await userEvent.type(field('Package', 'Adult', 'Taj Exotica'), '5000');
    await userEvent.click(screen.getByRole('button', { name: 'Copy Taj Exotica' }));
    const names = seen.mock.lastCall[0].map((t) => t.name);
    expect(names.slice(0, 2)).toEqual(['Taj Exotica', 'Taj Exotica (copy)']);
    expect(seen.mock.lastCall[0][1].rows[0].package).toBe('5000');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Taj Exotica (copy)' }));
    expect(seen.mock.lastCall[0].map((t) => t.name)).toEqual(['Taj Exotica', 'Option 2', 'Option 3']);
  });

  it('always keeps at least one option, and at most six', async () => {
    const { unmount } = render(<Harness initial={[blankTable('Only')]} />);
    expect(screen.getByRole('button', { name: 'Remove Only' })).toBeDisabled();
    unmount();
    render(<Harness initial={Array.from({ length: 6 }, (_, i) => blankTable(`O${i + 1}`))} />);
    expect(screen.getByRole('button', { name: /Add an option/ })).toBeDisabled();
  });

  it('adds, renames and removes rows, keeping at least one', async () => {
    const seen = vi.fn();
    render(<Harness initial={[blankTable('Option 1')]} onState={seen} />);
    await userEvent.click(screen.getByRole('button', { name: /Add a row/ }));
    expect(seen.mock.lastCall[0][0].rows).toHaveLength(5);
    await userEvent.type(screen.getByLabelText('Name of row 5 in Option 1'), 'Infant');
    await userEvent.type(field('Package', 'Infant'), '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Infant from Option 1' }));
    expect(seen.mock.lastCall[0][0].rows.map((r) => r.label)).toEqual(['Adult', 'Extra bed', 'CWB', 'CNB']);
    for (const label of ['CNB', 'CWB', 'Extra bed']) await userEvent.click(screen.getByRole('button', { name: `Remove ${label} from Option 1` }));
    expect(screen.getByRole('button', { name: 'Remove Adult from Option 1' })).toBeDisabled();
  });

  it('explains the layout in plain words', () => {
    render(<Harness initial={start()} />);
    const hint = document.querySelector('.pt-hint');
    expect(hint).toHaveTextContent('Total is Package + Airfare + Visa + TCS, Final Price is Total × PAX');
    expect(hint).toHaveTextContent('An option with nothing entered is not printed');
    expect(hint).toHaveTextContent('worked out for you as you type');
  });

  it('is always the sheet: one table per option, never a stack of boxes', () => {
    render(<Harness initial={start()} />);
    const first = screen.getByRole('region', { name: 'Option 1' });
    expect(first.querySelectorAll('table')).toHaveLength(1);
    expect(first.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(first.querySelector('.pt-chip')).toBeNull();
    const css = fs.readFileSync(path.resolve(__dirname, './priceTables.css'), 'utf8');
    expect(css).not.toMatch(/@container|display:\s*grid/); // no layout that turns the rows into cards
  });

  it('has no text that is only for screen readers showing on screen: that style is in the global style sheet, which every page loads', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toMatch(/\.sr-only\s*\{[^}]*clip:\s*rect\(0, 0, 0, 0\)/);
  });
});
