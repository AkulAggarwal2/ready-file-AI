"""BM25 keyword search over document chunks."""

import re
from dataclasses import dataclass

from rank_bm25 import BM25Okapi

from . import config
from .docs_loader import Chunk

STOPWORDS = frozenset(
    """a an and are as at be been but by can could do does for from had has have how i if in
    into is it its me my no not of on or our should so than that the their them then there
    these they this to was we were what when where which who why will with would you your""".split()
)


def _stem(word: str) -> str:
    """Very light plural folding so 'fees'/'fee' and 'copies'/'copy' match."""
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def tokenize(text: str) -> list[str]:
    return [_stem(w) for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOPWORDS]


@dataclass(frozen=True)
class Hit:
    chunk: Chunk
    score: float


class Index:
    def __init__(self, chunks: list[Chunk]):
        self.chunks = chunks
        self._bm25 = BM25Okapi([tokenize(c.title + " " + c.text) for c in chunks])

    def search(self, query: str, k: int = config.TOP_K) -> list[Hit]:
        tokens = tokenize(query)
        if not tokens:
            return []
        scores = self._bm25.get_scores(tokens)
        ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:k]
        return [Hit(self.chunks[i], float(scores[i])) for i in ranked if scores[i] > 0]
