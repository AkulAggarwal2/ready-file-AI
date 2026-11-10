"""Run every case in questions.json through the real pipeline and print a pass/fail table.

    python evals/run_evals.py            # all cases (calls the Claude API)
    python evals/run_evals.py A1 U2      # only cases whose id starts with these

Exit code is 0 only if every case passes. Full results go to evals/last_run.json.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pydantic import ValidationError  # noqa: E402

from po_assistant import config  # noqa: E402
from po_assistant.assistant import Assistant  # noqa: E402
from po_assistant.docs_loader import load_chunks  # noqa: E402
from po_assistant.schema import Response  # noqa: E402

EVALS_DIR = Path(__file__).resolve().parent


def run_checks(response: Response, checks: dict, doc_urls: set[str], path: str) -> list[str]:
    """Return the names of failed checks (empty list = pass)."""
    failed = []
    # A failed API call falls back to "I don't know", which would otherwise make
    # unanswerable cases pass for the wrong reason.
    if path == "api_error":
        failed.append("no_api_error")
    text = response.answer.lower()
    urls = [s.url for s in response.sources]
    is_idk = response.answer.startswith(config.IDK_ANSWER)

    # Global checks, every case
    try:
        Response.model_validate(response.model_dump())
    except ValidationError:
        failed.append("schema_valid")
    if config.SAFETY_MESSAGE not in response.answer:
        failed.append("safety_message")
    if any(u not in doc_urls for u in urls):
        failed.append("sources_are_doc_urls")
    if is_idk and not response.needs_human:
        failed.append("idk_needs_human")

    # Per-case checks
    if "expect_idk" in checks and is_idk != checks["expect_idk"]:
        failed.append("expect_idk" if checks["expect_idk"] else "expect_answer")
    if "needs_human" in checks and response.needs_human != checks["needs_human"]:
        failed.append("needs_human")
    if "answer_contains_any" in checks and not any(s.lower() in text for s in checks["answer_contains_any"]):
        failed.append("answer_contains_any")
    if "answer_not_contains" in checks and any(s.lower() in text for s in checks["answer_not_contains"]):
        failed.append("answer_not_contains")
    if "sources_include_any" in checks and not any(p in u for u in urls for p in checks["sources_include_any"]):
        failed.append("sources_include_any")
    if checks.get("has_advice_referral") and config.ADVICE_REFERRAL not in response.answer:
        failed.append("has_advice_referral")
    return failed


def main(prefixes: list[str]) -> int:
    cases = json.loads((EVALS_DIR / "questions.json").read_text())["cases"]
    if prefixes:
        cases = [c for c in cases if c["id"].startswith(tuple(prefixes))]

    chunks = load_chunks()
    doc_urls = {c.url for c in chunks}
    assistant = Assistant(chunks)

    results = []
    for case in cases:
        print(f"running {case['id']} ...", file=sys.stderr)
        response, trace = assistant.answer_with_trace(case["question"])
        failed = run_checks(response, case["checks"], doc_urls, trace.path)
        results.append({
            "id": case["id"],
            "category": case["category"],
            "question": case["question"],
            "passed": not failed,
            "failed_checks": failed,
            "path": trace.path,
            "attempts": trace.attempts,
            "errors": trace.errors,
            "retrieved": trace.retrieved,
            "response": response.model_dump(),
        })

    widths = (24, 13, 6, 17)
    header = ("case", "category", "result", "path")
    print()
    print("  ".join(h.ljust(w) for h, w in zip(header, widths)) + "  failed checks")
    print("-" * 90)
    for r in results:
        row = (r["id"], r["category"], "PASS" if r["passed"] else "FAIL", r["path"])
        print("  ".join(v.ljust(w) for v, w in zip(row, widths)) + "  " + (", ".join(r["failed_checks"]) or "-"))
    print("-" * 90)

    by_cat: dict[str, list[bool]] = {}
    for r in results:
        by_cat.setdefault(r["category"], []).append(r["passed"])
    for cat, passes in by_cat.items():
        print(f"{cat:<13} {sum(passes)}/{len(passes)}")
    total = sum(r["passed"] for r in results)
    print(f"{'TOTAL':<13} {total}/{len(results)}")

    (EVALS_DIR / "last_run.json").write_text(json.dumps({
        "run_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": config.MODEL,
        "effort": config.EFFORT,
        "results": results,
    }, indent=2))
    return 0 if total == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
