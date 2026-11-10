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
# If the top chunk holds less than this share (0-1) of the question's IDF-weighted
# terms, we treat the question as not covered and answer "I don't know" without
# calling the model. A share, unlike a raw BM25 score, keeps its meaning as docs are
# added. Kept very low on purpose: coverage overlaps between covered and uncovered
# questions ("how long does an order usually last" ~0.26 vs "pizza recipe" ~0.24), and
# long questions padded with off-topic words score low (the injection eval ~0.07), so
# this only catches near-zero matches. The model makes the real "is this covered?" call.
MIN_COVERAGE = 0.05

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
