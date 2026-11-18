import { useCallback, useEffect, useState } from 'react';
import { DEMO_MODE, ON_DEVICE_AI_ENABLED } from '../config';
import { copy, fill } from '../content';
import { getExtractor, warmUpOnDeviceModel, type ExtractionReport } from '../organizer';
import { useAppState } from '../state/AppStateProvider';
import { DictationControls, VoiceUnavailableNote } from '../voice/DictationControls';
import { appendSpoken, breakAtSpokenDates } from '../voice/transcript';
import { useDictation } from '../voice/useDictation';

const STATUS_ID = 'voice-incidents-status';

/**
 * She tells her incidents out loud, in her own words. When she stops, the
 * incident splitter sorts what she said into draft incidents, added to the
 * end of her list for her to check, edit, merge, or delete.
 */
export function VoiceIncidents() {
  const { dispatch } = useAppState();
  const [heard, setHeard] = useState('');
  const [sorting, setSorting] = useState(false);
  // Demo only: which splitter ran last, and why.
  const [report, setReport] = useState<ExtractionReport | null>(null);
  const c = copy.voice;

  const addPhrase = useCallback((phrase: string) => setHeard((text) => appendSpoken(text, phrase)), []);
  const dictation = useDictation(addPhrase);
  const listening = dictation.status === 'listening';

  // When listening ends (she pressed Stop, or the browser stopped after a
  // silence), what she said becomes incidents.
  useEffect(() => {
    if (listening || !heard.trim()) return;
    setHeard('');
    setSorting(true);
    getExtractor(setReport)
      .extract(breakAtSpokenDates(heard))
      .then((incidents) => dispatch({ type: 'addIncidents', incidents }))
      .finally(() => setSorting(false));
  }, [listening, heard, dispatch]);

  if (dictation.status === 'checking') return null;
  if (dictation.status === 'unavailable') return <VoiceUnavailableNote detail={dictation.detail} />;

  // Pressing the button is the moment the browser allows the model download.
  const startListening = async () => {
    if (ON_DEVICE_AI_ENABLED) warmUpOnDeviceModel();
    await dictation.start();
  };

  return (
    <section className="callout voice" aria-labelledby="voice-incidents-heading">
      <h2 id="voice-incidents-heading">{c.incidentsHeading}</h2>
      <p>{c.incidentsIntro}</p>

      <DictationControls
        dictation={{ ...dictation, start: startListening }}
        startLabel={c.incidentsStart}
        statusId={STATUS_ID}
      />

      <p className="dictation-status" role="status">
        {sorting ? c.sorting : ''}
      </p>

      {DEMO_MODE && report && (
        <p className="hint dev-only-inline">
          {fill(copy.voice.demoReport, {
            splitter: report.splitter,
            seconds: report.seconds,
            reason: report.reason || copy.voice.demoReportModelUsed,
          })}
        </p>
      )}

      {/* Hidden from screen readers: it changes with every phrase. The live
          region announces the incidents once they are added. */}
      {listening && heard && (
        <div className="voice-heard" aria-hidden="true">
          <p className="voice-heard-label">{c.heardSoFar}</p>
          <p className="voice-heard-text">{heard}</p>
        </div>
      )}
    </section>
  );
}
