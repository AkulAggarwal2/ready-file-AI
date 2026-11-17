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
| [content/rules.json](content/rules.json) | The check questions. Each rule has `id`, `caseTypes`, `condition`, `questionText`, `sourceCitation`, and `verified`. |
| [content/resources.json](content/resources.json) | The advocate contacts behind "Talk to an advocate". An entry with `verified: false` shows a "Not checked yet" label. |

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
| `null` | never. Use this for a placeholder rule. |

If `rules.json` has a mistake, such as an unknown condition type, the app
stops with an error that names the rule.

The checker ([src/checker/](src/checker/)) has no React and no app code.
Another tool, such as a court e-filing site or an advocate tool, could import
`runChecks(input, rules)` and use it directly.

## Rules and their sources

Every rule is `verified: true`, backed by the court's forms (PO-0100, PO-0102)
or the team's checked Westlaw research. A test fails if a rule is added
without a source or without being verified. The 15-word limit in
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
| `incident-missing-place` | An incident with no place | PO-0100 question 8 |
| `incident-missing-people` | An incident with no one listed as present | PO-0100 question 8 |
| `incident-not-firsthand` | An incident she did not see herself | PO-0102 |
| `dv-acts` | Domestic violence incident with no act checked | PO-0100 question 7 |
| `incident-too-short` | A description under 15 words | PO-0102; *Maurer v. Cobb-Maurer* |
| `sexual-assault-conviction` | Whether the person was convicted (an order can last with no end date) | PO-0100 questions 2 and 9; PO-0102 |
| `sexual-assault-acts` | Sexual assault incident with no act checked | PO-0100 question 7; IC 35-42-4; IC 34-26-5-2(a)(2) |

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

`npm test` runs 48 tests in [tests/](tests/):

- **Acceptance tests 1–8 from section 12:** `acceptance.test.tsx` covers
  tests 1–6 and 8, and `content.test.ts` covers test 7, the banned-phrase
  scan.
- **Checker and rule validation:** `checker.test.ts`.
- **Splitter and date finding:** `organizer.test.ts`.
- **Accessibility:** `accessibility.test.tsx` runs axe-core (WCAG 2.2 AA rules) on every screen, and checks focus movement and the timeout warning.
- **Source code scans:** checks that the code has no storage calls, network
  calls, history changes, or hardcoded phone numbers.

## Open TODOs

- [ ] Team: fill in and verify every entry in `resources.json`.
- [ ] Team: review all text in `copy.json` for plain language and reading level.
- [ ] Team: confirm the quick exit address (now `https://www.weather.com`).
- [ ] Decide whether to turn off spellcheck in the story box. Some browsers'
      "enhanced" spellcheck sends typed text to a server.
- [ ] Real AI splitter: needs a small server that holds the API key and keeps
      the no-storage rules. It should be used with fictional data only.
- [ ] Accessibility check with a real screen reader (VoiceOver, NVDA) and a
      contrast checker.
- [ ] Not built yet (section 6): field explainer, follow-up queue, bench
      summary, denial explainer, and domestic violence petitions.
