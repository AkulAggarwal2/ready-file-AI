"""The whole question -> answer pipeline.

retrieve -> coverage gate -> ask Claude -> validate (retry once) -> code-enforced guards.
The guards (sources, contact details, advice referral, safety message) run in code so the model can't skip them.
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Callable

from pydantic import ValidationError

from . import config
from .docs_loader import Chunk, load_chunks
from .prompts import SYSTEM_PROMPT, build_user_message
from .retrieval import Index
from .schema import ModelReply, Response, Source

log = logging.getLogger(__name__)

# An LLM is any function (system prompt, user message) -> reply text.
# The real one calls Claude; tests pass a fake.
LLM = Callable[[str, str], str]

ADVICE_PATTERN = re.compile(
    r"\b(should (i|we)|do i have a (good |strong )?case|will i win|what are my chances|"
    r"what would you do|do you (recommend|suggest)|is it (worth|better)|which (one|option) is best)\b",
    re.IGNORECASE,
)


PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)")
EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
URL_PATTERN = re.compile(r"(?:https?://|www\.)[^\s<>()\[\]\"']+|\b[\w-]+(?:\.[\w-]+)*\.(?:gov|org|com|us|net)(?:/[^\s<>()\[\]\"']*)?")


def _phone_digits(text: str) -> set[str]:
    return {re.sub(r"\D", "", m)[-10:] for m in PHONE_PATTERN.findall(text)}


def _norm_link(text: str) -> str:
    text = text.lower().rstrip(".,;:!?/")
    return re.sub(r"^(?:https?://)?(?:www\.)?", "", text)


def ungrounded_contacts(answer: str, cited: list[Chunk]) -> list[str]:
    """Phone numbers, emails, and links in `answer` that don't appear in any cited chunk."""
    source_text = "\n".join([c.text for c in cited] + [c.url for c in cited])
    known_phones = _phone_digits(source_text)
    known_links = {_norm_link(m) for m in EMAIL_PATTERN.findall(source_text) + URL_PATTERN.findall(source_text)}
    bad = [m for m in PHONE_PATTERN.findall(answer) if re.sub(r"\D", "", m)[-10:] not in known_phones]
    emails = EMAIL_PATTERN.findall(answer)
    # Drop URL matches that are just the domain part of an email we already check.
    links = emails + [m for m in URL_PATTERN.findall(answer) if not any(m in e for e in emails)]
    bad += [m for m in links if not any(_norm_link(m) in k or k.startswith(_norm_link(m)) for k in known_links)]
    return bad


class InvalidReply(Exception):
    pass


@dataclass
class Trace:
    """What happened inside one answer() call; used by evals and the UI's debug view."""

    retrieved: list[tuple[str, float]] = field(default_factory=list)
    path: str = ""  # "answered" | "no_match" | "model_idk" | "no_valid_sources" | "ungrounded_contact" | "invalid_json" | "api_error"
    attempts: int = 0
    errors: list[str] = field(default_factory=list)


def claude_llm(system: str, user: str) -> str:
    import anthropic

    client = anthropic.Anthropic()
    response = client.beta.messages.create(
        model=config.MODEL,
        max_tokens=config.MAX_TOKENS,
        system=system,
        messages=[{"role": "user", "content": user}],
        thinking={"type": "adaptive"},
        output_config={"effort": config.EFFORT},
        # If a safety classifier declines, the API re-runs the request on a fallback model.
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if response.stop_reason == "refusal":
        raise InvalidReply("model declined the request (stop_reason=refusal)")
    if response.stop_reason == "max_tokens":
        raise InvalidReply("reply was cut off (stop_reason=max_tokens)")
    return "".join(block.text for block in response.content if block.type == "text")


def parse_reply(text: str) -> ModelReply:
    """Validate the model's text as a ModelReply. Tolerates code fences, nothing else."""
    cleaned = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", text.strip())
    if not cleaned:
        raise InvalidReply("reply was empty")
    try:
        return ModelReply.model_validate_json(cleaned)
    except ValidationError as e:
        raise InvalidReply(f"{e.error_count()} schema error(s), first: {e.errors(include_url=False)[0]['msg']}") from e


def is_advice_question(question: str) -> bool:
    return bool(ADVICE_PATTERN.search(question))


def _finish(answer: str, sources: list[Source], confidence: str, needs_human: bool, advice: bool) -> Response:
    parts = [answer]
    if advice:
        parts.append(config.ADVICE_REFERRAL)
    parts.append(config.SAFETY_MESSAGE)
    if config.SAFETY_VERIFIED:
        parts[-1] += " " + config.HOTLINE_MESSAGE
    return Response(
        answer="\n\n".join(parts),
        sources=sources,
        confidence=confidence,
        needs_human=needs_human or advice,
    )


def _idk(advice: bool) -> Response:
    return _finish(config.IDK_ANSWER, [], "low", True, advice)


class Assistant:
    def __init__(self, chunks: list[Chunk] | None = None, llm: LLM | None = None):
        self.index = Index(chunks if chunks is not None else load_chunks())
        self.llm = llm or claude_llm

    def answer(self, question: str) -> Response:
        return self.answer_with_trace(question)[0]

    def answer_with_trace(self, question: str) -> tuple[Response, Trace]:
        trace = Trace()
        question = question.strip()
        advice = is_advice_question(question)

        hits = self.index.search(question)
        trace.retrieved = [(h.chunk.id, round(h.score, 2)) for h in hits]
        if not hits or hits[0].score < config.MIN_TOP_SCORE:
            trace.path = "no_match"
            return _idk(advice), trace

        chunks = [h.chunk for h in hits]
        reply = self._ask_with_retry(question, chunks, trace)
        if reply is None:
            return _idk(advice), trace

        advice = advice or reply.is_advice_request
        if not reply.answerable or not reply.answer.strip():
            trace.path = "model_idk"
            return _idk(advice), trace

        # Sources come only from chunks we retrieved; the model can't introduce a URL.
        by_id = {c.id: c for c in chunks}
        sources: list[Source] = []
        cited: list[Chunk] = []
        for sid in reply.source_ids:
            chunk = by_id.get(sid)
            if chunk is None:
                trace.errors.append(f"dropped unknown source id {sid!r}")
                continue
            cited.append(chunk)
            if all(s.url != chunk.url for s in sources):
                sources.append(Source(title=chunk.title, url=chunk.url))
        if not sources:
            trace.path = "no_valid_sources"
            return _idk(advice), trace

        # A phone number, email, or link must come from a cited document, never the model's memory.
        bad = ungrounded_contacts(reply.answer, cited)
        if bad:
            trace.errors.append(f"contact details not in cited documents: {bad}")
            trace.path = "ungrounded_contact"
            return _idk(advice), trace

        trace.path = "answered"
        needs_human = reply.needs_human or reply.confidence == "low"
        return _finish(reply.answer.strip(), sources, reply.confidence, needs_human, advice), trace

    def _ask_with_retry(self, question: str, chunks: list[Chunk], trace: Trace) -> ModelReply | None:
        error: str | None = None
        for _ in range(2):  # first try + one retry
            trace.attempts += 1
            try:
                text = self.llm(SYSTEM_PROMPT, build_user_message(question, chunks, retry_error=error))
                return parse_reply(text)
            except InvalidReply as e:
                error = str(e)
                trace.errors.append(error)
                trace.path = "invalid_json"
            except Exception as e:  # network, auth, rate limit: don't retry, fail safe
                log.warning("Claude API call failed: %s", e)
                trace.errors.append(f"{type(e).__name__}: {e}")
                trace.path = "api_error"
                return None
        return None


_default: Assistant | None = None


def answer(question: str) -> Response:
    """Answer with a shared Assistant (docs are loaded once)."""
    global _default
    if _default is None:
        _default = Assistant()
    return _default.answer(question)
