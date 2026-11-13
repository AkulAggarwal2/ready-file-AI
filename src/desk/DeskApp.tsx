import { useCallback, useMemo, useRef, useState } from 'react';
import { TopBar } from './components/TopBar';
import { deskCopy } from './content';
import { BenchSummary } from './screens/BenchSummary';
import { OnlinePetitions } from './screens/OnlinePetitions';
import { PetitionFollowUp } from './screens/PetitionFollowUp';
import { ReviewList } from './screens/ReviewList';
import { DeskStateProvider } from './state/DeskStateProvider';
import { ViewContext, type View } from './state/view';

// ReadyFile Desk: a court-facing companion to ReadyFile. Fictional sample data only.
export function DeskApp() {
  return (
    <DeskStateProvider>
      <DeskShell />
    </DeskStateProvider>
  );
}

function DeskShell() {
  const [view, setView] = useState<View>({ screen: 'petitions' });
  const [announcement, setAnnouncement] = useState('');
  const navigated = useRef(false);

  // Screens switch in memory. The address bar and browser history never change.
  const go = useCallback((next: View) => {
    navigated.current = true;
    setAnnouncement('');
    setView(next);
    document.documentElement.scrollTop = 0;
  }, []);
  const announce = useCallback((text: string) => setAnnouncement(text), []);
  const context = useMemo(() => ({ view, go, announce, navigated }), [view, go, announce]);

  return (
    <ViewContext.Provider value={context}>
      <TopBar />
      <div className="sr-only" role="status" aria-live="polite" aria-label={deskCopy.app.liveRegionLabel}>
        {announcement}
      </div>
      <main className="desk-main">
        {view.screen === 'petitions' && <OnlinePetitions />}
        {view.screen === 'petition' && <PetitionFollowUp key={view.id} id={view.id} />}
        {view.screen === 'review' && <ReviewList />}
        {view.screen === 'bench' && (
          <BenchSummary key={`${view.id}-${view.preview}`} id={view.id} preview={view.preview} />
        )}
      </main>
    </ViewContext.Provider>
  );
}
