import { useState } from 'react';
import { DEMO_MODE } from '../config';
import { copy, resources } from '../content';

const PANEL_ID = 'advocate-resources';

// An entry the team has not filled in yet must never reach a real user, so it
// is hidden unless demo mode is on.
const isPlaceholder = (text: string) => text.trim().startsWith('TODO');
const visibleResources = resources.filter(
  (resource) => DEMO_MODE || !(isPlaceholder(resource.contact) || isPlaceholder(resource.description)),
);

/** Advocate contacts, reachable from every screen (sections 4 and 8). */
export function Resources() {
  const [open, setOpen] = useState(false);

  return (
    <div className="resources">
      <button
        type="button"
        className="link-button"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => setOpen(!open)}
      >
        {open ? copy.resources.hide : copy.resources.show}
      </button>
      <section id={PANEL_ID} hidden={!open} aria-labelledby="resources-heading" className="resources-panel">
        <h2 id="resources-heading">{copy.resources.heading}</h2>
        <p>{copy.resources.intro}</p>
        {visibleResources.length === 0 && <p>{copy.resources.none}</p>}
        <ul>
          {visibleResources.map((resource) => (
            <li key={resource.id}>
              <strong>{resource.name}</strong>
              {!resource.verified && <span className="badge">{copy.resources.notVerified}</span>}
              <p>{resource.description}</p>
              <p>
                {resource.url ? (
                  <a href={resource.url} rel="noreferrer">
                    {resource.contact}
                  </a>
                ) : (
                  resource.contact
                )}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
