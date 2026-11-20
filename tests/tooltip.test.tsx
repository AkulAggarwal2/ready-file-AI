// The shared tooltip (src/ui/Tooltip.tsx): hover and keyboard focus show it,
// taps don't, and Escape closes it (WCAG 1.4.13).
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from '../src/ui/Tooltip';

function renderTwo() {
  const user = userEvent.setup();
  render(
    <>
      <span id="hint">Existing hint</span>
      <Tooltip text="First tip">
        <button type="button" aria-describedby="hint">
          First
        </button>
      </Tooltip>
      <Tooltip text="Second tip">
        <button type="button">Second</button>
      </Tooltip>
    </>,
  );
  return user;
}

const shown = (text: string) => screen.getByText(text).hasAttribute('data-popover-open');

afterEach(() => {
  vi.useRealTimers();
});

describe('Tooltip', () => {
  it('describes its button, keeping any existing description', () => {
    renderTwo();
    const button = screen.getByRole('button', { name: 'First' });
    expect(button).toHaveAccessibleDescription('Existing hint First tip');
    expect(screen.getByText('First tip')).toHaveAttribute('role', 'tooltip');
    expect(shown('First tip')).toBe(false);
  });

  it('opens on keyboard focus and closes on Escape, keeping focus', async () => {
    const user = renderTwo();
    await user.tab();
    expect(shown('First tip')).toBe(true);
    await user.keyboard('{Escape}');
    expect(shown('First tip')).toBe(false);
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('opens on hover after a delay, but not on a tap', () => {
    vi.useFakeTimers();
    renderTwo();
    const button = screen.getByRole('button', { name: 'First' });

    fireEvent.pointerEnter(button, { pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(1000));
    expect(shown('First tip')).toBe(false);

    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(100));
    expect(shown('First tip')).toBe(false);
    act(() => vi.advanceTimersByTime(400));
    expect(shown('First tip')).toBe(true);
  });

  it('stays open while the pointer moves onto the tooltip', () => {
    vi.useFakeTimers();
    renderTwo();
    const button = screen.getByRole('button', { name: 'First' });
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(500));

    fireEvent.pointerLeave(button, { pointerType: 'mouse' });
    fireEvent.pointerEnter(screen.getByText('First tip'), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(500));
    expect(shown('First tip')).toBe(true);

    fireEvent.pointerLeave(screen.getByText('First tip'), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(500));
    expect(shown('First tip')).toBe(false);
  });

  it('shows one tooltip at a time', async () => {
    const user = renderTwo();
    await user.tab();
    expect(shown('First tip')).toBe(true);
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Second' }), { pointerType: 'mouse' });
    await act(() => new Promise((resolve) => setTimeout(resolve, 450)));
    expect(shown('Second tip')).toBe(true);
    expect(shown('First tip')).toBe(false);
  });

  it('leaves a disabled button alone', () => {
    render(
      <Tooltip text="Never shown">
        <button type="button" disabled>
          Off
        </button>
      </Tooltip>,
    );
    expect(screen.queryByText('Never shown')).toBeNull();
    expect(screen.getByRole('button', { name: 'Off' })).not.toHaveAttribute('aria-describedby');
  });

  it('can name an icon button', () => {
    render(
      <Tooltip text="Dark mode" labels>
        <button type="button" role="switch" aria-checked={false}>
          <svg aria-hidden="true" />
        </button>
      </Tooltip>,
    );
    expect(screen.getByRole('switch', { name: 'Dark mode' })).toBeInTheDocument();
  });
});
