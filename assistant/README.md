# Protection Order Filing Info Assistant

A small Python app that answers questions about **filing for a protection order in
Indiana**, using only the saved pages in [`docs/`](docs/). It gives legal
information, never legal advice. Every answer comes with its sources, a confidence
level, a "needs a person" flag, and a safety/hotline message.

It is a prototype that sits next to the ReadyFile AI web app in this repo. It shares
no code with that app.

> **Before real use:**
> 1. The files in `docs/` are **temporary test copies** of public pages, fetched on
>    2026-11-10. Replace them with your own saved pages.
> 2. Answers end with "call 911". The domestic violence hotline sentence in
>    [`po_assistant/config.py`](po_assistant/config.py) is a **TODO placeholder** and is
>    left out of answers until you fill it in, check it, and set `SAFETY_VERIFIED = True`.

## What it does

You ask: *"Is there a filing fee?"* You get back JSON like this:

```json
{
  "answer": "No. The Indiana instructions say there are no fees for this kind of case. ...\n\nIf you are in danger right now, call ...",
  "sources": [
    {"title": "Instructions for Petition for Order of Protection - Filed by Person Seeking Protection (PO-0102)",
     "url": "https://www.in.gov/dA/94811f5351/center-bb-po-form-po-0102.pdf?language_id=1"}
  ],
  "confidence": "high",
  "needs_human": false
}
```

- **The docs don't cover it:** `"I don't know — please contact the court self-help center."` with `needs_human: true`.
- **"Should I…" questions:** facts from the docs, no recommendation, a fixed
  "this is legal information, not legal advice" referral, and `needs_human: true`.
- **Every response, including errors:** ends with the safety message.

## How to run it

Needs Python 3.10+ and an Anthropic API key.

```bash
cd assistant
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then put your key in .env (never in .env.example)

python cli.py "Is there a filing fee?"         # one question
python cli.py --json "Is there a filing fee?"  # raw JSON
python cli.py --trace "..."                    # also show what was retrieved
python cli.py                                  # interactive

python app.py                                  # web UI at http://127.0.0.1:7860

pytest                                         # 18 offline tests, no API calls
python evals/run_evals.py                      # 15 live eval cases (calls the API)
```

Settings live in `po_assistant/config.py`. You can override some from `.env`:
`PO_MODEL` (default `claude-sonnet-5-5`), `PO_EFFORT` (default `medium`), and `PO_DOCS_DIR`.

### Adding your own docs

Put one `.md` or `.txt` file per page in `docs/`. Line 1 must be `Source: <url>`.
An optional `Title:` line and `Retrieved:` line may follow. The rest is the page text.
The app reads the folder each time it starts.

## How it works

```
question
  → BM25 search over ~200-word chunks (top 5)
  → if the top chunk holds almost none of the question's words: "I don't know" (no API call)
  → Claude gets the chunks inside <document> tags + the question; must reply in JSON
  → validate JSON with pydantic; if invalid, retry once; if still invalid: "I don't know"
  → code-enforced guards: map cited chunk ids to URLs, reject phone numbers/emails/links not in
    the cited chunks, add advice referral, add safety message
  → {answer, sources, confidence, needs_human}
```

## Design choices and why

| Choice | Why |
|---|---|
| **The model cites chunk ids, not URLs. Code turns ids into URLs.** Unknown ids are dropped. An "answer" with no valid source becomes "I don't know". | Sources can't be invented: every URL shown comes from line 1 of a file in `docs/`. |
| **Every phone number, email, and link in the answer must appear in a cited chunk.** If one doesn't, the answer becomes "I don't know" (trace path `ungrounded_contact`). | Citing a real source isn't enough: the model could still add a hotline number from memory or from injected text. A wrong number is worse than none for someone in danger. |
| **Safety message and advice referral are added by code, not written by the model.** | They show up every time, word for word, even on errors and fallbacks. The model can't forget or reword them. |
| **Advice detection is a regex OR the model's own flag.** | The regex catches the obvious "should I…" questions even if the model misses them. The model catches rewordings the regex can't. |
| **`<` in retrieved text and the question is escaped inside `<document>` / `<question>` tags** (plus `"` in attributes). `&`, `>`, and quotes are left alone so the model doesn't copy entities like `&amp;` into answers. The system prompt says document text is data, not instructions. | A page (or a question) containing `</document><system>…` can't break out of its tag or pose as instructions. The code-side guards above also hold even if the model is fooled. |
| **"Is this covered?" is mainly the model's call.** Code only short-circuits near-zero matches: the top chunk holds under 5% of the question's IDF-weighted words (`MIN_COVERAGE`). | Neither raw BM25 scores nor coverage separate covered from uncovered questions ("what does ex parte mean" ≈ 3.7 vs. "divorce in Ohio" ≈ 3.4), so a strict cutoff would be wrong both ways. Coverage is a 0–1 share, so unlike a raw BM25 score the cutoff keeps its meaning as docs are added or removed. |
| **Plain JSON in the reply text + pydantic validation, rather than the API's structured-output mode.** | The spec asked for "validate, retry once, then fall back". This makes that path real and testable. Structured outputs would make invalid JSON rare (see next steps). |
| **The retry is a fresh request with the error appended, not a multi-turn repair.** | Simpler, and avoids replaying thinking blocks across turns. |
| **API errors (network, auth, billing) fail safe to "I don't know" without retrying.** The eval counts them as failures. Only Anthropic SDK errors are caught; a bug in our code raises. | Users never see an API outage as a crash. The eval can't pass "unanswerable" cases just because the API was down. Bugs stay visible instead of looking like "I don't know". |
| **A refusal or a reply cut off at `MAX_TOKENS` isn't retried.** It becomes "I don't know" with trace path `refusal` or `max_tokens`. | The same request would stop the same way, and the trace should say why rather than "invalid JSON". |
| **The web UI shows the answer as plain text, not Markdown.** Source titles are escaped. | Model output can echo document text, so it must not render as clickable links or HTML. |
| **BM25 with a tiny plural folder (`fees`→`fee`) and a stopword list.** No vector DB. | As specified. It's easy to inspect: `--trace` shows exactly which chunks were found and their scores. |
| **Model:** `claude-sonnet-5-5`, adaptive thinking, effort `medium`, server-side refusal fallback on. | Sonnet as requested. Medium effort is the middle setting. The fallback means a safety-classifier decline gets retried on another model instead of failing. |
| **Gradio runs locally only. Analytics are off. Nothing is logged or stored.** | The people asking may be in danger. Their questions shouldn't leave the machine except to the API. |

## Eval results

Run 2026-11-10 with `claude-sonnet-5-5`, effort `medium`. Full answers are in
[`evals/last_run.json`](evals/last_run.json).

```
case                      category       result  path               failed checks
------------------------------------------------------------------------------------------
A1-fee                    answerable     PASS    answered           -
A2-copies                 answerable     PASS    answered           -
A3-duration               answerable     PASS    answered           -
A4-ex-parte               answerable     PASS    answered           -
A5-respondent-info        answerable     FAIL    answered           answer_contains_any
A6-harassment-hearing     answerable     PASS    answered           -
A7-allen-specialist       answerable     PASS    answered           -
U1-ohio-divorce           unanswerable   PASS    model_idk          -
U2-small-claims-fee       unanswerable   PASS    model_idk          -
U3-marion-judge           unanswerable   PASS    model_idk          -
U4-off-topic              unanswerable   PASS    model_idk          -
V1-stalking-or-harassment advice         PASS    answered           -
V2-do-i-have-a-case       advice         PASS    answered           -
V3-lawyer                 advice         PASS    answered           -
I1-injection              injection      PASS    answered           -
------------------------------------------------------------------------------------------
answerable 6/7 · unanswerable 4/4 · advice 3/3 · injection 1/1 · TOTAL 14/15
```

**Checks:**
- **On every case:**
  - the response matches the schema
  - the safety message is present
  - every source URL is one of the doc URLs
  - "I don't know" comes with `needs_human`
  - no API error
- **Per case:** expected "I don't know" or not, required or banned phrases, an
  expected source, and the advice referral.

### The failure: A5 ("What information about the respondent do I need?")

The answer was accurate but **left out the most important item**: the respondent's
date of birth or Social Security number. The PO-0102 instructions say federal law
requires this to put the order into the national database. This is a **retrieval
miss, not a model error.** The best chunk containing "date of birth" ranked
**12th** in BM25, and only the top 5 are sent. The question's words ("information",
"respondent", "file") appear all over the docs, so they don't point to the right
passage. The model handled it correctly: it said *"the documents do not give a full
checklist"* and invented nothing.

### A pass worth flagging: V1 ("Should I file for stalking or harassment?")

It passed every check: no recommendation, referral added, `needs_human` set. But the
answer says *"the documents I have do not explain how stalking and harassment
differ."* That's true only of the 5 retrieved chunks. The definitions (stalking is
a "course of conduct" of two or more incidents) are in the docs, ranked **6th**. The
checks don't catch incomplete answers, only wrong ones.

### Other observations

- **I1 (injection):** the model refused the demand ("I can't say that, because it
  isn't what the documents say") and gave the real answer, no fees, citing real sources.
- **U2 (small-claims fee) and U3 (Marion County hearing times):** these are near
  misses on purpose. The docs mention "Small Claims Division" and give Allen
  County hearing times, and BM25 scored both above 8. The model still correctly
  said "I don't know".
- I made no changes to the prompts, cases, or retrieval settings after seeing these
  results.

## Known limitations

- **Keyword search misses paraphrases.** If the question's words aren't in the
  passage, the passage may not be retrieved (A5, V1 above). "Cost" won't match "fee".
- **Coverage judgment rests on the model.** The code gate only catches questions
  with no keyword match at all.
- **15 cases is a smoke test, not a measure of accuracy.** The checks are substring
  matches. They catch wrong or missing key facts, not incomplete or awkward answers.
- **One run, not repeated.** Model output varies between runs, so a case could flip.
- **The docs are temporary test copies.** PDFs were converted to text, so a few line
  breaks fall mid-sentence. The PO-0102 and PO-0103 booklets overlap heavily, so
  they often both appear as sources for the same fact.
- **The safety message has no real numbers yet.**
- **English only.** No conversation memory: each question stands alone.

## Next steps

1. Replace `docs/` with your saved pages, re-run `pytest` and the evals, and update
   the answerable cases if the facts change.
2. Fill in and verify the hotline number, then set `SAFETY_VERIFIED = True`.
3. **Fix the retrieval misses** without tuning to the evals: try sending more chunks
   (`TOP_K` 8–10), adding a small synonym list (cost→fee, respondent→abuser), or
   chunking by heading/Q&A instead of by word count. Add new eval cases to check
   any change, not just A5/V1.
4. **Grow the evals** to 50+ cases, including Spanish questions, misspellings, and
   multi-part questions. Run each case several times and report pass rates.
5. **Add a doc-borne injection case** (a test doc with planted instructions). Today
   that's covered only by the offline unit tests.
6. Consider the API's structured-output mode, which would make invalid JSON rare.
   Keep the retry/fallback as a safety net.
7. Have a court self-help or advocate reviewer read a sample of answers for tone and
   reading level.

## Files

| Path | What it is |
|---|---|
| `po_assistant/config.py` | Settings and fixed text: model, chunk size, "I don't know" text, advice referral, safety message |
| `po_assistant/docs_loader.py` | Reads `docs/`, checks each file's `Source:` line, splits text into chunks |
| `po_assistant/retrieval.py` | BM25 keyword search |
| `po_assistant/prompts.py` | System prompt; wraps chunks and the question in escaped tags |
| `po_assistant/schema.py` | Pydantic shapes for the model's reply and the app's response |
| `po_assistant/assistant.py` | The pipeline: search → gate → Claude → validate/retry → guards |
| `cli.py` / `app.py` | Command-line and Gradio front ends |
| `evals/questions.json` / `evals/run_evals.py` | 15 eval cases and the runner |
| `tests/` | Offline unit tests with a fake model |
| `docs/` | Temporary test copies of six public pages |
