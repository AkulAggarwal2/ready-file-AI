# Build a prototype: ReadyFile Desk

This brief adds a court-facing companion to ReadyFile AI, inside this repo. Read PROMPT.md and README.md first. Everything in PROMPT.md still applies to ReadyFile. This brief replaces two items in PROMPT.md section 6, "Follow-up queue" and "Bench summary". Build them here.

## 1. Purpose

Build ReadyFile Desk, a web prototype for Allen County court staff. It runs ReadyFile's rule checker on every online stalking and harassment protection order petition after it is filed. Court staff then see the questions the counter specialist would have asked, while there is still time to follow up.

Desk has two users:

- The protective order specialist sees online petitions and the questions found. The specialist can hold a petition for up to 24 hours and text or call the petitioner.
- The magistrate reviews a bench summary of the petition, records the outcome, and can ask the specialist to follow up.

This is a law school class prototype. Use only fictional sample data. Never design for, request, or store real petitioner information.

## 2. The problem on the court's side

At the counter, the specialist catches gaps like a stalking petition that lists only one incident. Online, nothing does. The clerk accepts every petition, and the magistrate reviews it on paper and denies it. Allen County's specialist may hold an e-filed petition for 24 hours and call the petitioner if the petition gives a phone number, but nothing tells the specialist which petitions need a call. When a petition is denied, no one records why.

ReadyFile helps petitioners who find it. Desk checks every online petition, whether or not the petitioner used ReadyFile.

Test case, "Lena": on Sunday at 11:52 pm she files a stalking petition online that describes one incident. Monday morning, the specialist sees the question Desk found and holds the petition. Lena works 7 am to 7 pm and the counter closes at 4 pm, so the specialist texts her a link. Monday at 8:21 pm she adds three earlier incidents. Tuesday morning the hold ends, and the magistrate sees four incidents in date order.

## 3. Ground rules (non-negotiable)

1. Desk never holds or delays a petition on its own. Only a staff member can start a hold. A petition can be held once, for up to 24 hours, then it goes to the magistrate, answered or not. "Send to magistrate now" is always available during a hold.
2. Legal information only. Desk and its scripts never tell anyone what they "should" do, and never predict an outcome.
3. Desk never changes the petitioner's words. It numbers and sorts them. Staff can't edit petition text.
4. Desk never judges whether a petition meets a legal standard. It shows what the petition says and which counter questions apply.
5. Every question and finding traces to one rule in content/rules.json.
6. Petitioner safety and privacy come first (section 8).

## 4. Where it lives in this repo

- Add Desk as a second page of the same Vite app: desk.html at the repo root, code in src/desk/. In development it opens at http://localhost:5173/desk.html.
- Desk imports the checker from src/checker/ and reads content/rules.json. Do not copy the checker. ReadyFile must never import from src/desk/.
- Do not change ReadyFile's screens or behavior. All existing tests must still pass.
- Put all Desk text in content/desk-copy.json, settings in content/desk-config.json, and sample petitions in content/desk-sample.json, so the team can edit them without touching code. Match the punctuation style of content/copy.json.
- `npm run build` builds both pages. desk.html gets the same Content Security Policy as index.html, except `font-src 'self'` so the self-hosted fonts in section 9 load. Keep index.html's policy unchanged (`font-src 'none'`). The plugin in vite.config.ts can tell the pages apart by the HTML file's path.
- If docs/desk-design/ has screenshots of the design, use them as the visual reference.

## 5. Changes to the rules and the checker

Read src/checker/ before changing anything.

1. Add an optional `staffText` field to rules: how the finding reads to court staff. ReadyFile ignores it. Update rule validation to accept it. If a rule has no staffText, Desk shows "Question from rule {id}".
   - staffText is either a string or a plural object: `{ "by": "<placeholder>", "zero": "...", "one": "...", "other": "..." }`. Desk reads the number named by `by` from the finding's values (item 3) and uses `zero` for 0 (falling back to `other` if there's no `zero`), `one` for 1, and `other` for anything else. Validation checks that `by` is set and `one` and `other` are present.
   - stalking-two-incidents: `{ "by": "n", "zero": "Stalking is checked, and no incidents are described", "one": "Stalking is checked, and only 1 incident is described", "other": "Stalking is checked, and {n} incidents are described" }`
   - incident-missing-date: "Incident {i} has no date"
   - incident-too-short: `{ "by": "words", "one": "Incident {i} is very short (1 word)", "other": "Incident {i} is very short ({words} words)" }`
2. Add one rule. It stays off in ReadyFile, because ReadyFile doesn't collect respondent details yet.
   - id: respondent-dob-missing
   - caseTypes: the same list as incident-missing-date
   - condition: a new type, respondentDobBlank. Add an optional `respondent?: { dateOfBirth?: string }` to CheckInput. The rule asks only when `respondent` is present and `dateOfBirth` is empty or missing. If the input has no `respondent`, as in ReadyFile today, it never asks. Add the type to the list in validateRules' unknown-condition error message.
   - questionText: "Do you know the other person's date of birth? Without it, the order goes into Indiana's registry but not the national one."
   - staffText: "The respondent's date of birth is blank"
   - sourceCitation: "PO-0102 petition booklet (team source K2)"
   - verified: false
3. Finding already has `ruleId` and `incidentId`. Add an optional `values: Record<string, number>` holding the numbers the staffText placeholders need, so Desk never recomputes them: `n` (incident count) for incidentCountBelow, `i` (the incident's 1-based position in the input list) for per-incident findings, and `words` (word count, counted the same way the condition counts them) for incidentWordsBelow. Keep it backward-compatible: ReadyFile can ignore `values`. Add tests.

## 6. What to build now (v1)

State lives in memory only, and a reload resets the demo. All screens share one state, so actions carry over: a hold started on one screen shows on the others. Switch screens with in-memory view state, not URL changes.

Demo clock: Desk shows times from a demo clock, not the real clock. It starts Monday, November 9, 2026 at 8:35 am (set in desk-config.json). Each staff action moves it forward a few minutes, so the activity log reads naturally. Desk checks each petition when it arrives, so each log starts at the filing time.

Use correct singular and plural forms everywhere ("1 question", "2 questions"). Any desk-copy.json string with a count uses the same plural object as staffText (section 5), for example "{n} questions the counter would ask", "{n} questions still open", and "{n} incidents, in date order".

Top bar on every screen: "ReadyFile Desk" with "Allen Superior Court" under it, then nav links "Online petitions" and "Ex parte review", then the user for that section: "T. Reyes, Protective order specialist" or "Magistrate, Protection order review" (both fictional).

### Screen 1: Online petitions (specialist)

- Title "Online petitions". Under it: "Since the counter closed Friday at 4 pm, {total} stalking and harassment petitions came in online. {withQuestions} have questions the counter would ask."
- A "Show petitioner names" checkbox, off by default. When off, show initials, like "L. M.". Under it: "Updated {demo clock}".
- Filter buttons: "Questions found ({n})" (selected by default), "No questions ({n})", "All ({n})".
- Note beside them: "Desk checks stalking and harassment petitions. Domestic violence petitions go straight to review until those rules are written."
- One row per petition, oldest first, showing:
  - case type, name or initials, "Filed Sun 11:52 pm", and the case number
  - each finding's staffText with a question icon, or "No questions found"
  - contact: "Phone given" with a summary like "Texts OK. Calls weeknights, 7:30 to 10 pm.", or "No phone given" with "The question goes to review with the petition."
  - status: "Not held yet" (has questions and a phone number), "In review queue", "Held until Tue 8:37 am", "Magistrate asked for follow-up", or "Sent to review Tue 8:37 am"
  - an "Open petition" button
- Under the list, two short notes: "Desk runs the same checks as ReadyFile on every online stalking and harassment petition. Each question traces to one rule and its source." and "Nothing waits unless staff hold it. A hold lasts up to 24 hours. Then the petition goes to the magistrate, answered or not."

### Screen 2: Petition follow-up (specialist)

Breadcrumb "Online petitions / {case number}". Title "{Case type} petition from {full name}". Under it: "Filed online {weekday}, {month} {day} at {time}. Respondent: {name}." A status chip on the right, gold while held.

Hold panel, full width:

- Not held: "Not held". "It's in the magistrate's review queue now. Holding it gives the petitioner up to 24 hours to answer." Button: "Hold for follow-up". With no phone number, the button is off and the panel says "No phone number, so there's no one to follow up with."
- Held: "Hold ends {weekday} at {time}". "You held it at {time} {weekday}. It goes to the magistrate then, answered or not." Buttons: "Send to magistrate now" and "Preview the bench summary". If the magistrate asked for the follow-up, add "The magistrate asked for follow-up at {time}."
- Sent: "Sent to the magistrate". "Sent at {time}. The hold has ended."

Beside the hold text, a timeline strip. It starts at the latest counter opening (8 am, from desk-config.json) at or before the hold's start, or at or before the demo clock if there's no hold. So at 12:30 am it starts at 8 am the day before. It ends at 9 am the day after it starts (25 hours), or later if the hold end or the demo clock is later, rounded up to the hour. Lanes:

- "Counter open": 8 am to 4 pm, from desk-config.json
- "Call times": from the petition, or "None given"
- "Texts": "OK any time" or "Not OK"
- "Hold": from start to end. Before a hold, a dashed outline labeled "If you hold it now: until {time}".

Add a vertical "Now {time}" line, and hour labels every 4 hours from the start: 8 am, Noon, 4 pm, 8 pm, Midnight, 4 am, 8 am, and on if the strip is longer. Give the strip a text alternative that states the same times. Under it, one computed sentence:

- No overlap, texts OK: "The petitioner's call times don't overlap the counter's hours. A text link lets the petitioner add details before the hold ends."
- No overlap, texts not OK: "The petitioner's call times don't overlap the counter's hours, and the petitioner asked not to get texts."
- Overlap: "The petitioner's call times overlap the counter's hours from {start} to {end}."
- No call times: "The petition gives no call times."

Questions panel: "{n} questions the counter would ask". For each finding:

- the staffText, in bold
- the rule's questionText, in quotes, in a blue box
- "Rule {id}", "Source: {sourceCitation}", and a dashed "Wording not approved yet" badge when verified is false

Then a box titled "Keep it to information" with two examples side by side. "Information": "Stalking is defined as two or more incidents. Are there other times you want to describe?" "Advice": "You should add more incidents." and "This will be denied as it is." Under them: "The test: information tells the petitioner what the law says. Advice tells the petitioner what to do." (Keep this line outside `adviceExamples`. It must pass the banned-phrase scan.)

Petition panel: "Petition as filed", with "The petitioner's words, unchanged" on the right.

- Fields: Basis checked, Relationship, Respondent, Respondent's date of birth ("Blank" in blue when empty).
- The narrative on numbered lines (see Line numbers, section 7).
- "Desk found {n} incidents", and for each: "{date}. {how}. Lines {a} to {b}."
- "Incidents are split by paragraph and date phrases, the same way ReadyFile splits them."
- If the petitioner filed an amended petition, show it, with the time it was filed.

Contact panel, in a side column:

- Petitioner; Phone, masked like "(260) •••-••41", with a "Show number" / "Hide number" button; Texts; Voicemail; Calls.
- "Text message", with the message from desk-copy.json filled in: "Hi, this is Allen County staff about the form you sent on {weekday}. You can add more details here until {weekday} {time}: [link]. Reply STOP to end texts." The "until" time is the hold's end. Before a hold, use the end a hold started now would have, the same time as the timeline's dashed outline. Under it: "Neutral wording. It never names the case type or the other person."
- Before a hold: "Hold the petition to follow up." During a hold, two buttons:
  - "Text the link" (primary). After sending, it reads "Text the link again", and a note says "Link texted at {time}. Not opened yet." If texts aren't OK, hide this button and show "The petitioner asked not to get texts."
  - "Log a call". It opens "How did the call go?" with "Reached the petitioner", "No answer", and "Not safe to talk now". When the demo clock is outside the petitioner's call times, show "It's outside the petitioner's call times." Buttons "Save call" and "Cancel". Saving with nothing picked shows "Pick how the call went."

Activity panel: time and event, oldest first. Every action adds a line, for example "Sun 11:52 pm: Desk checked the petition and found 2 questions."

### Screen 3: Ex parte review list (magistrate)

Title "Ex parte review". Under it: "Petitions waiting for your review, oldest first." One row per petition in review, showing the case caption, case type, filed time, open questions ("None" or the count), follow-up ("Followed up: 3 incidents added" or "Not followed up"), the recorded outcome if any, and "Open". Held petitions don't appear until their hold ends.

### Screen 4: Bench summary (magistrate)

Breadcrumb "Ex parte review / {case number}". Title "{Petitioner's last name} v. {Respondent's last name}", for example "Moore v. Ostrander". Under it: "{Case type} petition. Filed online {weekday} at {time}, amended {weekday} at {time}. In your review queue since {weekday} at {time}." (Leave out "amended" when there's no amendment.)

Tabs: "Bench summary", "Amended petition" (only if there is one), "Original petition".

Bench summary tab:

- "Bench summary", then "Built from the {amended or original} petition. The petitioner's words are unchanged and sorted by date. Desk doesn't judge whether the petition meets any legal standard."
- Petitioner, Respondent, Relationship, Basis checked.
- "{n} incidents, in date order". Sort by each incident's `sortDate` (section 7). Incidents with no `sortDate` go last. Ties keep the order they were filed in. For each: "Incident {k}", the date as the petitioner wrote it, how it happened, the petitioner's words in full in the serif face, and a link "{Amended or Original} petition, lines {a} to {b}". The link opens that tab with those lines highlighted, plus a "Clear highlight" button.
- "Not tied to one incident": statements that aren't incidents, with their line links.
- "Same questions the counter asks": a table with every rule that applies to the case type and has a condition. Columns "Question" (the questionText) and "Status": "Answered {short weekday} {time}", like "Answered Mon 8:21 pm" (asked of the original, not of the current version), "Still open: {staffText}", or "No question".
- "Follow-up record": the activity log. Under it: "Staff can't edit petition text in Desk. Every word above is the petitioner's."

Side column, "Record the outcome":

- "Enter your order as usual. Recording the outcome here shows the court why online petitions are denied."
- Outcome choices: "Granted ex parte", "Set for hearing", "Denied". For harassment petitions, leave out "Granted ex parte": the PO-0102 booklet says harassment-only petitions need notice and a hearing before any relief (team source K2). Keep the choices per case type in desk-config.json.
- "Reason, if denied" checkboxes, enabled only when Denied is picked: "Facts don't meet the definition", "Time, place, or acts are too vague", "Facts are secondhand, with no affidavit", "Other". Under them: "From the common denial reasons in the PO-0102 booklet." Keep the list and its source in desk-config.json.
- "What the petitioner will be told", which changes with the outcome:
  - none picked: "Pick an outcome to see what the petitioner will be told."
  - Granted: "If the petitioner signed up for notices, the court's usual notices go out when the order is granted and served."
  - Hearing: "The petitioner gets the hearing date and time."
  - Denied: "The petitioner gets a new denial notice: your reason in plain words and the options available, in wording the court approves. No such notice exists today."
- "Save outcome". Errors: "Pick an outcome first." and "Pick at least one reason, or Other." When saved: "Saved as {outcome}. Your order is still entered as usual."

Side column, "{n} questions still open" (only when there are some): list them, then a button "Ask the specialist to follow up" if the petition gives a phone number and it has never been held. It starts the petition's one 24-hour hold and moves the petition back to the specialist's list as "Magistrate asked for follow-up". Then show "Sent to T. Reyes. It comes back to you within 24 hours." Without a phone number, show "No phone number, so there's no one to follow up with." If it was already held, show "This petition already had its 24-hour hold." instead of the button.

"Preview the bench summary" on Screen 2 opens this screen without the side column, with a "Back to the petition" link.

### Demo controls (development mode only)

Like ReadyFile's sample buttons, show these only in `npm run dev`, in a panel at the bottom of Screen 2:

- "Petitioner adds incidents through the link" (Lena only, after the link was texted): the clock moves to Monday 8:21 pm, the amended petition is added, and the log says "The petitioner filed an amended petition that adds 3 incidents."
- "Jump to the end of the hold": the clock moves to the hold's end, the petition goes to the magistrate, and the log says "The hold ended, and the petition went to the magistrate."
- "Reset demo"

## 7. Sample data (fictional)

Put this in content/desk-sample.json. Everything here is fictional. Use 555-01xx phone numbers only, and keep them out of src/.

Each incident uses ReadyFile's incident model (date, description, how it happened). Each description is the petitioner's words, exactly as filed. In production, incidents would come from ReadyFile or from running the ManualExtractor on the filed text. For v1, the sample file stores them.

Each sample incident also stores a `sortDate` (ISO date) used only for date order on the bench summary. It's never shown. Approximate dates get a stand-in day: "Mid August" is 2026-08-15, "Early September" is 2026-09-05, and "Last night" is the day before filing. An incident with no date has no `sortDate`. The values are listed with each petition below.

Line numbers: Desk wraps each filed narrative at 66 characters per line, breaking at spaces and keeping paragraph breaks, and numbers the lines from 1. An incident's line range is wherever its text appears.

### Lena Moore, 02D01-2611-PO-000412

Stalking. Filed Sunday, November 8, 11:52 pm. Phone (260) 555-0141. Texts OK, no voicemail, calls weeknights 7:30 to 10 pm. Respondent: Dale Ostrander, her neighbor. Not family, never dated. Address: Unit B of her duplex. Date of birth: blank.

Original petition. One paragraph and one incident (date "Friday, November 6, about 7 pm", in person, sortDate 2026-11-06):

```
On Friday night around 7 pm I got home from work and he was on my porch again yelling at me. I went inside and shut the screen door and he pulled it open so hard the latch broke. He came into my living room and shoved me into the wall by the door. I screamed at him to get out and the lady across the street called the police. The police came and arrested him that night. This is not the first time he has done something but this was the worst. I am scared to be at home and I don't feel safe walking to my car anymore.
```

Amended petition, filed Monday, November 9, 8:21 pm through the demo control. Paragraphs 1 to 4 are incidents, all in person, dated "Mid August", "Early September", "October 21", and "Friday, November 6, about 7 pm" (sortDates 2026-08-15, 2026-09-05, 2026-10-21, 2026-11-06). Paragraph 5 is not tied to one incident. "Mid August" has no hyphen on purpose: ManualExtractor's date phrases don't read "Mid-August" yet (see section 11).

```
Mid August, at home. He parked his truck across my driveway so I couldn't leave for work. When I asked him to move it he yelled that I would be sorry if I called anyone.

Early September, at my car. He followed me from my door to my car at 6:30 in the morning, right behind me, and stood by my window until I drove away.

October 21, at night. I saw him in the yard filming me through my front window with his phone. I closed the blinds and he was still there 20 minutes later.

Friday, November 6, about 7 pm. I got home from work and he was on my porch again yelling at me. I went inside and shut the screen door and he pulled it open so hard the latch broke. He came into my living room and shoved me into the wall by the door. I screamed at him to get out and the lady across the street called the police. The police came and arrested him that night.

I am scared to be at home and I don't feel safe walking to my car anymore.
```

### Keisha Turner, 02D01-2611-PO-000409

Harassment. Filed Saturday, November 7, 2:16 pm. No phone. Respondent: Brandon Hale, former coworker, born 1989-04-17.

```
On October 30 he sent me twelve messages in one night saying he knows where I live and that I will regret reporting him at work.

He showed up in the parking lot at my new job and waited by my car until security walked me out.
```

Incident 1: October 30, phone or text, sortDate 2026-10-30. Incident 2: no date, in person, no sortDate.

### Dana Whitfield, 02D01-2611-PO-000405

Stalking. Filed Friday, November 6, 9:40 pm. Phone (260) 555-0187. Texts OK, voicemail OK, calls any time. Respondent: Kyle Brenner, former classmate, born 1992-08-03.

```
On September 12 he followed my car from the grocery store to my apartment and parked across the street for an hour.

On October 3 he left a note on my windshield that listed where I had been that whole week.

He was waiting outside my work again last night.
```

Incident 1: September 12, in person, sortDate 2026-09-12. Incident 2: October 3, other, sortDate 2026-10-03. Incident 3: "Last night", in person (9 words), sortDate 2026-11-05.

### Marcus Reid, 02D01-2611-PO-000407

Harassment. Filed Saturday, November 7, 10:05 am. Phone (260) 555-0123. Texts OK, voicemail OK, calls any time. Respondent: Tara Quinn, former landlord, born 1985-11-22.

```
On October 18 she called my phone more than forty times in one afternoon and left messages calling me names.

On October 25 she posted my home address in a neighborhood group online and told people to come find me.
```

Incident 1: October 18, phone or text, sortDate 2026-10-18. Incident 2: October 25, online, sortDate 2026-10-25.

### Ana Perez, 02D01-2611-PO-000410

Stalking. Filed Sunday, November 8, 6:30 pm. No phone. Respondent: Victor Lane, former neighbor, born 1979-02-09.

```
On August 2 he sat in his car outside my house for two hours and drove off when I came outside.

On September 20 he came to my daughter's soccer game and stood behind me the whole time without saying anything.

On November 1 he mailed me photos of my front door that he had taken at night over several weeks.
```

Incident 1: August 2, in person, sortDate 2026-08-02. Incident 2: September 20, in person, sortDate 2026-09-20. Incident 3: November 1, other, sortDate 2026-11-01.

### Expected findings with today's rules

- Lena, original: stalking-two-incidents and respondent-dob-missing. Amended: respondent-dob-missing only.
- Keisha: incident-missing-date (incident 2).
- Dana: incident-too-short (incident 3, 9 words).
- Marcus and Ana: none.

## 8. Safety and privacy

- Fictional data only.
- No localStorage, sessionStorage, cookies, IndexedDB, or server storage. No network calls, analytics, external fonts, or CDN files. Self-host fonts (for example the @fontsource packages) or fall back to system fonts.
- Names are hidden in the list and phone numbers are masked by default. Both reset on reload.
- The text message never includes the case type, "stalking", "harassment", "protection order", "protective order", or the respondent's name.
- Logging a call outside the petitioner's call times shows a warning.
- Desk never sends real texts or makes real calls. Both are simulated.

## 9. Design

Desk is a desktop tool for court staff, so design for 1280 to 1440 pixels wide first. It must still work down to 360 pixels wide: rows and columns wrap, and wide tables scroll inside their own box.

Principles:

1. Serif text on a paper background means the petitioner's words, verbatim. Everything Desk says is in sans serif, so no one confuses the two.
2. Blue means a question to ask. Gold means time on the hold. There is no red or green anywhere, because Desk never judges a petition.
3. Panels are white with a 1 px border and 10 px corners, and no shadows. Buttons are at least 44 px tall, with 6 px corners.

Type: Public Sans (400, 500, 600, 700) for everything Desk says. Literata (400) only for the petitioner's words. Use tabular numbers for times and case numbers. Page titles 30 px bold, panel titles 20 to 22 px bold, body 15 px, labels 13 px. The petitioner's words are 17 px with 1.85 line height on numbered lines, with 12 px line numbers in Public Sans in a gutter with a thin rule.

Colors:

| Token | Value | Use |
|---|---|---|
| ground | #F2F4F6 | page background |
| surface | #FFFFFF | panels |
| ink | #15212E | main text |
| ink-2 | #2B3846 | secondary text |
| ink-3 | #4A5868 | labels, times, meta |
| muted | #66727F | disabled text, on white only |
| line | #D5DCE3 | panel borders |
| line-light | #E1E6EB | row dividers |
| control | #7D8A99 | control borders (3.5:1 on white, 3.2:1 on ground, for WCAG 1.4.11) |
| navy | #1E3A5F | top bar, primary buttons |
| navy-2 | #2E5281 | current nav item |
| on-navy | #C9D6E6 | secondary text on navy |
| question | #1D4F91 on #E6EEF9 | findings and questions to ask |
| hold | #E3B341, border #8A5A00, text #3D2A00 | hold bar on the timeline |
| hold-chip | #7A4E00 on #FBF1DC | hold status, time warnings |
| highlight | #FBEBC4 | highlighted petition lines |
| paper | #FBF8F1, border #E8E1D2 | the petitioner's words |
| line-number | #5B6876 | line numbers on paper |
| counter | #4A6A8F, white text | "Counter open" lane |
| texts | #DCE7F5, border #A9C0E0 | "Texts" lane |
| track | #EEF1F4 | timeline lanes |
| focus | 3 px #B07A12, 2 px offset | keyboard focus |

Layout: on Screen 2 the hold panel spans the full width, with the hold text on the left (about 360 px) and the timeline on the right. Screens 2 and 4 have a main column and a side column (about 380 px and 340 px wide) that moves below the main column on narrow screens.

## 10. Writing rules

- Follow PROMPT.md section 10, adjusted for staff. Use plain words and short sentences. Staff terms like "respondent", "ex parte" and "hold" are fine.
- Run the banned-phrase scan on desk-copy.json too. The advice examples quote "you should" on purpose. Keep them under one key, for example `adviceExamples`, that the scan skips, and add a test that they do contain a banned phrase.
- Desk text never uses "she", "he", "her", "him", "hers", or "his" for the petitioner, the respondent, or staff. Say "the petitioner", "the respondent", "the specialist", or use a name. Sample petitioners include men and women. Add a test that scans desk-copy.json and every staffText for these words.

## 11. Do not build yet

- A screen where the court approves question wording.
- An outcomes report. A suggested design: run Desk's checks silently for a few weeks to set a baseline denial rate, then turn on follow-up.
- Real e-filing integration, real texts and calls, and the real add-details flow behind the link (the demo control stands in for it).
- Access for advocates in counties without a specialist.
- Domestic violence rules.
- Teaching ManualExtractor to read hyphenated date phrases like "mid-August". That changes ReadyFile's behavior, so it needs its own change and tests.

## 12. Acceptance tests (fictional data only)

1. List: "Questions found" shows Lena, Keisha, and Dana. "No questions" shows Marcus and Ana. The counts match.
2. Privacy: names are hidden and phone numbers masked by default. The toggles reveal them.
3. Traceable: every finding shows a rule id that exists in rules.json, its source, and "Wording not approved yet" when verified is false.
4. Never holds on its own: on load, no petition is held. A hold starts only from "Hold for follow-up". During a hold, "Send to magistrate now" is present and works.
5. Hold ends: "Jump to the end of the hold" sends the petition to review and logs it.
6. Neutral text: the message for every sample petition has none of the words in section 8, and not the respondent's name.
7. Call times: logging a call outside the petitioner's call times shows the warning.
8. Lena's flow: hold, text the link, add incidents with the demo control, jump to the end of the hold. The bench summary shows 4 incidents in sortDate order (Mid August, Early September, October 21, November 6), and the stalking question shows "Answered Mon 8:21 pm". "Ask the specialist to follow up" is not offered, because the hold was used.
9. Verbatim: every incident on the bench summary appears word for word in the filed narrative.
10. Line links: an incident's line link opens the right tab with those lines highlighted.
11. Outcome: Save needs an outcome, and Denied needs a reason. Reasons are off unless Denied is picked. Harassment petitions don't offer "Granted ex parte".
12. Ask the specialist: on Dana's bench summary (never held), it moves the petition back to the specialist's list with a 24-hour hold. No petition is ever held twice.
13. ReadyFile unchanged: all existing tests pass, and ReadyFile never asks respondent-dob-missing.
14. Banned phrases: desk-copy.json passes the scan, except the advice examples, which must contain a banned phrase.
15. Accessibility: axe-core (WCAG 2.2 AA) passes on all four Desk screens, with full keyboard use and visible focus. axe-core doesn't check non-text contrast, so also check by hand that control borders, the timeline lanes, and the focus ring are at least 3:1 against what's behind them.
16. Plurals and pronouns: staffText and counted desk-copy.json strings read correctly for 0, 1, and 2 (for example "no incidents are described", "1 question", "2 questions"). desk-copy.json and staffText contain none of the pronouns in section 10.

## 13. How to work

1. Read this brief, PROMPT.md, README.md, and src/checker/. If anything conflicts or is unclear, ask me before coding.
2. Propose a plan and file structure, then wait for my OK.
3. Build in this order: the second page and Desk shell, then rule and checker changes with tests, then sample data and the demo clock, then Screens 1 to 4, then demo controls, then tests.
4. Run all tests and fix failures before calling a step done.
5. Do not build anything from section 11.
6. Finish by adding a "ReadyFile Desk" section to README.md: how to open it, what each new content file controls, which rules are still unverified, and open TODOs.
