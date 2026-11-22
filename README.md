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

## The steps


0. **Your situation:** one question at a time ("Question 2" above each, and
   no step bar until her answers lead somewhere), it asks who the order is for
   (her, a child, an employee, or she is the respondent) and what she is
   trying to do, and lists the court forms that fit. Only the adult petition
   continues into the steps below for now; other outcomes list their forms
   and say ReadyFile does not fill them yet. The questions are in
   `content/routing.json`.
   After **Review**, the **Court forms** step asks the rest of what the
   petition (PO-0100), the Confidential Form (PO-0104) and the Notice of
   Exclusion (PNW-0102) need, and "Make my PDF" prints every answer on the
   court's official forms, in the browser. Text too long for a blank, and
   list items past what fits, go on labeled attachments (4a, 8a, 9(a) to
   9(c)), and question 10 counts the pages. Signature and date lines and
   anything the clerk fills stay blank. The PDF code and the forms load only
   when she asks for the PDF, and nothing leaves the device. There are two
   PDFs: the petition with the Notice of Exclusion, and the Confidential Form
   on its own, marked on every page, so it is never printed into the copy of
   the petition that is served on the other person.
   For a child, the same steps use the child's petition (PO-0101): the
   child's wording (`copy.child` in copy.json replaces matching keys), the
   child form's relationship lines and acts (including sex grooming), and the
   child named "by next friend" on every caption.
1. **Start:** she checks the grounds that apply (question 1), or none for
   "not sure".
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
| [content/rules.json](content/rules.json) | The check questions. Each rule has `id`, `grounds` (from PO-0100 question 1, plus `not-sure`), `condition`, `questionText`, `sourceCitation`, and `verified`. |
| [content/resources.json](content/resources.json) | The advocate contacts behind "Talk to an advocate". An entry with `verified: false` shows a "Not checked yet" label. |
| [content/forms.json](content/forms.json) | Every form on the court's protection order forms page: number, official title, a plain name for the screens (`plainTitle`), dates, Word and PDF links (for citation only), who fills it, and what ReadyFile makes from it. A test keeps it in step with the page's list. |
| Court form updates | `tests/court-page.test.ts` keeps `content/forms.json` matching a saved copy of the court's page (`tests/fixtures/po-forms-page.html`). `npm run check:court-forms` compares the live page and the court's current PDFs with the app's copies; `.github/workflows/court-forms.yml` runs it every Monday and fails when the court changes a form. To update: save the new PDF in `src/pdf/templates/`, update `content/forms.json` and the page snapshot, check the form's anchors, rebuild the maps, and look at a filled sample. GitHub runs scheduled jobs only from the default branch, and turns them off after 60 days without commits on a public repository; after merging, check the Actions tab, and run it there with "Run workflow" if it was turned off. |
| [content/questionnaires/petition-adult.json](content/questionnaires/petition-adult.json) | The Court forms questions for the adult packet, section by section in each form's order (PO-0100, then PO-0104). Field ids match the PDF map keys. `showIf` hides a field until it applies; `$relationship`, `$convicted` and `$grounds` come from earlier steps. Groups say how many fit on the form (`max`) and which attachment takes the rest. |
| [content/questionnaires/petition-child.json](content/questionnaires/petition-child.json) | The same for a petition filed on behalf of a child (PO-0101): the child's name, the filer as next friend, the child form's question 1, 2, 5 and 9 lines, and a Confidential Form page about the child. |
| content/questionnaires/*.json (other files) | One per form in a case that already exists: requesting a hearing (as petitioner or respondent), withdrawing, ending, reinstating, modifying, extending, contempt, and registering or updating an out-of-state order. Each lists its `packet` (forms, copies, `confidential`), its `instructions` page, who signs (`filer`), and any `fixed` answers the route decides. Field ids are the map keys, so most need no code. |
| content/questionnaires/wv-*.json | Workplace violence: the employer's petition packet (WV-0101, the pre-filled Order to Show Cause WV-0102, blank WV-0104 and WV-0105 to serve, WV-0103 for the server, PNW-0102, and a separate PO-0104 about the employee), the employer's request to modify (WV-0107), and the defendant's response (WV-0104, WV-0105). The employer is the Plaintiff; a person signs for it and gives their title. |
| [content/pdfMaps/](content/pdfMaps) | Where each answer prints on the court's PDF. Edit `anchors/<FORM>.json` (a line's text and which blank on it), then run `node scripts/build-pdf-maps.mjs` (needs poppler's `pdftotext`) to regenerate `<FORM>.json`. Never edit the generated files by hand. The court's blank PDFs are in `src/pdf/templates/`. After adding one, delete `node_modules/.vitest-cache`: Vitest caches the template list and does not see new files. |
| [content/routing.json](content/routing.json) | The Your situation questions. Each option goes to another question (`next`) or an outcome; each outcome lists its court forms. A test checks every option leads somewhere and every form exists. |
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
| `convictionMissing` | she has incidents, but has not said whether the person was convicted (asked once; used when a sex offense is checked) |
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
rule is added without a source or without being verified. Only the one rule
under "Still unverified" is exempt, by name, and another test keeps that list
to that one. The 15-word limit in
`incident-too-short` is a tool setting, not a legal rule.

| Rule | Asks for | Source |
| --- | --- | --- |
| `stalking-two-incidents` | Stalking with fewer than 2 incidents | PO-0102 definition of stalking (two or more incidents) |
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
| `sexual-assault-acts` | Sex offense incident with no act checked | PO-0100 question 7; IC 35-42-4; IC 34-26-5-2(a)(2) |
| `respondent-dob-missing` | The respondent's date of birth is blank (Desk only) | PO-0102: without a date of birth or Social Security number, the order can't go into the national registry |

### Still unverified

| Rule | Status |
| --- | --- |
| `incident-contact-info` | Draft wording, source TODO. It names the court form's confidential section; the team must confirm that section and its name. |
| Safety questions | Wording from the Petition Review Flags design. Source TODO. |

The Petition Review Flags design suggests new wording for
`stalking-two-incidents` that cites IC 35-45-10-1. It is in the rule's `todo`
for the team to decide.

## Following the petition (PO-0100)

- **Grounds:** the Start screen asks question 1 the way the form does: check
  every ground that applies (domestic or family violence, a sex offense,
  stalking, repeated harassment). None checked means not sure. A rule applies
  if it lists any checked ground; when two rules ask the same thing, it is
  asked once.
- **Lists match the form:** the relationships follow question 2's lines and
  the acts follow question 7's nine boxes, in the form's order.
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
