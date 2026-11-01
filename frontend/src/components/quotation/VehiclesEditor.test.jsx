import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VehiclesEditor from './VehiclesEditor';
import { DEFAULT_VEHICLE_INCLUSIONS, blankVehicle } from '../../utils/landService';

afterEach(cleanup);

// Holds the quotation the way the builder does, and reports every state it reaches.
const Harness = ({ initial, onState }) => {
  const [quotation, setQuotation] = useState(initial);
  return (
    <VehiclesEditor
      quotation={quotation}
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
const start = (over = {}) => ({ vehicles: [blankVehicle()], landService: {}, vehicleInclusions: [...DEFAULT_VEHICLE_INCLUSIONS], ...over });
const suv = (over = {}) => ({ vehicleType: 'SUV (Innova Crysta)', seats: 7, quantity: 2, acType: 'AC', rate: 18500, notes: '', ...over });

describe('VehiclesEditor', () => {
  it('shows one blank vehicle line, the standard inclusions, and no price until a rate is entered', () => {
    render(<Harness initial={start()} />);
    expect(screen.getByRole('group', { name: 'Vehicle 1' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Vehicle inclusion \d: / })).toHaveLength(4);
    expect(screen.getByText('Total for the trip').parentElement).toHaveTextContent('—');
  });

  it('works out the amount of each line and the total as the user types', async () => {
    render(<Harness initial={start({ vehicles: [suv({ rate: '' })] })} />);
    await userEvent.type(screen.getByLabelText('Rate per vehicle (Rs)'), '18500');
    const row = screen.getByRole('group', { name: 'Vehicle 1' });
    expect(within(row).getByText('Rs 37,000')).toBeInTheDocument(); // 2 vehicles x 18,500
    expect(screen.getByText('Total for the trip').parentElement).toHaveTextContent('Rs 37,000');
    await userEvent.clear(screen.getByLabelText('How many'));
    await userEvent.type(screen.getByLabelText('How many'), '3');
    expect(screen.getByText('Total for the trip').parentElement).toHaveTextContent('Rs 55,500');
  });

  it('adds and removes vehicles, and the total follows', async () => {
    const seen = vi.fn();
    render(<Harness initial={start({ vehicles: [suv()] })} onState={seen} />);
    await userEvent.click(screen.getByRole('button', { name: /add a vehicle/i }));
    expect(screen.getByRole('group', { name: 'Vehicle 2' })).toBeInTheDocument();
    await userEvent.type(screen.getAllByLabelText('Vehicle type')[1], 'Sedan');
    await userEvent.type(screen.getAllByLabelText('Rate per vehicle (Rs)')[1], '9000');
    expect(screen.getByText('Total for the trip').parentElement).toHaveTextContent('Rs 46,000');
    await userEvent.click(screen.getByRole('button', { name: 'Remove vehicle 1' }));
    expect(screen.getAllByRole('group', { name: /^Vehicle \d$/ })).toHaveLength(1);
    expect(screen.getByLabelText('Vehicle type')).toHaveValue('Sedan');
    expect(screen.getByText('Total for the trip').parentElement).toHaveTextContent('Rs 9,000');
    expect(seen.mock.lastCall[0].vehicles).toHaveLength(1);
  });

  it('offers the usual vehicle types as suggestions but accepts anything typed', async () => {
    const seen = vi.fn();
    const { container } = render(<Harness initial={start()} onState={seen} />);
    const options = [...container.querySelectorAll('#vehicle-types option')].map((o) => o.value);
    expect(options).toContain('Tempo Traveller (12 seater)');
    expect(options).toContain('SUV (Innova Crysta)');
    await userEvent.type(screen.getByLabelText('Vehicle type'), 'Vintage Ambassador');
    expect(seen.mock.lastCall[0].vehicles[0].vehicleType).toBe('Vintage Ambassador');
  });

  it('keeps the trip details and the price note', async () => {
    const seen = vi.fn();
    render(<Harness initial={start()} onState={seen} />);
    await userEvent.type(screen.getByLabelText('Route'), 'Delhi - Agra');
    await userEvent.type(screen.getByLabelText('Pick-up point'), 'IGI Airport');
    await userEvent.type(screen.getByLabelText('Kilometre policy'), '250 km per day');
    await userEvent.type(screen.getByLabelText('Price note'), 'GST extra');
    expect(seen.mock.lastCall[0].landService).toEqual({ route: 'Delhi - Agra', pickupPoint: 'IGI Airport', kmPolicy: '250 km per day', priceNote: 'GST extra' });
  });

  it('adds, removes and resets the vehicle inclusions', async () => {
    const seen = vi.fn();
    render(<Harness initial={start()} onState={seen} />);
    await userEvent.click(screen.getByRole('button', { name: /add an inclusion/i }));
    expect(screen.getAllByRole('button', { name: /^Vehicle inclusion \d: / })).toHaveLength(5);
    await userEvent.click(screen.getByRole('button', { name: 'Remove vehicle inclusion 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove vehicle inclusion 1' }));
    expect(seen.mock.lastCall[0].vehicleInclusions).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: /reset to standard/i }));
    expect(seen.mock.lastCall[0].vehicleInclusions).toEqual(DEFAULT_VEHICLE_INCLUSIONS);
  });

  it('says what to do when there is no vehicle or no inclusion', async () => {
    render(<Harness initial={start({ vehicles: [], vehicleInclusions: [] })} />);
    expect(screen.getByText('No vehicle yet. Add one to give a price.')).toBeInTheDocument();
    expect(screen.getByText(/Nothing listed\. Add what the price includes/)).toBeInTheDocument();
  });
});
