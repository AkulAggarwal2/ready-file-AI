# ReadyFile AI

A law school class prototype. It helps a person who is filing an Indiana
stalking or harassment protection order petition online organize her story
into separate incidents. Then it asks the questions a court protective order
specialist would ask at the counter, before she files.

**Use only fictional sample data.** The tool stores nothing and sends nothing
anywhere, but it is a prototype and has not been reviewed for real use.

The full build brief is in [PROMPT.md](PROMPT.md). The same app has a second
page for court staff, [ReadyFile Desk](#readyfile-desk), built from
[DESK_PROMPT.md](DESK_PROMPT.md).

## How to run it

You need Node.js 20 or newer.

```bash
npm install
npm run dev        # opens at http://localhost:5173 (Desk: /desk.html)
npm test           # runs all tests once
npm run build      # type-checks and builds both pages to dist/
```

In development mode (`npm run dev`):

- The story screen shows two buttons that fill in the fictional "Lena"
  sample: one with 1 incident, one with 4 incidents.
- Each check question from an unverified rule shows a yellow
  "Unverified rule" badge with the rule's id.

Neither appears in a production build.

To try the AI splitter stub, start the app with `VITE_ENABLE_LLM=true npm run dev`.
See "The incident splitter" below.

## The four screens

1. **Start:** she picks Stalking, Harassment, or Not sure. If she picks
   nothing, she continues as "Not sure".
2. **Tell your story:** she writes in her own words, then the splitter breaks
   the story into draft incidents. She can edit, merge, delete, or add
   incidents, and she confirms the final list herself.
3. **Check:** the rule checker asks one question at a time. Each question has
   "Add more" and "Continue as is", with equal visual weight. "Add more" takes
   her to the field the question is about.
4. **Review:** a plain-text summary she can copy or print. The screen says
   clearly that the tool does not file anything.

## What each content file controls

Your team can edit these files without touching code. The dev server reloads
them right away. For a production build, run `npm run build` again.

| File | What it controls |
| --- | --- |
| [content/copy.json](content/copy.json) | All on-screen text, plus the quick exit address (`quickExit.url`). `{name}` marks a value the app fills in, such as `{n}` for an incident number. |
| [content/rules.json](content/rules.json) | The check questions. Each rule has `id`, `caseTypes`, `condition`, `questionText`, `sourceCitation`, and `verified`. An optional `staffText` is how the finding reads to court staff in Desk. ReadyFile ignores it. |
| [content/resources.json](content/resources.json) | The advocate contacts behind "Talk to an advocate". An entry with `verified: false` shows a "Not checked yet" label. |

### Rule conditions

A rule can only use one of these conditions, so every question traces back to
one rule. Rules cannot contain code.

| `condition.type` | Asks when… |
| --- | --- |
| `incidentCountBelow` | the number of incidents is below `value` (asked once) |
| `incidentDateMissing` | an incident has no date (asked once per incident) |
| `incidentWordsBelow` | an incident's description has fewer than `value` words (asked once per incident) |
| `respondentDobBlank` | the input includes respondent details and the date of birth is blank. ReadyFile doesn't send respondent details yet, so this never asks there. |
| `null` | never. Use this for a placeholder rule. |

If `rules.json` has a mistake, such as an unknown condition type, the app
stops with an error that names the rule.

The checker ([src/checker/](src/checker/)) has no React and no app code.
Another tool, such as a court e-filing site or an advocate tool, could import
`runChecks(input, rules)` and use it directly.

## Rules still unverified

Every rule is `verified: false`:

| Rule | Status |
| --- | --- |
| `stalking-two-incidents` | Wording from PO-0102 petition booklet (team source K2). Waiting for the team to confirm. |
| `incident-missing-date` | The question wording is a draft, and the source is TODO. |
| `incident-too-short` | The question wording is a draft, and the source is TODO. The 15-word limit is a placeholder. |
| `respondent-dob-missing` | Wording from PO-0102 petition booklet (team source K2). Only Desk asks it (see below). |
| `harassment-rule` | Placeholder with no condition, so it never asks anything. The team will supply this rule. |

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

## Tests

`npm test` runs 138 tests in [tests/](tests/): 52 for ReadyFile and 86 for
ReadyFile Desk. The ReadyFile tests:

- **Acceptance tests 1–8 from section 12:** `acceptance.test.tsx` covers
  tests 1–6 and 8, and `content.test.ts` covers test 7, the banned-phrase
  scan.
- **Checker and rule validation:** `checker.test.ts`.
- **Splitter and date finding:** `organizer.test.ts`.
- **Accessibility:** `accessibility.test.tsx` runs axe-core (WCAG 2.2 AA rules) on every screen, and checks focus movement and the timeout warning.
- **Source code scans:** checks that the code has no storage calls, network
  calls, history changes, or hardcoded phone numbers.

## Open TODOs

- [ ] Team: verify the wording and source for every rule, then set `verified: true`.
- [ ] Team: supply the harassment rule.
- [ ] Team: confirm the 15-word limit in `incident-too-short`.
- [ ] Team: fill in and verify every entry in `resources.json`.
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

## ReadyFile Desk

A second page of the same app, for Allen County court staff. It runs
ReadyFile's rule checker on every online stalking and harassment petition
after it's filed. Staff then see the questions the counter specialist would
have asked, while there is still time to follow up. The full brief is in
[DESK_PROMPT.md](DESK_PROMPT.md). **Fictional sample data only.**

### How to open it

```bash
npm run dev        # then open http://localhost:5173/desk.html
```

`npm run build` builds it to `dist/desk.html`, next to ReadyFile. It has the
same Content Security Policy as ReadyFile, with one difference: `font-src
'self'`. Desk uses self-hosted Public Sans and Literata from the
`@fontsource` packages. ReadyFile still loads no fonts.

State lives in memory only, so a reload resets the demo. Desk shows times
from a demo clock that starts Monday, November 9, 2026 at 8:35 am. Each
staff action moves it forward 2 minutes.

The four screens:

1. **Online petitions** (specialist): every online petition, oldest first,
   with the questions Desk found, contact details, and hold status. Names
   show as initials until "Show petitioner names" is checked.
2. **Petition follow-up** (specialist): the hold panel and a 25-hour
   timeline, the questions with their rules and sources, the petition as
   filed on numbered lines, contact details with a masked phone number, the
   neutral text message, call logging, and the activity log.
3. **Ex parte review** (magistrate): petitions in the review queue. A held
   petition shows up once its hold ends.
4. **Bench summary** (magistrate): incidents in date order in the
   petitioner's own words, line links into the filed petition, the counter
   questions and whether each was answered, the follow-up record, the
   outcome form, and "Ask the specialist to follow up".

In development, Screen 2 has **demo controls**: "The petitioner adds
incidents through the link" (Lena's sample only, after the link is texted),
"Jump to the end of the hold", and "Reset demo". They also show in a build
made with `VITE_DEMO_MODE=true`, like ReadyFile's sample buttons.

To walk through the Lena test case: open Lena Moore's petition, then use
**Hold for follow-up**, **Text the link**, **The petitioner adds incidents
through the link**, and **Jump to the end of the hold**. Then open
**Ex parte review** and open Moore v. Ostrander.

Desk never holds a petition on its own. A hold starts only from a staff
button and lasts up to 24 hours. Then the petition goes to the magistrate,
answered or not. "Send to magistrate now" is there during every hold.

### What each Desk content file controls

| File | What it controls |
| --- | --- |
| [content/desk-copy.json](content/desk-copy.json) | All Desk text, including the text message, log entries, day and month names, and the staff labels. Plural forms are `{ "zero", "one", "other" }`. The two "Advice" examples and "The test" line are under `adviceExamples`, which the banned-phrase scan skips on purpose. |
| [content/desk-config.json](content/desk-config.json) | The demo clock start and minutes per action, hold length, counter hours and days, timeline length, line width (66), which case types Desk checks, which days "weeknights" means, outcome choices per case type, and the denial reasons with their source. |
| [content/desk-sample.json](content/desk-sample.json) | The five fictional petitions and Lena's amended petition. Each incident's description must appear word for word in its narrative, or Desk stops with an error that names it. Phone numbers are 555-01xx only and appear nowhere else. |
| [content/rules.json](content/rules.json) | Shared with ReadyFile. Desk shows each rule's `staffText`, or "Question from rule {id}" if it has none. |

### Rules and lists still unverified

| Item | Status |
| --- | --- |
| `stalking-two-incidents` | Question and `staffText` wording not approved yet. Source: PO-0102 petition booklet (team source K2). |
| `incident-missing-date` | Wording not approved yet. The source is TODO. |
| `incident-too-short` | Wording not approved yet. The source is TODO. The 15-word limit is a placeholder. |
| `respondent-dob-missing` | New. Wording from PO-0102 petition booklet (team source K2), not approved yet. It stays off in ReadyFile until ReadyFile collects respondent details. |
| Outcome choices | Harassment leaves out "Granted ex parte", from the PO-0102 booklet (team source K2). Not confirmed yet. |
| Denial reasons | From the common denial reasons in the PO-0102 booklet. `denialReasons.verified` is `false`. |

Every question on screen shows "Wording not approved yet" while its rule has
`verified: false`.

### Decisions made while building

- **Pronouns:** the filing form doesn't ask for pronouns, so Desk's text
  never uses she/her for the petitioner. For example: "Text the link",
  "Call times", and "The petitioner's words, unchanged". A test checks this.
- **Date order:** Desk works out a sort date from the date phrase and the
  filing date. "Mid-August" sorts as August 15, "early" as the 5th, "late"
  as the 25th, and "Last night" as the day before filing. A month and day
  later than the filing date counts as last year. Incidents with no date
  Desk can place go last, and ties keep the order filed. Desk always shows
  the date as written.
- **Line numbers:** each narrative wraps at 66 characters, breaking only at
  spaces. The blank line between paragraphs gets no number.
- **Holds:** a specialist can hold a petition once if it has a phone
  number, even when Desk found no questions. Any hold ends on its own once
  the demo clock passes its end time, and the log records it. "Ask the
  specialist to follow up" starts a new 24-hour hold.
- **Lena's original petition** is one paragraph, so the whole paragraph is
  one incident, and nothing is "Not tied to one incident".
- **Banned phrases:** Desk's scan adds "should", "will be denied", and
  "will be granted" to ReadyFile's list, because ground rule 2 rules out
  advice and predictions.
- **Before a hold**, the text message preview shows the end time a hold
  would have if it started now.

### Desk tests

- `desk-checker.test.ts`: `staffText`, the new rule, the new finding fields,
  and that the new rule never asks without respondent details.
- `desk-logic.test.ts`: line wrapping, the demo clock, call times and the
  sentence under the timeline, date order, plurals, the expected sample
  findings, and holds.
- `desk-acceptance.test.tsx`: acceptance tests 1 to 13 from the brief.
- `desk-accessibility.test.tsx`: axe-core (WCAG 2.2 AA) on all four screens
  in several states, keyboard use, focus after each change, and the focus
  style. jsdom can't check contrast, so axe was also run in a real browser
  with color contrast on, on all four screens, with no violations.
- `desk-content.test.ts`: banned phrases (and that the advice examples do
  contain one), no she/her, fictional phone numbers kept out of `src/`, that
  ReadyFile never imports Desk, `desk.html`, the color palette (no red or
  green), and no shadows.

### Desk open TODOs

- [ ] Team: approve the wording of every question and `staffText`, then set
      `verified: true`.
- [ ] Team: confirm the outcome choices per case type and the denial reasons
      against the PO-0102 booklet.
- [ ] Team: confirm the counter hours, the 24-hour hold, and the text message
      with the court. "Since the counter closed Friday at 4 pm" is fixed text
      in `desk-copy.json`.
- [ ] Team: confirm which days "weeknights" means (now Monday to Friday) and
      the sort dates for rough phrases like "Mid-August".
- [ ] Team: review all Desk text for plain language, including the neutral
      wording that replaces she/her.
- [ ] Production would need staff sign-in, an audit trail, and a real
      petition feed. In v1, incidents come from the sample file. In
      production they would come from ReadyFile, or from running the
      ManualExtractor on the filed text.
- [ ] Accessibility check with a real screen reader (NVDA, VoiceOver) and a
      full keyboard walkthrough by a person.
- [ ] Not built yet (DESK_PROMPT.md section 11): a screen where the court
      approves question wording, an outcomes report, real e-filing, real
      texts and calls, the real add-details flow behind the link, access for
      advocates in counties without a specialist, and domestic violence
      rules.
