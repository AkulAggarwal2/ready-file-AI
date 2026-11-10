"""Data shapes: what we ask the model for, and what we return to the user."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Confidence = Literal["high", "medium", "low"]


class ModelReply(BaseModel):
    """The JSON the model must return. Anything else counts as invalid."""

    model_config = ConfigDict(extra="forbid")

    answerable: bool
    answer: str
    source_ids: list[str]
    confidence: Confidence
    needs_human: bool
    is_advice_request: bool


class Source(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    url: str


class Response(BaseModel):
    """The JSON the app returns: {answer, sources, confidence, needs_human}."""

    model_config = ConfigDict(extra="forbid")

    answer: str = Field(min_length=1)
    sources: list[Source]
    confidence: Confidence
    needs_human: bool
