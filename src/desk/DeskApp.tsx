import { deskCopy } from './content';
import { BenchSummary } from './screens/BenchSummary';
import { OnlinePetitions } from './screens/OnlinePetitions';
import { PetitionFollowUp } from './screens/PetitionFollowUp';
import { ReviewList } from './screens/ReviewList';
import { DeskStateProvider, useDesk, type View } from './state';

export function DeskApp() {
  return (
    <DeskStateProvider>
      <Shell />
    </DeskStateProvider>
  );
}

const section = (view: View) => (view.screen === 'petitions' || view.screen === 'petition' ? 'specialist' : 'magistrate');

function Shell() {
  const { state, dispatch } = useDesk();
  const { view } = state;
  const c = deskCopy.app;
  const who = section(view);
  // A preview of the bench summary still belongs to the specialist's section.
  const specialist = who === 'specialist' || (view.screen === 'bench' && view.preview);

  return (
    <>
      <header className="desk-top">
        <div className="desk-top-inner">
          <div className="desk-brand">
            <span className="desk-name">{c.name}</span>
            <span className="desk-court">{c.court}</span>
          </div>
          <nav aria-label={c.navLabel} className="desk-nav">
            <button
              type="button"
              aria-current={specialist ? 'page' : undefined}
              onClick={() => dispatch({ type: 'go', view: { screen: 'petitions' } })}
            >
              {c.nav.petitions}
            </button>
            <button
              type="button"
              aria-current={!specialist ? 'page' : undefined}
              onClick={() => dispatch({ type: 'go', view: { screen: 'review' } })}
            >
              {c.nav.review}
            </button>
          </nav>
          <span className="desk-user">{specialist ? c.users.specialist : c.users.magistrate}</span>
        </div>
      </header>
      <main className="desk-main">
        <p className="desk-prototype">{c.prototype}</p>
        {view.screen === 'petitions' && <OnlinePetitions />}
        {view.screen === 'petition' && <PetitionFollowUp id={view.id} />}
        {view.screen === 'review' && <ReviewList />}
        {view.screen === 'bench' && <BenchSummary id={view.id} preview={view.preview} />}
      </main>
    </>
  );
}
