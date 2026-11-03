import { copy, fill } from '../content';
import type { Incident } from '../organizer';
import { formatExactDate, partitionByDate } from '../review/summary';

interface Props {
  incidents: Incident[];
  // "list": numbered by the order on the Incidents screen.
  // "timeline": numbered by the order shown here, which matches the summary.
  numbering: 'list' | 'timeline';
}

/** Exact-date incidents in order, then the ones without an exact date in a separate group. */
export function Timeline({ incidents, numbering }: Props) {
  if (incidents.length === 0) return <p>{copy.timeline.empty}</p>;

  const { dated, undated } = partitionByDate(incidents);
  const ordered = [...dated, ...undated];
  const numberOf = (incident: Incident) =>
    (numbering === 'list' ? incidents : ordered).findIndex((other) => other.id === incident.id) + 1;

  return (
    <div className="timeline">
      <p className="hint">{copy.review.order}</p>
      {dated.length > 0 && (
        <>
          <h3>{copy.timeline.dated}</h3>
          <ol className="timeline-list">
            {dated.map((incident) => (
              <TimelineItem key={incident.id} incident={incident} number={numberOf(incident)} />
            ))}
          </ol>
        </>
      )}
      {undated.length > 0 && (
        <>
          <h3>{copy.timeline.undated}</h3>
          <ol className="timeline-list">
            {undated.map((incident) => (
              <TimelineItem key={incident.id} incident={incident} number={numberOf(incident)} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function TimelineItem({ incident, number }: { incident: Incident; number: number }) {
  const { date } = incident;
  const preview = incident.description.trim();

  return (
    <li className="timeline-item">
      <span className="timeline-date">
        {date.kind === 'exact' && date.value ? (
          <time dateTime={date.value}>{formatExactDate(date.value)}</time>
        ) : date.kind === 'approximate' && date.text.trim() ? (
          date.text.trim()
        ) : (
          copy.summary.dateUnknown
        )}
      </span>
      <span className="timeline-body">
        <strong>{fill(copy.timeline.incident, { n: number })}</strong>
        {incident.how !== 'unknown' && <span> · {copy.incident.how[incident.how]}</span>}
        <span className="preview">{preview || copy.incident.preview.empty}</span>
      </span>
    </li>
  );
}
