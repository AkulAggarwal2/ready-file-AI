"""Command-line mode.

    python cli.py "Is there a filing fee?"          # one question, readable output
    python cli.py --json "Is there a filing fee?"   # one question, raw JSON
    python cli.py                                   # interactive; blank line or Ctrl-D to quit
"""

import argparse
import json
import sys

from po_assistant.assistant import Assistant
from po_assistant.schema import Response


def show(response: Response, as_json: bool) -> None:
    if as_json:
        print(response.model_dump_json(indent=2))
        return
    print()
    print(response.answer)
    print()
    if response.sources:
        print("Sources:")
        for s in response.sources:
            print(f"  - {s.title}\n    {s.url}")
    print(f"Confidence: {response.confidence}   Needs a person to follow up: {'yes' if response.needs_human else 'no'}")
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Indiana protection order filing info (legal information, not advice).")
    parser.add_argument("question", nargs="*", help="question to ask; omit for interactive mode")
    parser.add_argument("--json", action="store_true", help="print the raw JSON response")
    parser.add_argument("--trace", action="store_true", help="also print retrieval and validation details")
    args = parser.parse_args()

    assistant = Assistant()

    def ask(q: str) -> None:
        response, trace = assistant.answer_with_trace(q)
        show(response, args.json)
        if args.trace:
            print(json.dumps(trace.__dict__, indent=2), file=sys.stderr)

    if args.question:
        ask(" ".join(args.question))
        return 0

    print("Ask about filing a protection order in Indiana. Press Enter on a blank line to quit.")
    while True:
        try:
            q = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if not q:
            return 0
        ask(q)


if __name__ == "__main__":
    raise SystemExit(main())
