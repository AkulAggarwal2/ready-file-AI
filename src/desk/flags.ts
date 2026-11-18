// Safety flags. They show only what the petitioner reported in answer to the
// optional safety questions. Desk never scores, ranks, or reorders by them.
import { safetyQuestions, type SafetyQuestion } from '../content';
import type { Petition } from './model';

/** The safety questions the petitioner answered "yes", in question order. */
export function reportedFlags(p: Petition): SafetyQuestion[] {
  return safetyQuestions.filter((q) => p.sample.safetyAnswers[q.id] === 'yes');
}
