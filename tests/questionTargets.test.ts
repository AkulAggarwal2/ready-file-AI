import { describe, expect, it } from 'vitest';
import type { Finding } from '../src/checker';
import { addMoreAction } from '../src/steps/questionTargets';

const relationship = { key: 'rel', conditionType: 'relationshipNotHousehold' } as Finding;
const feeling = { key: 'feel', conditionType: 'feelingMissing' } as Finding;

describe('addMoreAction', () => {
  it('leads back to the questions only from a question', () => {
    expect(addMoreAction(relationship, undefined)).toMatchObject({ returnTo: 'questions', returnQuestion: 'rel' });
    const fromChip = addMoreAction(relationship, undefined, false);
    expect(fromChip).toMatchObject({ step: 'start' });
    expect(fromChip).not.toHaveProperty('returnTo', 'questions');
  });

  it('opens the given incident for a question about all incidents', () => {
    expect(addMoreAction(feeling, 'i2', false)).toMatchObject({ expandId: 'i2' });
  });
});
