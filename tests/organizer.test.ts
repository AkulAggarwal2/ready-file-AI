import { describe, expect, it } from 'vitest';
import { LlmExtractor, ManualExtractor, mergeIncidents, createIncident } from '../src/organizer';
import { findDate, splitStory } from '../src/organizer/ManualExtractor';
import { LENA_FOUR_INCIDENTS, LENA_ONE_INCIDENT } from '../src/samples/lena';

describe('splitStory', () => {
  it('makes one incident per paragraph', () => {
    expect(splitStory(LENA_FOUR_INCIDENTS)).toHaveLength(4);
  });

  it('splits inside a paragraph when a sentence starts with a date phrase', () => {
    const story = 'He followed me home from work. Last week he called me ten times. Then in March he came to my door.';
    expect(splitStory(story)).toEqual([
      'He followed me home from work.',
      'Last week he called me ten times.',
      'Then in March he came to my door.',
    ]);
  });

  it('keeps a paragraph whole when no sentence starts with a date phrase', () => {
    expect(splitStory(LENA_ONE_INCIDENT)).toEqual([LENA_ONE_INCIDENT]);
  });

  it('keeps her words unchanged', () => {
    const chunks = splitStory(LENA_FOUR_INCIDENTS);
    expect(chunks.join('\n\n')).toBe(LENA_FOUR_INCIDENTS);
  });

  it('returns nothing for an empty story', () => {
    expect(splitStory('   ')).toEqual([]);
  });
});

describe('findDate', () => {
  it('reads full dates as exact', () => {
    expect(findDate('On March 14, 2025 he came over.')).toEqual({ kind: 'exact', value: '2025-03-14' });
    expect(findDate('It was 3/14/2025.')).toEqual({ kind: 'exact', value: '2025-03-14' });
    expect(findDate('It was 2025-03-14.')).toEqual({ kind: 'exact', value: '2025-03-14' });
  });

  it('reads partial dates as approximate text', () => {
    expect(findDate('On March 14 he came over.')).toEqual({ kind: 'approximate', text: 'March 14' });
    expect(findDate('In early March he left a note.')).toEqual({ kind: 'approximate', text: 'early March' });
    expect(findDate('Two weeks ago he texted me.')).toEqual({ kind: 'approximate', text: 'Two weeks ago' });
  });

  it('does not read "may" the verb as a month', () => {
    expect(findDate('He said he may come back.')).toEqual({ kind: 'unknown' });
  });

  it('rejects impossible dates', () => {
    expect(findDate('It was 2/30/2025.')).toEqual({ kind: 'approximate', text: '2/30/2025' });
  });
});

describe('extractors', () => {
  it('ManualExtractor returns draft incidents with dates found', async () => {
    const incidents = await new ManualExtractor().extract(LENA_FOUR_INCIDENTS);
    expect(incidents.map((i) => i.date)).toEqual([
      { kind: 'approximate', text: 'January' },
      { kind: 'approximate', text: 'February' },
      { kind: 'approximate', text: 'early March' },
      { kind: 'approximate', text: 'March 14' },
    ]);
    expect(new Set(incidents.map((i) => i.id)).size).toBe(4);
  });

  it('LlmExtractor stub returns prepared drafts for the sample and falls back otherwise', async () => {
    const llm = new LlmExtractor();
    const sample = await llm.extract(LENA_FOUR_INCIDENTS);
    expect(sample.map((i) => i.how)).toEqual(['in-person', 'phone-or-text', 'other', 'in-person']);

    const other = await llm.extract('He called me.\n\nHe texted me.');
    expect(other.map((i) => i.description)).toEqual(['He called me.', 'He texted me.']);
  });
});

describe('mergeIncidents', () => {
  it('joins descriptions and evidence and keeps the first known date and type', () => {
    const merged = mergeIncidents(
      createIncident({ description: 'First.', evidence: 'Photo' }),
      createIncident({ description: 'Second.', date: { kind: 'approximate', text: 'May 2' }, how: 'online' }),
    );
    expect(merged).toMatchObject({
      description: 'First.\n\nSecond.',
      evidence: 'Photo',
      date: { kind: 'approximate', text: 'May 2' },
      how: 'online',
    });
  });
});
