# ReadyFile AI

A law school class prototype. It helps a person who is filing an Indiana
stalking or harassment protection order petition online organize her story
into separate incidents. Then it asks the questions a court protective order
specialist would ask at the counter, before she files.

**Use only fictional sample data.** The tool stores nothing and sends nothing
anywhere, but it is a prototype and has not been reviewed for real use.

The full build brief is in [PROMPT.md](PROMPT.md).

## How to run it

You need Node.js 20 or newer.

```bash
npm install
npm run dev        # opens at http://localhost:5173
npm test           # runs all tests once
npm run build      # type-checks and builds to dist/
```

In development mode (`npm run dev`):

- The story screen shows two buttons that fill in the fictional "Lena"
  sample: one with 1 incident, one with 4 incidents.
- Each check question from an unverified rule shows a yellow
  "Unverified rule" badge with the rule's id.

Neither appears in a production build.

To try the AI splitter stub, start the app with `VITE_ENABLE_LLM=true npm run dev`.
See "The incident splitter" below.

## The five steps

1. **Start:** she picks the kind of order, or "Not sure". If she picks
   nothing, she continues as "Not sure".
2. **Incidents:** she adds each incident with a date (a new one opens on the
   date picker), a place ("Where did it happen?"), how it happened, and what
   happened. One incident is open at a time, and Done closes it. Merge and
   Delete are inside the open incident. She can reorder or undo, and she
   confirms the final list herself. Each question chip opens the incident at
   the field it is about.
3. **Your story:** optional, in her own words.
4. **Questions:** every check question is listed, closed, with "Add more" and
   "Continue as is" at equal visual weight. "Add more" takes her to the field
   the question is about, and "Back to the question" (stuck to the bottom of
   the screen on Incidents) brings her back to it, open. Possible contact details in an incident are marked
   in place; her words are never changed. Under the questions are six
   optional safety questions (Yes / No / Not sure, each can be cleared).
5. **Review:** a plain-text summary she can copy or print, including the
   safety questions she answered. The screen says clearly that the tool does
   not file anything.

## What each content file controls

Your team can edit these files without touching code. The dev server reloads
them right away. For a production build, run `npm run build` again.

| File | What it controls |
| --- | --- |
| [content/copy.json](content/copy.json) | All on-screen text, plus the quick exit address (`quickExit.url`). `{name}` marks a value the app fills in, such as `{n}` for an incident number. |
| [content/rules.json](content/rules.json) | The check questions. Each rule has `id`, `caseTypes`, `condition`, `questionText`, `sourceCitation`, and `verified`. |
| [content/resources.json](content/resources.json) | The advocate contacts behind "Talk to an advocate". An entry with `verified: false` shows a "Not checked yet" label. |
| [content/safety-questions.json](content/safety-questions.json) | The optional safety questions (from the Petition Review Flags design). Each has `id`, `question` (what the petitioner sees), `staffLabel` (the chip Desk shows for a "yes"), `sourceCitation`, and `verified`. ReadyFile and Desk both read it. |

### Rule conditions

A rule can only use one of these conditions, so every question traces back to
one rule. Rules cannot contain code.

| `condition.type` | Asks when… |
| --- | --- |
| `incidentCountBelow` | the number of incidents is below `value` (asked once) |
| `incidentDateMissing` | an incident has no date (asked once per incident) |
| `incidentDateInFuture` | an incident's exact date is after today (asked once per incident) |
| `incidentPlaceMissing` | an incident has no place (PO-0100 question 8; once per incident) |
| `incidentPeopleMissing` | an incident does not say who was there (PO-0100 question 8; once per incident) |
| `incidentNotFirsthand` | she said she did not see or hear it herself, so a sworn statement is needed (PO-0102; once per incident) |
| `incidentActsMissing` | no act from PO-0100 question 7 is checked for an incident (once per incident) |
| `incidentWordsBelow` | an incident's description has fewer than `value` words (asked once per incident) |
| `feelingMissing` | she has incidents, but none says how they made her feel (asked once) |
| `relationshipNotHousehold` | she said the person is not a family or household member (PO-0100 question 2; asked once) |
| `incidentsOutOfOrder` | two incidents with full dates are out of date order in her list (asked once) |
| `presentThreatMissing` | she has incidents, but has not said why the person could hurt her now (asked once) |
| `convictionMissing` | she has incidents, but has not said whether the person was convicted (asked once; used for sexual assault) |
| `askedToStopMissing` | she has incidents, but has not said whether she told the person to stop (asked once) |
| `incidentContactInfo` | an incident's description, place, or evidence may include contact details. `kinds` lists which: `phone`, `ssn`, `address`. The patterns are in [src/checker/detectors.ts](src/checker/detectors.ts). They are simple, so they can miss some formats or mark text that isn't one. |
| `respondentDobBlank` | the respondent's date of birth is blank (asked once). |

A tool that doesn't ask for a field leaves it out of the checker's input, and
the conditions about that field never ask. ReadyFile sends every field except
respondent details, so it never asks `respondentDobBlank`. Desk sends only
dates, places, descriptions, and respondent details.
| `null` | never. Use this for a placeholder rule. |

If `rules.json` has a mistake, such as an unknown condition type, the app
stops with an error that names the rule.

The checker ([src/checker/](src/checker/)) has no React and no app code.
Another tool, such as a court e-filing site or an advocate tool, could import
`runChecks(input, rules)` and use it directly. ReadyFile Desk does.

A rule may also have `staffText`: how the finding reads to court staff in
Desk. ReadyFile ignores it. It is text, or a plural object such as
`{ "by": "n", "zero": "…", "one": "…", "other": "…" }`, filled from the
finding's `values` (`n` incident count, `i` incident number, `words`).

## Rules and their sources

Every ReadyFile rule is `verified: true`, backed by the court's forms
(PO-0100, PO-0102) or the team's checked Westlaw research. A test fails if a
rule is added without a source or without being verified. Only the two rules
under "Still unverified" are exempt, by name, and another test keeps that list
to those two. The 15-word limit in
`incident-too-short` is a tool setting, not a legal rule.

| Rule | Asks for | Source |
| --- | --- | --- |
| `stalking-two-incidents` | Stalking with fewer than 2 incidents | PO-0102 (team source K2) |
| `harassment-repeated` | Harassment with fewer than 2 incidents | PO-0102, Ind. Code § 34-6-2-51.5 |
| `dv-relationship` | Domestic violence when the person is not family or household | PO-0102; PO-0100 question 2 |
| `present-threat` | Whether the person could hurt her now | IC 34-26-5-9(f); *S.H. v. D.W.* (Ind. 2020); *S.D. v. G.D.* (Ind. 2023) |
| `asked-to-stop` | Whether she told the person to stop (stalking, harassment) | *Maurer v. Cobb-Maurer* (Ind. Ct. App. 2013); IC 35-45-10-3 |
| `feeling-stalking` / `feeling-harassment` | How the incidents made her feel, including fear of being hurt | PO-0102 definitions; *H.R. v. M.R.* (Ind. Ct. App. 2025); *Maurer* |
| `incident-missing-date` | An incident with no date | PO-0100 question 8; PO-0102 |
| `incidents-out-of-order` | Full dates out of order in her list | PO-0100 question 8; PO-0102 |
| `incident-future-date` | A date after today | PO-0102 (vague times are a common reason for denial) |
| `incident-missing-place` | An incident with no place (also shown in Desk) | PO-0100 question 8 |
| `incident-missing-people` | An incident with no one listed as present | PO-0100 question 8 |
| `incident-not-firsthand` | An incident she did not see herself | PO-0102 |
| `dv-acts` | Domestic violence incident with no act checked | PO-0100 question 7 |
| `incident-too-short` | A description under 15 words | PO-0102; *Maurer v. Cobb-Maurer* |
| `sexual-assault-conviction` | Whether the person was convicted (an order can last with no end date) | PO-0100 questions 2 and 9; PO-0102 |
| `sexual-assault-acts` | Sexual assault incident with no act checked | PO-0100 question 7; IC 35-42-4; IC 34-26-5-2(a)(2) |

### Still unverified

| Rule | Status |
| --- | --- |
| `incident-contact-info` | Draft wording, source TODO. It names the court form's confidential section; the team must confirm that section and its name. |
| `respondent-dob-missing` | From PO-0102 petition booklet (team source K2), not yet confirmed. Only Desk asks it. |
| Safety questions | Wording from the Petition Review Flags design. Source TODO. |

The Petition Review Flags design suggests new wording for
`stalking-two-incidents` that cites IC 35-45-10-1. It is in the rule's `todo`
for the team to decide.

## Following the petition (PO-0100)

- **Start:** "How do you know this person?" matches question 2. It is optional.
- **Each incident** asks for what question 8 asks: date, place, a description,
  and everyone who was present. It also asks which acts from question 7
  happened, whether she saw it herself, and how it made her feel.
- **Your story** also asks whether the person could hurt her now, and whether
  she told the person to stop. Indiana courts deny orders without a present,
  credible threat, and weigh whether she asked for contact to stop.
- **The summary** follows the form's order: question 2, question 7, then each
  incident as "Incident #1", "Incident #2", and so on, with readable dates.
  Empty details are left out. Incidents 4 and up are labeled "Attachment 8a",
  because the form has room for 3.
- **Numbers never change.** Incidents keep the order of her list, and the same
  number, on every step and in the summary. If two full dates are out of
  order, a question offers to fix it. The tool never reorders her list itself,
  because a "January" incident cannot be placed against an exact date.
- **Review** lists what the rest of the form asks for: questions 4, 5, 6 and 9,
  the Confidential Form (PO-0104), and the signature.

## Safety features (section 8)

- **Quick exit:** in the header on every screen, and it stays visible while
  the timeout warning is open. It clears all state, then leaves with
  `location.replace()`. The app never adds browser history entries, so the
  back button cannot return to the tool.
- **Neutral tab:** the browser tab title is "Notes", with a plain document
  icon.
- **No storage:** state lives only in memory. The app uses no
  localStorage, sessionStorage, cookies, IndexedDB, or server.
- **No outside calls:** the app uses no analytics, trackers, external fonts,
  or CDN files. Production builds include a Content Security Policy that
  blocks any request to another site.
- **Timeout:** after 14 minutes with no activity, a warning counts down 60
  seconds, with a "Stay here" button. If she doesn't respond, everything is
  cleared and she's back at Start.
- **Advocate contacts:** "Talk to an advocate" is on every screen. All
  contacts come from `resources.json`, and the code contains no phone
  numbers.
- **Light mode first:** every visit starts in light mode. The dark mode switch
  is on the right of the header, next to Quick exit.
- **No autofill history:** text inputs have `autocomplete="off"`, so the
  browser doesn't save what she types.

## The incident splitter

The splitter uses the `IncidentExtractor` interface in
[src/organizer/](src/organizer/). It has two versions:

- **ManualExtractor (default):** starts a new incident at each paragraph, and
  inside a paragraph wherever a sentence starts with a date phrase such as
  "Last week" or "In March". It also fills in any date it finds. Her words are
  never changed.
- **LlmExtractor (off by default, `VITE_ENABLE_LLM=true`):** a **stub**.
  Calling an AI model from the browser would break the no-outside-calls rule
  and expose the API key. So for now it returns prepared drafts for the
  fictional four-incident Lena sample, and uses the manual splitter for
  anything else. Either way, she sees the result as a draft and confirms it
  herself.

## Voice typing

She can speak instead of type. The code is in [src/voice/](src/voice/).

- **Answer by voice (each incident):** an open incident card asks its
  questions one at a time, in the card's order: when, where, how, what
  happened, who was there, did she see it herself, how it made her feel, and
  proof. Focus moves to each field, and a panel at the bottom of the screen
  shows the question, Skip, and Stop. She can also say "skip" or "stop".
  Written answers keep her words and are added after anything already there.
  They move on after a 2.5-second pause (`ANSWER_PAUSE_MS`). Choice answers
  ("last week", "in person", "yes") move on once understood; if an answer
  matches no option, she is asked again
  ([src/voice/incidentAnswers.ts](src/voice/incidentAnswers.ts)). Voice never
  checks the "What did the person do?" boxes (question 7), because a wrong
  check on a sworn form is serious.
- **Every text box** (her story, the questions about the person, and each
  incident's text fields) has a small microphone button in its corner
  ([src/voice/VoiceField.tsx](src/voice/VoiceField.tsx)). She talks, and when
  she pauses for a second (`VOICE_PAUSE_MS`, counted from the browser's last
  finished phrase), listening stops and what she said is added after what is
  already in the box. What she already typed is never changed. She presses the
  microphone again to keep going. Only one microphone listens at a time.
- **Tidying (on with the on-device model):** in the bigger boxes, the
  browser's built-in model fixes punctuation, grammar, and filler words like
  "um" before her words are added
  ([src/voice/tidyText.ts](src/voice/tidyText.ts)). Its instructions list the
  only changes it may make, and forbid adding facts, swapping her words for
  other words, or summarizing. It is asked to always pick its most likely
  word (`topK: 1`), so it doesn't get creative; Chrome versions that refuse
  that setting use a normal session.
- **Only answers are added (on with the on-device model):** the model also
  gets the box's question (its label and hint) and says whether what she said
  answers it. If it clearly doesn't (she was talking to someone in the room,
  or a TV was on), nothing is added, the status line says so, and an "Add it
  anyway" link adds it. "I don't remember" counts as an answer, and when the
  model isn't sure, it counts what she said as an answer. This check runs in
  every box, including the short ones. She can edit the result
  in the box, and a "Use my exact words instead" link under the box swaps in
  exactly what she said, until she edits it. The app throws the tidied
  version away, and adds her words as she said them, if it changes a number,
  adds or drops a "not" or "never", or adds or drops more than 15% of
  the words that carry facts (small words like "and then" or "like" and
  verb endings don't count). Short one-line boxes (where, about when) are
  never tidied. If the model is missing or takes over 20 seconds
  (`TIDY_TIMEOUT_MS`), her words are added as she said them.
- **Each pause ends a sentence.** Speech recognition often leaves out
  punctuation, and the manual splitter finds sentences by their ending marks,
  so a phrase without one gets a period
  ([src/voice/transcript.ts](src/voice/transcript.ts)).

**Phones:** the microphones show only where the browser confirms on-device
speech recognition, which most phone browsers don't offer today. There, the
text boxes have no microphone, and a note says voice typing works in Chrome
on a computer. Chrome's built-in model (for tidying) runs only on computers,
so a phone that does offer on-device speech adds her words as she said them. She can still use her
keyboard's own voice typing; that is the phone maker's feature, not
ReadyFile's. The layout already works at phone width if phone browsers add
on-device recognition later.

**On this device only.** In many browsers, speech recognition sends the
audio to the browser maker's server, which section 8 rules out. ReadyFile
asks the browser for on-device recognition (`processLocally`) and shows
voice typing only when the browser confirms it. Recent Chrome on a computer
does. The first use downloads the speech model, which holds none of her
words. Other browsers say voice typing is not available; in demo mode, the
note also shows what the browser answered.
The microphone turns off when she leaves the step, times out, or uses Quick
exit. Talking counts as activity, so she is never timed out while she speaks.
The listening language is `VOICE_LANGUAGE` in [src/config.ts](src/config.ts).

### Voice control (the whole form by voice)

For anyone who can't easily type or use a mouse. It is off until she turns
it on, from "Hard to type or use a mouse?" on the Start step or the
microphone switch in the header. The microphone in each box and "Answer by
voice" work the same whether it is on or off. The code is in
[src/voice/HandsFree.tsx](src/voice/HandsFree.tsx),
[src/voice/formQuestions.ts](src/voice/formQuestions.ts),
[src/voice/voiceCommands.ts](src/voice/voiceCommands.ts), and
[src/voice/pageControls.ts](src/voice/pageControls.ts).

- **It asks the questions in order.** When she turns it on, the bar at the
  bottom shows the step's first question ("Question 1 of 3 on this step"),
  its hint, and exactly what to say: a numbered list of choices (she says one
  or its number), "say your answer" for a box (the box's own microphone
  listens, and her answer is added when she stops talking), "say each one
  that fits, then 'done'" for check boxes, or "say 'yes' or 'Add an
  incident'". When she answers, it moves on by itself, through every step:
  Start, each incident (a spoken date like "last week" goes straight into
  the right date box), Your story, each card on the Questions step (opened,
  read, and answered with "Add more" or "Continue as is"), and Review.
  "Skip" and "back" (also buttons in the bar) move between questions, and
  "try again" asks again. "Skip" said into a box acts at once and adds
  nothing. If nothing went into a box, she is told and can try again.
- **She can answer in her own words.** Without AI, a sentence that mentions a
  choice picks it: "I'm seeking for stalking" or "I have a concern about
  stalking" is Stalking, "we used to date" is "We are dating or used to
  date", "he kept texting me" is "Phone call or text"
  ([src/voice/voiceCommands.ts](src/voice/voiceCommands.ts)). A word after
  "not" doesn't count ("it's not stalking, it's harassment" is Harassment),
  and when two choices fit equally it asks which one she meant. "Yeah, let's
  add one", "no, I'm done", "can we skip this one", and "I think it happened
  last week" work too. The bar always says what it chose, and "back" changes it.
- **The on-device model, for the rest (on with on-device AI).** When her
  words name no choice ("he's my ex boyfriend"), the browser's built-in
  model picks the choice she means, or none
  ([src/voice/pickChoice.ts](src/voice/pickChoice.ts)). Its answer is held to
  the list of choices plus "none" and checked again, it is told never to
  guess or to decide for her from a story of what happened, and an answer
  that comes after she has moved on is dropped. It is only used to pick one
  from a list, never for check boxes, and never off the device
  (`CHOICE_TIMEOUT_MS`, 10 seconds).
- **Check boxes stay strict.** On "What did the person do?", a box is checked
  only when her sentence has its whole name: "he threatened to hurt me" checks
  only "Threatened to hurt me" (not also "Hurt me"), and a "not" anywhere in
  that part of the sentence ("he never threatened to hurt me") checks nothing.
- **How it finds the questions.** Fields are found on the page in order: a
  group of radio buttons or check boxes, a list, a box, or a date. Questions
  answered with a button are marked in the step's code with `data-voice-ask`
  (the Start button, "Add an incident", an incident's Done, each step's
  next button, the Questions cards, and Review's copy and print). "Answer by
  voice" on an incident card is hidden while voice control is on, so there
  is one guide at a time.
- **Say what you see.** She says the words on a button, choice, or check box
  ("Next", "Stalking", "Hurt me") and it is pressed. The names come from the
  page itself (visible words, labels, and screen reader names), so every step,
  and any step added later, works without a list of commands per screen. When
  two things have the same name, the one in the page wins over the step bar,
  then the one nearest to where she is; if that still doesn't decide it, they
  get numbers and she says one.
- **Boxes and lists.** Saying a box's name ("What happened") moves there and
  starts that box's own microphone, with the same tidying. With voice control
  on, the box waits 2.5 seconds (`HANDS_FREE_PAUSE_MS`) instead of 1 before it
  adds what she said, for people who speak slowly or need to rest between
  words. Saying a list's name ("How did it happen?") moves there and shows its
  choices in the bar; she says one.
- **Forgiving, but never from a sentence.** Speech recognition mishears some
  accents more than others, so a name still matches with an ending changed
  ("hurts"), one letter off in a longer word, or the less important words left
  out ("next" for "Next: Your story"). But every word she says must be in the
  name: "he hurt me" never checks "Hurt me", because a wrong check mark on a
  sworn form is serious. Quick exit leaves only for its whole name.
- **Fixed words:** "help", "scroll down", "scroll up", "show numbers" (a
  number on everything she can see, for names that are long or hard for the
  browser to understand), and "stop listening".
- **Only a time goes into "about when".** On "When did it happen?", a phrase
  becomes an "about when" date only if it sounds like a time ("last week",
  "two days ago", "the night before Christmas"), so talk from someone else
  in the room never lands there.
- **A bar at the bottom** shows the question, what it heard, and what it
  did, with Previous question, Skip question, Help, and Stop listening. It steps aside while a box's
  microphone or "Answer by voice" is listening, then listens again. Focused
  fields are scrolled clear of it. If the microphone is blocked or stops
  working, it turns off and says why, instead of trying again forever.
- It turns off with Quick exit (either way) and when the timeout clears
  everything, so the next person at the device doesn't find it listening.

## ReadyFile Desk

A court-staff companion, built from [DESK_PROMPT.md](DESK_PROMPT.md). It runs
the same checker on every online stalking and harassment petition after it is
filed. It uses fictional sample petitions only.

- **Open it:** `npm run dev`, then http://localhost:5173/desk.html.
  `npm run build` builds both pages.
- **Screens:** Online petitions and Petition follow-up for the specialist; Ex
  parte review and Bench summary for the magistrate. State lives in memory,
  and a reload resets the demo. Times come from a demo clock that starts
  Monday, November 9, 2026 at 8:35 am, and each staff action moves it forward.
- **Holds:** only staff start one, it happens once, and it lasts up to 24
  hours. Then the petition goes to the magistrate, answered or not.
- **Safety flags (Petition Review Flags):** a petition shows "Review promptly"
  and a chip per safety question the petitioner answered "yes" (for example,
  "Strangulation" or "Weapon access"). Every answer is listed as given on the
  petition and the bench summary. Flags show only what the petitioner
  reported. They never reorder or hide a petition, and Desk never scores
  them. They use a plum color, so they don't look like a judgment (Desk has
  no red or green) or a question (blue).
- **Demo controls** (development only, at the bottom of a petition): the
  petitioner adds incidents through the link, jump to the end of the hold, and
  reset.

| File | What it controls |
| --- | --- |
| [content/desk-copy.json](content/desk-copy.json) | All Desk text. Counted strings use the same plural objects as `staffText`. `adviceExamples` holds the advice examples, which quote banned phrases on purpose and are skipped by the scan. |
| [content/desk-config.json](content/desk-config.json) | The demo clock start, minutes per action, hold length, counter hours and days, line width (66), outcome choices per case type, and the denial reasons with their source. |
| [content/desk-sample.json](content/desk-sample.json) | The five fictional petitions: narratives exactly as filed, incidents with places and `sortDate`, contact preferences (555-01xx numbers only), and safety answers. |

Desk's code is in [src/desk/](src/desk/). ReadyFile never imports from it.

## Tests

`npm test` runs 405 tests in [tests/](tests/):

- **Acceptance tests 1–8 from section 12:** `acceptance.test.tsx` covers
  tests 1–6 and 8, and `content.test.ts` covers test 7, the banned-phrase
  scan.
- **Checker and rule validation:** `checker.test.ts`.
- **Splitter and date finding:** `organizer.test.ts`.
- **Accessibility:** `accessibility.test.tsx` runs axe-core (WCAG 2.2 AA rules) on every screen, and checks focus movement and the timeout warning.
- **Desk:** `desk.test.tsx` covers acceptance tests 1–12 and 15 from
  DESK_PROMPT.md plus the safety flags, and `desk-logic.test.ts` covers the
  checker values, plurals, line numbers, the timeline, and holds.
  `content.test.ts` covers 13, 14, and 16.
- **Source code scans:** checks that the code has no storage calls, network
  calls, history changes, or hardcoded phone numbers.
- **Voice typing:** [tests/fakeVoice.ts](tests/fakeVoice.ts) stands in for the
  browser's on-device speech recognition and built-in model, so tests can
  "speak" and choose what the model answers.
  - `voice-text.test.ts`: joining spoken words to a field, reading spoken
    answers, the check that the tidied text keeps her meaning (numbers,
    "not"s, added or dropped facts), and the model's instructions. Its worked
    examples must pass the app's own check.
  - `voice-browser.test.ts`: speech recognition only on the device, the model
    not used until it is ready, no randomness (and the fallback where Chrome
    refuses that), time limits, and closing sessions.
  - `voice-field.test.tsx`: the microphone in each box, through the whole
    app: stopping on a pause, tidying, "Use my exact words instead",
    skipping what isn't an answer and "Add it anyway", one microphone at a
    time, errors, and axe checks.
  - `voice-guide.test.tsx`: "Answer by voice", including that it never
    checks the question 7 boxes.
  - `voice-commands.test.ts`: voice control reading what she says (commands,
    numbers, "check" and "uncheck", "skip", "back", "done", "yes") and finding
    what she named, including misheard words, that a sentence containing a
    name never matches, and which phrases sound like a time.
  - `voice-page.test.ts`: finding what she can press on a page by its names,
    only the dialog while one is open, picking between controls with the same
    name, pressing, checking, choosing, or starting a box's microphone, reading
    a step's questions in order, and keeping the question in view above the
    bar (even when the bar is taller than half a phone's screen).
  - `voice-control.test.tsx`: voice control through the whole app: the
    questions asked in order on Start, an incident, and the Questions step,
    spoken dates, boxes, lists by name or number, check boxes and "done",
    "skip" and "back", trying again, waiting while words are tidied, numbers,
    Quick exit, errors, the inactivity timer, and axe checks.

## Open TODOs

- [ ] Team: fill in and check the Allen County specialist in `resources.json`
      (the other contacts are checked). It stays hidden until then.
- [ ] Team: review all text in `copy.json` for plain language and reading level.
- [ ] Team: confirm the quick exit address (now `https://www.weather.com`).
- [ ] Decide whether to turn off spellcheck in the story box. Some browsers'
      "enhanced" spellcheck sends typed text to a server.
- [ ] Team: decide whether real users get tidying with the on-device model
      (`VITE_ENABLE_ON_DEVICE_AI`), and test it on the laptops petitioners
      use. Chrome's built-in model needs a recent desktop Chrome, enough
      memory, and a one-time download of about 2 GB.
- [ ] Real AI splitter: needs a small server that holds the API key and keeps
      the no-storage rules. It should be used with fictional data only.
- [ ] Team: decide whether to offer voice typing, and test it with a real
      microphone and a screen reader. Check the words that "Answer by voice"
      matches to choices (in [src/voice/incidentAnswers.ts](src/voice/incidentAnswers.ts)).
- [ ] Accessibility check with a real screen reader (VoiceOver, NVDA) and a
      contrast checker.
- [ ] Team: test voice control with people who use it every day (for
      example, people with limited hand use or speech differences), with
      different accents, and next to the voice control built into Mac and
      Windows. Voice control only understands English (`VOICE_LANGUAGE`).
- [ ] Not built yet (section 6): field explainer, denial explainer, and
      domestic violence petitions. The follow-up queue and bench summary are
      in ReadyFile Desk.
- [ ] Team: verify the safety question wording and decide whether ReadyFile
      should ask them, and where.
- [ ] Team: confirm the name of the form's confidential section used in
      `incident-contact-info`.
- [ ] Desk: a screen where the court approves question wording, an outcomes
      report, real e-filing, texts, and calls (DESK_PROMPT.md section 11).
- [ ] Desk: a dark theme. Desk is light only for now.
- [ ] Desk accessibility: check by hand that control borders, timeline lanes,
      and the focus ring are at least 3:1, and test with a screen reader.
