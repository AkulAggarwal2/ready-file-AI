// Glossary terms (src/ui/Term.tsx, content/glossary.json): a tap, click, or
// Enter opens a definition; Escape, a tap elsewhere, or moving focus closes it.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { copy, fill } from '../src/content';
import { glossary, glossaryEntry, splitTerms } from '../src/glossary';
import { Glossed, Term } from '../src/ui/Term';
import { renderApp, toStart } from './helpers';

const tipOf = (button: HTMLElement) => document.getElementById(button.getAttribute('aria-describedby')!)!;
const isOpen = (button: HTMLElement) => tipOf(button).hasAttribute('data-popover-open');

describe('content/glossary.json', () => {
  it('has unique ids and match words, and short definitions', () => {
    const ids = glossary.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const matches = glossary.flatMap((e) => e.matches.map((m) => m.toLowerCase()));
    expect(new Set(matches).size).toBe(matches.length);
    for (const entry of glossary) {
      expect(entry.matches.length, entry.id).toBeGreaterThan(0);
      expect(entry.definition.split(/\s+/).length, entry.id).toBeLessThanOrEqual(40);
      expect(entry.source, entry.id).not.toBe('');
    }
  });

  it('defines every ground on the Start screen', () => {
    for (const ground of Object.keys(copy.start.grounds)) expect(() => glossaryEntry(ground)).not.toThrow();
  });
});

describe('splitTerms', () => {
  it('marks only the first mention of each term, whole words only, in any case', () => {
    expect(splitTerms('The Petition is a petition. The petitioner signs it.')).toEqual([
      'The ',
      { id: 'petition', text: 'Petition' },
      ' is a petition. The ',
      { id: 'petitioner', text: 'petitioner' },
      ' signs it.',
    ]);
  });

  it('prefers the longest match and leaves text with no terms alone', () => {
    expect(splitTerms('Domestic or family violence')).toEqual([{ id: 'domestic-violence', text: 'Domestic or family violence' }]);
    expect(splitTerms('Nothing to see here.')).toEqual(['Nothing to see here.']);
  });

  it('skips terms it is told to', () => {
    expect(splitTerms('a hearing', ['hearing'])).toEqual(['a hearing']);
  });
});

describe('Term', () => {
  function renderText() {
    const user = userEvent.setup();
    render(
      <>
        <p>
          <Glossed text="File the petition before the hearing." />
        </p>
        <button type="button">Elsewhere</button>
      </>,
    );
    return user;
  }

  it('keeps the sentence whole and describes the word with its definition', () => {
    renderText();
    expect(screen.getByText(/File the/).closest('p')).toHaveTextContent('File the petition before the hearing.');
    const button = screen.getByRole('button', { name: 'petition' });
    expect(button).toHaveAccessibleDescription(`Petition ${glossaryEntry('petition').definition}`);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(isOpen(button)).toBe(false);
  });

  it('opens on a click or tap and closes on a second one', async () => {
    const user = renderText();
    const button = screen.getByRole('button', { name: 'petition' });
    await user.click(button);
    expect(isOpen(button)).toBe(true);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await user.click(button);
    expect(isOpen(button)).toBe(false);
  });

  it('opens one at a time', async () => {
    const user = renderText();
    const petition = screen.getByRole('button', { name: 'petition' });
    const hearing = screen.getByRole('button', { name: 'hearing' });
    await user.click(petition);
    await user.click(hearing);
    expect(isOpen(petition)).toBe(false);
    expect(isOpen(hearing)).toBe(true);
  });

  it('closes on Escape, a tap elsewhere, or moving focus away', async () => {
    const user = renderText();
    const button = screen.getByRole('button', { name: 'petition' });

    await user.click(button);
    await user.keyboard('{Escape}');
    expect(isOpen(button)).toBe(false);

    await user.click(button);
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(isOpen(button)).toBe(false);

    button.focus();
    await user.keyboard('{Enter}');
    expect(isOpen(button)).toBe(true);
    await user.tab();
    expect(isOpen(button)).toBe(false);
  });

  it('as a "?" button, is named for its term', () => {
    render(<Term id="stalking" />);
    expect(screen.getByRole('button', { name: fill(copy.glossary.iconLabel, { term: 'Stalking' }) })).toBeInTheDocument();
  });
});

describe('Terms in the app', () => {
  it('on the Start screen, the "?" opens a definition without checking the box', async () => {
    const user = renderApp();
    await toStart(user);
    const box = screen.getByRole('checkbox', { name: copy.start.grounds.stalking });
    const help = screen.getByRole('button', { name: fill(copy.glossary.iconLabel, { term: 'Stalking' }) });
    await user.click(help);
    expect(isOpen(help)).toBe(true);
    expect(box).not.toBeChecked();

    // The intro underlines its terms.
    expect(screen.getByRole('button', { name: 'protection order' })).toBeInTheDocument();

    const results = await axe.run(document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
