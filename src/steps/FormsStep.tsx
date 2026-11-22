import { useState } from 'react';
import { copy, fill } from '../content';
import { courtForm } from '../forms';
import {
  isShown,
  missingRequired,
  visibleAnswers,
  questionnaires,
  type Answer,
  type EarlierAnswers,
  type Field,
  type Section,
} from '../forms/questionnaire';
import { routeState, routing } from '../forms/routing';
import { childRole } from '../forms/variant';
import { printable, unprintable } from '../pdf/printable';
import { useAppState } from '../state/AppStateProvider';
import { StepHeading } from '../ui/StepHeading';

const domId = (id: string) => `f-${id.replace(/[^\w-]/g, '-')}`;

/**
 * The questionnaire her situation leads to (routing.json names it).
 */
function useQuestionnaire() {
  const { state } = useAppState();
  const where = routeState(state.route);
  const id = 'outcome' in where ? routing.outcomes[where.outcome].questionnaire : undefined;
  return questionnaires[id ?? 'petition-adult'];
}

/**
 * Asks the rest of what the court forms need, one section at a time, in each
 * form's order, then makes the filled PDF.
 */
export function FormsStep() {
  const { state, dispatch } = useAppState();
  const questionnaire = useQuestionnaire();
  const total = questionnaire.sections.length;
  const index = Math.min(state.formSection, total);
  const c = copy.forms;
  const go = (i: number) => dispatch({ type: 'setFormSection', index: i });

  return (
    <div>
      <nav aria-label={c.sectionsLabel}>
        <details className="disclosure section-nav">
          <summary>{c.sectionsSummary}</summary>
          <ol>
          {questionnaire.sections.map((section, i) => (
            <li key={section.id}>
              <button type="button" className="link-button" aria-current={i === index ? 'step' : undefined} onClick={() => go(i)}>
                {section.title}
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="link-button" aria-current={index === total ? 'step' : undefined} onClick={() => go(total)}>
              {c.downloadHeading}
            </button>
          </li>
          </ol>
        </details>
      </nav>

      {index < total ? (
        <SectionForm key={questionnaire.sections[index].id} section={questionnaire.sections[index]} n={index + 1} total={total} />
      ) : (
        <Download key="download" />
      )}

      <div className="button-row">
        {index > 0 && (
          <button type="button" className="btn" onClick={() => go(index - 1)}>
            {c.back}
          </button>
        )}
        {index < total && (
          <button type="button" className="btn btn-primary" onClick={() => go(index + 1)}>
            {index === total - 1 ? c.toDownload : c.next}
          </button>
        )}
      </div>
    </div>
  );
}

function useEarlier(): EarlierAnswers {
  const { state } = useAppState();
  return { relationship: state.relationship, convicted: state.convicted, grounds: state.grounds, childRole: childRole(state.route) };
}

function SectionForm({ section, n, total }: { section: Section; n: number; total: number }) {
  const { state } = useAppState();
  const earlier = useEarlier();
  const c = copy.forms;
  const form = courtForm(section.form);
  const questionnaire = useQuestionnaire();
  const visible = visibleAnswers(questionnaire, state.answers, earlier);
  const shown = section.fields.filter((field) => isShown(field, visible, earlier));

  return (
    <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
      <p className="hint">
        {fill(c.sectionOf, { n, total })} · {fill(c.formLabel, { number: form.number ?? '' })}
      </p>
      <StepHeading>{section.title}</StepHeading>
      {n === 1 && <p>{c.intro}</p>}
      {section.intro && <p>{section.intro}</p>}
      {shown.map((field) => (
        <FieldInput key={field.id} field={field} />
      ))}
    </form>
  );
}

function Hint({ field, id }: { field: Field; id: string }) {
  const c = copy.forms;
  if (!field.hint && !field.private && !field.required) return null;
  return (
    <p id={id} className="hint">
      {field.required && <span className="required-tag">{c.required}. </span>}
      {field.hint}
      {field.private && <> {c.private}</>}
    </p>
  );
}

/** A warning under a field whose text has letters the court's PDF can't print. */
function PrintWarning({ id, value, long }: { id: string; value: string; long?: boolean }) {
  const letters = unprintable(value);
  if (letters.length === 0) return null;
  const c = copy.forms;
  return (
    <p id={id} className="note print-warning">
      {fill(long ? c.unprintableLong : c.unprintable, { letters: letters.join(' '), shown: printable(value.trim()) })}
    </p>
  );
}

function FieldInput({ field }: { field: Field }) {
  const { state, dispatch } = useAppState();
  const c = copy.forms;
  const id = domId(field.id);
  const hintId = `${id}-hint`;
  const value = state.answers[field.id];
  const warnId = `${id}-print`;
  const warns = typeof value === 'string' && unprintable(value).length > 0;
  const describedBy = [field.hint || field.private || field.required ? hintId : '', warns ? warnId : ''].filter(Boolean).join(' ') || undefined;
  const set = (v: Answer) => dispatch({ type: 'setAnswer', id: field.id, value: v });

  switch (field.type) {
    case 'checkbox':
      return (
        <div className="field">
          <label className="choice">
            <input type="checkbox" id={id} aria-describedby={describedBy} checked={value === true} onChange={(e) => set(e.target.checked)} />
            {field.label}
          </label>
          <Hint field={field} id={hintId} />
        </div>
      );
    case 'yesno':
    case 'choice': {
      const options = field.type === 'yesno' ? [{ value: 'yes', label: c.yes }, { value: 'no', label: c.no }] : field.options!;
      return (
        <fieldset className="field" aria-describedby={describedBy}>
          <legend>{field.label}</legend>
          <Hint field={field} id={hintId} />
          {options.map((option) => (
            <label key={option.value} className="choice">
              <input type="radio" name={id} value={option.value} checked={value === option.value} onChange={() => set(option.value)} />
              {option.label}
            </label>
          ))}
        </fieldset>
      );
    }
    case 'multi': {
      const picked = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset className="field" aria-describedby={describedBy}>
          <legend>{field.label}</legend>
          <Hint field={field} id={hintId} />
          {field.options!.map((option) => (
            <label key={option.value} className="choice">
              <input
                type="checkbox"
                value={option.value}
                checked={picked.includes(option.value)}
                onChange={(e) =>
                  // Kept in the form's order, whatever order she checks them in.
                  set(field.options!.map((o) => o.value).filter((v) => (v === option.value ? e.target.checked : picked.includes(v))))
                }
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      );
    }
    case 'group':
      return <GroupInput field={field} />;
    default:
      return (
        <div className="field">
          <label htmlFor={id}>{field.label}</label>
          <Hint field={field} id={hintId} />
          {field.type === 'textarea' ? (
            <textarea id={id} rows={field.rows ?? 3} aria-describedby={describedBy} value={typeof value === 'string' ? value : ''} onChange={(e) => set(e.target.value)} />
          ) : (
            <input
              id={id}
              type={field.type === 'date' ? 'date' : field.type === 'phone' ? 'tel' : 'text'}
              inputMode={field.type === 'number' ? 'numeric' : field.inputMode}
              autoComplete="off"
              aria-describedby={describedBy}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => set(e.target.value)}
            />
          )}
          {typeof value === 'string' && <PrintWarning id={warnId} value={value} long={field.type === 'textarea'} />}
        </div>
      );
  }
}

/** A list of items, like other court cases or animals, each with its own fields. */
function GroupInput({ field }: { field: Field }) {
  const { state, dispatch } = useAppState();
  const c = copy.forms;
  const items = Array.isArray(state.answers[field.id]) ? (state.answers[field.id] as Record<string, string>[]) : [];
  const set = (next: Record<string, string>[]) => dispatch({ type: 'setAnswer', id: field.id, value: next });
  const atLimit = field.limit !== undefined && items.length >= field.limit;
  const id = domId(field.id);

  return (
    <fieldset className="field group" aria-describedby={`${id}-hint`}>
      <legend>{field.label}</legend>
      <p id={`${id}-hint`} className="hint">
        {field.hint && <>{field.hint} </>}
        {field.overflow && fill(c.fitsOnForm, { max: field.max ?? 0, label: field.overflow })}
      </p>
      {items.map((item, i) => {
        const itemLabel = fill(field.itemLabel ?? '{n}', { n: i + 1 });
        return (
          <div key={i} className="group-item" role="group" aria-label={itemLabel}>
            <p className="group-item-label">{itemLabel}</p>
            {field.fields!.map((sub) => {
              const subId = `${id}-${i}-${sub.id}`;
              const v = item[sub.id] ?? '';
              const update = (next: string) => set(items.map((it, j) => (j === i ? { ...it, [sub.id]: next } : it)));
              if (sub.type === 'choice') {
                return (
                  <fieldset key={sub.id} className="field">
                    <legend>{sub.label}</legend>
                    {sub.options!.map((option) => (
                      <label key={option.value} className="choice">
                        <input type="radio" name={subId} value={option.value} checked={v === option.value} onChange={() => update(option.value)} />
                        {option.label}
                      </label>
                    ))}
                  </fieldset>
                );
              }
              return (
                <div key={sub.id} className="field">
                  <label htmlFor={subId}>{sub.label}</label>
                  {sub.hint && (
                    <p id={`${subId}-hint`} className="hint">
                      {sub.hint}
                    </p>
                  )}
                  <input
                    id={subId}
                    type={sub.type === 'date' ? 'date' : 'text'}
                    inputMode={sub.type === 'number' ? 'numeric' : undefined}
                    autoComplete="off"
                    aria-describedby={[sub.hint ? `${subId}-hint` : '', unprintable(v).length ? `${subId}-print` : ''].filter(Boolean).join(' ') || undefined}
                    value={v}
                    onChange={(e) => update(e.target.value)}
                  />
                  <PrintWarning id={`${subId}-print`} value={v} />
                </div>
              );
            })}
            <button type="button" className="btn" onClick={() => set(items.filter((_, j) => j !== i))}>
              {fill(c.remove, { item: itemLabel })}
            </button>
          </div>
        );
      })}
      {atLimit ? (
        <p className="note">{fill(c.limitReached, { limit: field.limit ?? 0 })}</p>
      ) : (
        <button type="button" className="btn" onClick={() => set([...items, {}])}>
          {field.addLabel}
        </button>
      )}
    </fieldset>
  );
}

/** Saves bytes as a file without leaving anything in the browser's history. */
function saveFile(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download, then let the file go.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function Download() {
  const { state, dispatch } = useAppState();
  const earlier = useEarlier();
  const questionnaire = useQuestionnaire();
  const c = copy.forms;
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const missing = missingRequired(questionnaire, state.answers, earlier);
  const forms = questionnaire.packet;
  const hasConfidential = forms.some((f) => f.confidential);
  // Fields whose text has letters the court's PDF can't print, so she can fix them by hand.
  const visible = visibleAnswers(questionnaire, state.answers, earlier);
  const toCheck = questionnaire.sections.flatMap((section) =>
    section.fields.flatMap((field) => {
      const value = visible[field.id];
      if (typeof value === 'string') return unprintable(value).length ? [{ section, label: field.label }] : [];
      if (field.type === 'group' && Array.isArray(value)) {
        const items = value as Record<string, string>[];
        return items.some((item) => Object.values(item).some((v) => unprintable(v ?? '').length)) ? [{ section, label: field.label }] : [];
      }
      return [];
    }),
  );
  const incidentsToCheck = state.incidents.some((incident) => [incident.description, incident.place, incident.present].some((t) => unprintable(t).length));

  // Builds both files at once, so the two always match, then saves the one she asked for.
  async function make(which: 'public' | 'confidential') {
    setBusy(true);
    setStatus(c.making);
    try {
      // The PDF code is large, so it loads only when she asks for a PDF.
      const [{ buildPacket }, { loadTemplate }] = await Promise.all([import('../pdf/packet'), import('../pdf/templates')]);
      const result = await buildPacket(
        {
          questionnaire,
          answers: state.answers,
          grounds: state.grounds,
          relationship: state.relationship,
          convicted: state.convicted,
          incidents: state.incidents,
          childRole: childRole(state.route),
        },
        loadTemplate,
        {
          confidentialTitle: c.confidentialTitle,
          confidentialInstructions: c.confidentialInstructions,
          confidentialBanner: c.confidentialBanner,
        },
      );
      const bytes = which === 'public' ? result.public : result.confidential;
      if (bytes) saveFile(bytes, which === 'public' ? c.publicFileName : c.confidentialFileName);
      setStatus(which === 'public' ? c.madePublic : c.madeConfidential);
    } catch {
      setStatus(c.failed);
    } finally {
      setBusy(false);
    }
  }

  const list = (confidential: boolean) => (
    <ul className="form-list">
      {forms
        .filter((f) => Boolean(f.confidential) === confidential)
        .map(({ form, copies }) => {
          const f = courtForm(form);
          return (
            <li key={form}>
              <strong>{f.number}</strong> {f.title}
              <br />
              <span className="hint">{copies === 1 ? c.copy : fill(c.copies, { copies })}</span>
            </li>
          );
        })}
    </ul>
  );

  return (
    <div>
      <StepHeading>{c.downloadHeading}</StepHeading>
      <p>{c.downloadIntro}</p>

      {missing.length > 0 ? (
        <section className="callout" aria-labelledby="missing-heading">
          <h2 id="missing-heading">{c.missingHeading}</h2>
          <p>{c.missingIntro}</p>
          <ul>
            {missing.map(({ section, field }) => (
              <li key={field.id}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => dispatch({ type: 'setFormSection', index: questionnaire.sections.indexOf(section) })}
                >
                  {field.label}
                </button>{' '}
                <span className="hint">({section.title})</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="note">{c.complete}</p>
      )}

      {(toCheck.length > 0 || incidentsToCheck) && (
        <section className="callout" aria-labelledby="print-check-heading">
          <h2 id="print-check-heading">{c.unprintableHeading}</h2>
          <p>{c.unprintableIntro}</p>
          <ul>
            {toCheck.map(({ section, label }) => (
              <li key={`${section.id}-${label}`}>
                {label} <span className="hint">({section.title})</span>
              </li>
            ))}
            {incidentsToCheck && <li>{copy.app.steps.incidents}</li>}
          </ul>
        </section>
      )}

      <section aria-labelledby="public-heading">
        <h2 id="public-heading">{hasConfidential ? c.publicHeading : c.formsOnlyHeading}</h2>
        {hasConfidential && <p>{c.publicIntro}</p>}
        {list(false)}
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={() => make('public')} disabled={busy}>
            {hasConfidential ? c.downloadPublic : c.downloadForms}
          </button>
        </div>
      </section>

      {hasConfidential && (
      <section className="callout" aria-labelledby="confidential-heading">
        <h2 id="confidential-heading">{c.confidentialHeading}</h2>
        <p>{c.confidentialIntro}</p>
        {list(true)}
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={() => make('confidential')} disabled={busy}>
            {c.downloadConfidential}
          </button>
        </div>
      </section>
      )}

      <p role="status" className="status">
        {status}
      </p>
      <p className="hint">{c.afterDownload}</p>
    </div>
  );
}
