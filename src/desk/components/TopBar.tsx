import { deskCopy } from '../content';
import { sectionOf, useView } from '../state/view';

export function TopBar() {
  const { view, go } = useView();
  const section = sectionOf(view);
  const c = deskCopy.app;
  const user = section === 'petitions' ? c.users.specialist : c.users.magistrate;
  const [name, ...role] = user.split(', ');

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <p className="brand">
          <span className="brand-name">{c.name}</span>
          <span className="brand-court">{c.court}</span>
        </p>
        <nav className="topnav" aria-label={c.navLabel}>
          <ul>
            <li>
              <button
                type="button"
                className="topnav-link"
                aria-current={section === 'petitions' ? 'page' : undefined}
                onClick={() => go({ screen: 'petitions' })}
              >
                {c.nav.petitions}
              </button>
            </li>
            <li>
              <button
                type="button"
                className="topnav-link"
                aria-current={section === 'review' ? 'page' : undefined}
                onClick={() => go({ screen: 'review' })}
              >
                {c.nav.review}
              </button>
            </li>
          </ul>
        </nav>
        <p className="topbar-user">
          <span className="sr-only">{c.userLabel} </span>
          <span className="topbar-user-name">{name}</span>
          {role.length > 0 && <span className="topbar-user-role">, {role.join(', ')}</span>}
        </p>
      </div>
    </header>
  );
}
