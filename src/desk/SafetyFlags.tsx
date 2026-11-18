import { copy, safetyQuestions } from '../content';
import { deskCopy } from './content';
import { reportedFlags } from './flags';
import type { Petition } from './model';

/** "Review promptly" and a chip per "yes" answer, or "None reported". */
export function SafetyFlags({ petition }: { petition: Petition }) {
  const c = deskCopy.flags;
  const flags = reportedFlags(petition);
  if (flags.length === 0) return <span className="meta">{c.noneReported}</span>;
  return (
    <ul className="reported-chips" aria-label={c.reported}>
      <li className="reported-chip reported-chip-lead">{c.reviewPromptly}</li>
      {flags.map((q) => (
        <li key={q.id} className="reported-chip">
          {q.staffLabel}
        </li>
      ))}
    </ul>
  );
}

/** Every safety question with the petitioner's answer, word for word. */
export function SafetyAnswersPanel({ petition, as: Heading = 'h2' }: { petition: Petition; as?: 'h2' | 'h3' }) {
  const c = deskCopy.flags;
  const answers = petition.sample.safetyAnswers;
  const id = `safety-answers-${petition.sample.id}`;
  return (
    <section className="panel safety-answers" aria-labelledby={id}>
      <Heading id={id} className={Heading === 'h2' ? 'panel-title' : undefined}>
        {c.answersTitle}
      </Heading>
      <p className="meta">{c.answersIntro}</p>
      <dl className="answers">
        {safetyQuestions.map((q) => {
          const answer = answers[q.id];
          return (
            <div key={q.id} className={answer === 'yes' ? 'answer-yes' : undefined}>
              <dt>{q.question}</dt>
              <dd>{answer ? copy.safety.answers[answer] : c.noAnswer}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
