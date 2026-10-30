# Build a prototype: ReadyFile AI

## 1. Purpose
Build a web prototype that helps a person filing an Indiana stalking or
harassment protection order petition online. It organizes her story into
separate incidents, then asks the questions a court protective order
specialist would ask at the counter, before she submits. Example:
"Stalking means two or more incidents. Are there other times?"

This is a law school class prototype. Use only fictional sample data.
Never design for, request, or store real petitioner information.

## 2. The problem we are solving
In Allen County, Indiana, a protective order specialist (court staff, not a
lawyer) helps people fill out protection order forms in person. They give
technical help, not legal advice. They catch gaps like a stalking petition
that lists only one incident. Most Indiana counties have no specialist, and
the online e-filing path has no check at all. So a judge reviews an
incomplete petition on paper and denies it.

Test persona, "Lena": She files online on a Sunday night. She checks
"stalking" and describes only one incident (the screen door attack). Online,
nothing asks about earlier incidents, so it is denied. At the counter, the
specialist would ask, she would add three more incidents, and the petition
would likely be granted. Our tool puts that question into the online path.

## 3. Who uses it
- Primary: a petitioner filing online, often late at night, often on a
  phone, possibly in danger, possibly with the respondent nearby.
- Secondary: domestic violence advocates helping petitioners in counties
  without a specialist.

## 4. Ground rules (non-negotiable)
1. Legal information only. Never tell her what she "should" do. Never
   predict whether a petition will be granted.
2. She can always submit as-is. The tool never blocks, delays, or hides the
   option to continue. Every check offers "Add more" and "Continue as is"
   with equal visual weight.
3. Petitioner safety and confidentiality come first (see section 8).
4. The tool supports the advocate system. Advocate resources are reachable
   from every screen.

## 5. What to build now (MVP)
Build only these four steps, in this order:

1. Start: choose case type (Stalking, Harassment, Not sure). Short safety
   note about shared devices. Quick exit visible.
2. Tell your story: she writes in her own words. Then the incident
   organizer splits it into separate incidents she can review, edit, merge,
   delete, or add to. She always confirms the final list herself.
3. Check: a rule engine reviews the incidents and asks plain questions
   about gaps (section 7). Each question offers "Add more" or
   "Continue as is."
4. Review: incidents listed in date order, plus a plain-text summary she
   can copy into the official e-filing form or print. State clearly that
   this tool does not file the petition for her.

## 6. Do not build yet (but design so these can be added)
- Field explainer: explains why a field like the respondent's date of birth
  matters before she skips it.
- Follow-up queue: flags incomplete petitions so a specialist or advocate
  can call within the 24-hour hold.
- Bench summary: one-page incident summary for the magistrate.
- Denial explainer: explains a denial and her options to refile.
- Domestic violence petitions (same e-filing service, added later).

Keep the checker as a self-contained module with a clean API, so it could
later plug into the court's redesigned e-filing site or be used by advocates.

## 7. Legal content and checks
Do not write any legal rule from your own knowledge. All rules and all
question wording live in content files that our team verifies.

Create /content/rules.json. Each rule has:
id, caseTypes, condition, questionText, sourceCitation, verified (true/false).

Seed it with:
- stalking-two-incidents: if case type is Stalking and fewer than 2
  incidents, ask: "Stalking means two or more incidents. Are there other
  times?" Source: PO-0102 petition booklet (team source K2). verified: false
  until the team confirms wording.
- incident-missing-date: if an incident has no date, ask whether she
  remembers about when it happened. verified: false.
- incident-too-short: if an incident description is very short, ask her to
  say more about what happened. verified: false.
- harassment-rule: placeholder with TODO. The team will supply the rule.

Rules:
- The checker is deterministic (no AI). Every question must trace to one
  rule in rules.json.
- In development mode, show a small "unverified" badge next to any
  question from a rule where verified is false.

## 8. Safety and confidentiality requirements
- Quick exit button on every screen, always visible. It clears all state
  and uses location.replace() to go to a neutral site, so the back button
  does not return to the tool.
- Neutral browser tab title and favicon (no "stalking" or "protection
  order" in the title).
- No localStorage, sessionStorage, cookies, IndexedDB, or server storage.
  State lives in memory only.
- No analytics, trackers, external fonts, or CDN calls.
- Inactivity timeout clears all data after 15 minutes, with a warning first.
- Advocate resources link on every screen. Load contacts from
  /content/resources.json with placeholder entries marked TODO for the team
  to verify. Do not hardcode phone numbers.

## 9. Incident organizer: how splitting works
Define an IncidentExtractor interface with two implementations:
- ManualExtractor (default): a simple heuristic split (paragraphs, date
  phrases like "last week" or "in March"), followed by a guided form where
  she confirms and edits each incident.
- LlmExtractor (optional, off by default): enabled only by the environment
  flag VITE_ENABLE_LLM=true, and only with fictional sample data. Its output
  is always shown to her as a draft to confirm. It never finalizes anything.

Incident data model:
- id
- date: exact date, approximate text ("early March"), or unknown
- description (her words, unchanged unless she edits)
- how it happened: in person, online, phone or text, other, unknown
- evidence or witnesses (optional free text)

## 10. Writing rules for all on-screen text
- Plain language: short sentences, everyday words, about a 6th to 8th
  grade reading level. Address her as "you."
- Calm, respectful, never blaming. No legal jargon without a short
  explanation.
- Banned phrases: "you should," "you must," "you need to," "you will be
  granted," "you qualify," "your case is strong/weak."
- Put all UI text in /content/copy.json so the team can edit it without
  touching code.
- Write a test that scans copy.json and rules.json for banned phrases.

## 11. Technical stack
- React + TypeScript + Vite, client-side only, no backend.
- Mobile-first (works at 360px wide). Large tap targets.
- Accessibility: WCAG 2.2 AA (Web Content Accessibility Guidelines).
  Full keyboard use, visible focus, screen reader labels, sufficient
  contrast.
- Tests with Vitest and React Testing Library.

## 12. Acceptance tests (use fictional data only)
1. Lena, one incident: Stalking selected, one incident entered. The check
   asks the two-or-more question. She picks "Continue as is" and still
   reaches the review screen with a summary.
2. Lena, four incidents: she adds three more. The two-or-more question
   does not appear.
3. Not sure: she can pick "Not sure" and still finish without being forced
   to choose.
4. Quick exit: clears all state and leaves the tool; back button does not
   restore it.
5. Timeout: data clears after inactivity, with a warning first.
6. No storage: nothing is written to browser storage at any step.
7. Banned phrases: the copy scan finds none.
8. Never blocks: on every check, "Continue as is" is present and works.

## 13. How to work
1. Read this whole prompt. If anything conflicts or is unclear, ask me
   before coding.
2. Propose a plan and file structure, then wait for my OK.
3. Build in this order: app shell with quick exit and safety features,
   then incident organizer, then checker, then review and export, then
   tests.
4. Run the tests and fix failures before calling a step done.
5. Do not add features from section 6.
6. Finish with a README covering: how to run it, what each content file
   controls, which rules are still unverified, and open TODOs.
