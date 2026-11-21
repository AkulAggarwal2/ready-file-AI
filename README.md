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

Continuous integration: every pull request to `main`, and every push to
`main`, runs `npm test` and `npm run build` on GitHub Actions
([.github/workflows/ci.yml](.github/workflows/ci.yml)). Nothing is deployed.

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

`npm test` runs 146 tests in [tests/](tests/):

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

## Open TODOs

- [ ] Team: fill in and check the Allen County specialist in `resources.json`
      (the other contacts are checked). It stays hidden until then.
- [ ] Team: review all text in `copy.json` for plain language and reading level.
- [ ] Team: confirm the quick exit address (now `https://www.weather.com`).
- [ ] Decide whether to turn off spellcheck in the story box. Some browsers'
      "enhanced" spellcheck sends typed text to a server.
- [ ] Real AI splitter: needs a small server that holds the API key and keeps
      the no-storage rules. It should be used with fictional data only.
- [ ] Accessibility check with a real screen reader (VoiceOver, NVDA) and a
      contrast checker.
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
