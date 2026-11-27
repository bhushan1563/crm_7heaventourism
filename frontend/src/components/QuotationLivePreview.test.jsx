import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import QuotationLivePreview from './QuotationLivePreview';

afterEach(cleanup);

const quotation = (over = {}) => ({
  quotationType: 'Package', quotationNo: '7H-QT-1', destination: 'Uttarakhand', duration: '1 Night / 2 Days',
  itinerary: [{ title: 'Arrival', description: '<p>Transfer</p>' }],
  packageDetails: { hotels: [{ hotelName: 'Hotel Ganga', city: 'Haridwar', nights: '1 Night' }], inclusions: ['Breakfast'] },
  pricing: {}, ...over
});

describe('the live preview of the builder', () => {
  it('keeps its full height inside the scrolling pane, so every page can be scrolled to', () => {
    const { getByTestId } = render(<QuotationLivePreview quotation={quotation()} section="overview" />);
    expect(getByTestId('live-preview-pages')).toHaveStyle({ flexShrink: '0' }); // shrinking, it showed only the cover and could not be scrolled
  });

  it('shows a change the moment it is made', () => {
    const { container, rerender } = render(<QuotationLivePreview quotation={quotation()} section="package" />);
    expect(container.querySelector('#quotation-live-render-view-stay')).toHaveTextContent('Hotel Ganga');
    rerender(<QuotationLivePreview quotation={quotation({ packageDetails: { hotels: [{ hotelName: 'Hotel Yamuna', city: 'Haridwar' }], inclusions: [] } })} section="package" />);
    expect(container.querySelector('#quotation-live-render-view-stay')).toHaveTextContent('Hotel Yamuna');
    expect(container).not.toHaveTextContent('Hotel Ganga');
  });

  it('moves its own pane to the part of the document the open tab fills in', () => {
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      const top = this.id?.endsWith('-stay') ? 2400 : this.id?.endsWith('-days') ? 900 : 100;
      return { top, left: 0, right: 0, bottom: top, width: 0, height: 0 };
    });
    const { container, rerender } = render(<QuotationLivePreview quotation={quotation()} section="overview" />);
    const pane = container.querySelector('.rs-builder-preview');
    expect(pane.scrollTop).toBe(0);
    rerender(<QuotationLivePreview quotation={quotation()} section="package" />);
    expect(pane.scrollTop).toBe(2300);
    rerender(<QuotationLivePreview quotation={quotation()} section="overview" />);
    expect(pane.scrollTop).toBe(0);
    spy.mockRestore();
  });

  it('stays where it is for a tab whose part is not in the document yet', () => {
    const { container, rerender } = render(<QuotationLivePreview quotation={quotation()} section="overview" />);
    rerender(<QuotationLivePreview quotation={quotation()} section="flights" />);
    expect(container.querySelector('.rs-builder-preview').scrollTop).toBe(0);
  });

  it('highlights the open tab, then whichever jump button was pressed', () => {
    render(<QuotationLivePreview quotation={quotation()} section="overview" />);
    const weight = (name) => screen.getByRole('button', { name }).style.fontWeight;
    expect(weight('Cover')).toBe('700');
    fireEvent.click(screen.getByRole('button', { name: 'Hotels' }));
    expect(weight('Hotels')).toBe('700');
    expect(weight('Cover')).toBe('500');
  });
});
