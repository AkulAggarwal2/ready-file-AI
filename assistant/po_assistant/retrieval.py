"""BM25 keyword search over document chunks."""

import math
import re
from collections import Counter
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
        docs = [tokenize(c.title + " " + c.text) for c in chunks]
        self._bm25 = BM25Okapi(docs)
        self._terms = {c.id: set(d) for c, d in zip(chunks, docs)}
        self._doc_freq = Counter(t for d in docs for t in set(d))

    def search(self, query: str, k: int | None = None) -> list[Hit]:
        k = config.TOP_K if k is None else k
        tokens = tokenize(query)
        if not tokens:
            return []
        scores = self._bm25.get_scores(tokens)
        ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:k]
        return [Hit(self.chunks[i], float(scores[i])) for i in ranked if scores[i] > 0]

    def coverage(self, query: str, chunk: Chunk) -> float:
        """Share (0-1) of the query's IDF weight whose terms appear in `chunk`.

        Unlike a raw BM25 score this stays on the same scale as docs are added or removed.
        Uses Lucene's smoothed IDF, which is always positive (rank_bm25's is 0 or below for
        words in half the docs) and highest for words found in no document, the most
        telling sign that the docs don't cover the question.
        """
        n_docs = len(self.chunks)
        weights = {
            t: math.log(1 + (n_docs - self._doc_freq[t] + 0.5) / (self._doc_freq[t] + 0.5))
            for t in set(tokenize(query))
        }
        total = sum(weights.values())
        if not total:
            return 0.0
        return sum(w for t, w in weights.items() if t in self._terms[chunk.id]) / total
