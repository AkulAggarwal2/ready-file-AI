import { describe, expect, it } from 'vitest';
import { createIncident } from '../src/organizer';
import { initialState, reducer, type AppState } from '../src/state/appState';

describe('returning after "Add more"', () => {
  const onQuestions: AppState = { ...initialState, caseType: 'domestic-violence', step: 'questions' };

  it('goes back to the questions after she changes her answer on Start', () => {
    const onStart = reducer(onQuestions, {
      type: 'addMore',
      step: 'start',
      focusTarget: 'relationship',
      returnTo: 'questions',
    });
    expect(onStart.step).toBe('start');

    const after = reducer(onStart, { type: 'begin', caseType: 'stalking', relationship: 'none' });
    expect(after).toMatchObject({ step: 'questions', caseType: 'stalking', relationship: 'none', returnTo: null });
  });

  it('goes on to the incidents when she starts normally', () => {
    expect(reducer(initialState, { type: 'begin', caseType: 'stalking', relationship: null }).step).toBe('incidents');
  });

  it('forgets the way back if she leaves Start another way', () => {
    const onStart = reducer(onQuestions, { type: 'addMore', step: 'start', focusTarget: 'relationship', returnTo: 'questions' });
    const elsewhere = reducer(reducer(onStart, { type: 'goTo', step: 'incidents' }), { type: 'goTo', step: 'start' });
    expect(reducer(elsewhere, { type: 'begin', caseType: 'stalking', relationship: null }).step).toBe('incidents');
  });
});

describe('spoken answers on an incident', () => {
  const withIncidents: AppState = {
    ...initialState,
    incidents: [
      { ...createIncident({ place: 'outside', description: 'He called.' }), id: 'one' },
      { ...createIncident({ place: 'his house' }), id: 'two' },
    ],
  };
  const incident = (state: AppState, id: string) => state.incidents.find((item) => item.id === id);

  it('adds a place as words, after what is there', () => {
    const after = reducer(withIncidents, { type: 'appendToIncident', id: 'one', field: 'place', phrase: 'my work.' });
    expect(incident(after, 'one')?.place).toBe('outside my work');
  });

  it('adds other answers as sentences, never changing what is there', () => {
    const after = reducer(withIncidents, {
      type: 'appendToIncident',
      id: 'one',
      field: 'description',
      phrase: 'he followed me',
    });
    expect(incident(after, 'one')?.description).toBe('He called. he followed me.');
  });

  it('changes only that incident', () => {
    const after = reducer(withIncidents, { type: 'appendToIncident', id: 'one', field: 'place', phrase: 'my work' });
    expect(incident(after, 'two')).toEqual(incident(withIncidents, 'two'));
  });
});

describe('one incident open at a time', () => {
  const withTwo = reducer(reducer(initialState, { type: 'addIncident' }), { type: 'addIncident' });

  it('opens only the newest incident', () => {
    expect(withTwo.expanded).toEqual([withTwo.incidents[1].id]);
  });

  it('opening one closes the other', () => {
    const first = withTwo.incidents[0].id;
    expect(reducer(withTwo, { type: 'toggleIncident', id: first }).expanded).toEqual([first]);
  });

  it('starts a new incident on the date picker', () => {
    expect(withTwo.incidents[0].date).toEqual({ kind: 'exact', value: '' });
  });
});

describe('the way back to a question', () => {
  const sent = reducer(initialState, { type: 'addMore', focusTarget: 'x', returnQuestion: 'q1' });

  it('is kept until the Questions step uses it', () => {
    const back = reducer(sent, { type: 'backToQuestion' });
    expect(back).toMatchObject({ step: 'questions', returnQuestion: 'q1' });
    expect(reducer(back, { type: 'questionReturned' }).returnQuestion).toBeNull();
  });

  it('is forgotten if she moves on another way', () => {
    expect(reducer(sent, { type: 'goTo', step: 'story' }).returnQuestion).toBeNull();
  });
});

describe('chips on the Incidents step keep the way back', () => {
  const sent = reducer(initialState, { type: 'addMore', focusTarget: 'x', returnQuestion: 'q1' });

  it('keeps it when a chip opens another field', () => {
    expect(reducer(sent, { type: 'addMore', focusTarget: 'y' }).returnQuestion).toBe('q1');
  });

  it('keeps it through Start, then returns to the incidents', () => {
    const onStart = reducer(sent, { type: 'addMore', step: 'start', focusTarget: 'relationship' });
    const after = reducer(onStart, { type: 'begin', caseType: 'stalking', relationship: 'none' });
    expect(after).toMatchObject({ step: 'incidents', returnQuestion: 'q1' });
  });
});
