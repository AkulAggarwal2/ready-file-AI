"""Settings and fixed text. Everything a non-programmer might need to change lives here."""

import os
from pathlib import Path

from dotenv import load_dotenv

ASSISTANT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ASSISTANT_DIR / ".env")

DOCS_DIR = Path(os.getenv("PO_DOCS_DIR", ASSISTANT_DIR / "docs"))

# Model settings
MODEL = os.getenv("PO_MODEL", "claude-sonnet-5-5")
EFFORT = os.getenv("PO_EFFORT", "medium")
MAX_TOKENS = 16000

# Retrieval settings
CHUNK_WORDS = 200  # target words per chunk
CHUNK_OVERLAP_WORDS = 40  # words repeated at the start of the next chunk
TOP_K = 5  # chunks sent to the model
# Below this top BM25 score we treat the question as not covered by the docs
# and answer "I don't know" without calling the model. Kept low on purpose: BM25
# scores overlap between covered and uncovered questions (e.g. "what does ex parte
# mean" ~3.7 vs "divorce in Ohio" ~3.4), so this only catches near-zero matches.
# The model makes the finer "is this covered?" call.
MIN_TOP_SCORE = 2.0

IDK_ANSWER = "I don't know — please contact the court self-help center."

ADVICE_REFERRAL = (
    "This is legal information, not legal advice. For advice about your own "
    "situation, contact a lawyer, a legal aid office, or a domestic violence advocate."
)

# Safety message added to every response. 911 needs no verification, so it is always shown.
SAFETY_MESSAGE = "If you are in danger right now, call 911."
# TODO(team): fill in and check the hotline number below, then set SAFETY_VERIFIED = True.
# Until then the hotline sentence is left out of answers entirely.
SAFETY_VERIFIED = False
HOTLINE_MESSAGE = (
    "For confidential support, call TODO: team to add and check the statewide domestic "
    "violence hotline number."
)
