import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VisaEditor from './VisaEditor';
import { STANDARD_DOCUMENTS, blankFee } from '../../utils/visa';

afterEach(cleanup);

// Holds the quotation the way the builder does, and reports every state it reaches.
const Harness = ({ initial, section, onState }) => {
  const [quotation, setQuotation] = useState(initial);
  return (
    <VisaEditor
      quotation={quotation}
      section={section}
      onChange={(patch) => {
        setQuotation((q) => {
          const next = { ...q, ...patch };
          onState?.(next);
          return next;
        });
      }}
    />
  );
};
const start = (over = {}) => ({ visa: { applicants: 3 }, visaFees: [blankFee('Visa fee'), blankFee('Service charge')], visaDocuments: [], visaInclusions: [], ...over });
const fee = (over = {}) => ({ label: 'Visa fee', amount: 6500, per: 'applicant', ...over });

describe('VisaEditor: visa & documents', () => {
  it('keeps what is typed about the visa, and the entry type from the list', async () => {
    const seen = vi.fn();
    render(<Harness initial={start()} section="details" onState={seen} />);
    await userEvent.type(screen.getByLabelText('Country *'), 'Singapore');
    await userEvent.type(screen.getByLabelText('Visa type'), 'Tourist');
    await userEvent.selectOptions(screen.getByLabelText('Entry type'), 'Multiple entry');
    await userEvent.type(screen.getByLabelText('Processing time'), '3 working days');
    expect(seen.mock.lastCall[0].visa).toMatchObject({ country: 'Singapore', visaType: 'Tourist', entryType: 'Multiple entry', processingTime: '3 working days', applicants: 3 });
  });

  it('offers the usual visa types as suggestions but accepts anything typed', async () => {
    const seen = vi.fn();
    const { container } = render(<Harness initial={start()} section="details" onState={seen} />);
    expect([...container.querySelectorAll('#visa-types option')].map((o) => o.value)).toContain('Tourist');
    expect([...container.querySelectorAll('#visa-modes option')].map((o) => o.value)).toContain('e-Visa');
    await userEvent.type(screen.getByLabelText('Visa type'), 'Pilgrimage');
    expect(seen.mock.lastCall[0].visa.visaType).toBe('Pilgrimage');
  });

  it('starts with an empty documents checklist that says what to do', () => {
    render(<Harness initial={start()} section="details" />);
    expect(screen.getByText('Documents required (0)')).toBeInTheDocument();
    expect(screen.getByText(/No document listed yet/)).toBeInTheDocument();
  });

  it('adds the standard checklist once, keeps the user\'s own lines, and lets any line be removed', async () => {
    const seen = vi.fn();
    render(<Harness initial={start({ visaDocuments: ['Signed form of the embassy'] })} section="details" onState={seen} />);
    await userEvent.click(screen.getByRole('button', { name: /add the standard checklist/i }));
    expect(seen.mock.lastCall[0].visaDocuments).toEqual(['Signed form of the embassy', ...STANDARD_DOCUMENTS]);
    await userEvent.click(screen.getByRole('button', { name: /add the standard checklist/i }));
    expect(seen.mock.lastCall[0].visaDocuments).toHaveLength(1 + STANDARD_DOCUMENTS.length);
    await userEvent.click(screen.getByRole('button', { name: 'Remove document 1' }));
    expect(seen.mock.lastCall[0].visaDocuments).toEqual(STANDARD_DOCUMENTS);
  });

  it('adds a blank document line', async () => {
    const seen = vi.fn();
    render(<Harness initial={start()} section="details" onState={seen} />);
    await userEvent.click(screen.getByRole('button', { name: /add a document/i }));
    expect(seen.mock.lastCall[0].visaDocuments).toEqual(['']);
    expect(screen.getByText('Documents required (1)')).toBeInTheDocument();
  });
});

describe('VisaEditor: fees & services', () => {
  it('shows the fees to fill in and no price until amounts are entered', () => {
    render(<Harness initial={start()} section="fees" />);
    expect(screen.getByRole('group', { name: 'Fee 1' })).toBeInTheDocument();
    expect(screen.getByLabelText('Fee', { selector: '#fee-label-0' })).toHaveValue('Visa fee');
    expect(screen.getByText(/Total for 3 applicants/).parentElement).toHaveTextContent('—');
  });

  it('multiplies a per-applicant fee by the applicants and charges a group fee once, as the user types', async () => {
    render(<Harness initial={start({ visaFees: [fee({ amount: '' }), fee({ label: 'Courier', amount: '', per: 'group' })] })} section="fees" />);
    await userEvent.type(document.querySelector('#fee-amount-0'), '6500');
    await userEvent.type(document.querySelector('#fee-amount-1'), '800');
    expect(within(screen.getByRole('group', { name: 'Fee 1' })).getByText('Rs 19,500')).toBeInTheDocument(); // 3 x 6,500
    expect(within(screen.getByRole('group', { name: 'Fee 2' })).getByText('Rs 800')).toBeInTheDocument();
    expect(screen.getByText(/Total for 3 applicants/).parentElement).toHaveTextContent('Rs 20,300');
    await userEvent.selectOptions(document.querySelector('#fee-per-1'), 'applicant');
    expect(screen.getByText(/Total for 3 applicants/).parentElement).toHaveTextContent('Rs 21,900'); // 19,500 + 3 x 800
  });

  it('says "1 applicant" in the singular', () => {
    render(<Harness initial={start({ visa: { applicants: 1 }, visaFees: [fee()] })} section="fees" />);
    expect(screen.getByText(/Total for 1 applicant$/)).toBeInTheDocument();
  });

  it('adds and removes fees, and the total follows', async () => {
    const seen = vi.fn();
    render(<Harness initial={start({ visaFees: [fee()] })} section="fees" onState={seen} />);
    await userEvent.click(screen.getByRole('button', { name: /add a fee/i }));
    await userEvent.type(document.querySelector('#fee-label-1'), 'Service charge');
    await userEvent.type(document.querySelector('#fee-amount-1'), '1000');
    expect(screen.getByText(/Total for 3 applicants/).parentElement).toHaveTextContent('Rs 22,500');
    await userEvent.click(screen.getByRole('button', { name: 'Remove fee 1' }));
    expect(screen.getAllByRole('group', { name: /^Fee \d$/ })).toHaveLength(1);
    expect(seen.mock.lastCall[0].visaFees).toHaveLength(1);
    expect(screen.getByText(/Total for 3 applicants/).parentElement).toHaveTextContent('Rs 3,000');
  });

  it('keeps the price note, and the visa inclusions can be added and removed', async () => {
    const seen = vi.fn();
    render(<Harness initial={start()} section="fees" onState={seen} />);
    await userEvent.type(screen.getByLabelText('Price note'), 'GST extra');
    expect(seen.mock.lastCall[0].visa.priceNote).toBe('GST extra');
    expect(screen.getByText(/Nothing listed\. Add what the price includes/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /add an inclusion/i }));
    expect(seen.mock.lastCall[0].visaInclusions).toEqual(['']);
    await userEvent.click(screen.getByRole('button', { name: 'Remove inclusion 1' }));
    expect(seen.mock.lastCall[0].visaInclusions).toEqual([]);
  });

  it('says what to do when there is no fee', () => {
    render(<Harness initial={start({ visaFees: [] })} section="fees" />);
    expect(screen.getByText(/No fee yet\. Add the visa fee and your service charge/)).toBeInTheDocument();
  });
});
