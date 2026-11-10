"""Read the saved source pages in docs/ and split them into chunks for search."""

from dataclasses import dataclass
from pathlib import Path

from . import config


@dataclass(frozen=True)
class Chunk:
    id: str  # "<doc-slug>#<n>", the only handle the model may cite
    doc: str  # doc slug (file name without extension)
    title: str
    url: str
    text: str


def parse_doc(path: Path) -> tuple[str, str, str]:
    """Return (url, title, body). Line 1 must be 'Source: <url>'; 'Title:' and 'Retrieved:' are optional."""
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or not lines[0].startswith("Source:"):
        raise ValueError(f"{path.name}: first line must be 'Source: <url>'")
    url = lines[0].removeprefix("Source:").strip()
    if not url.startswith(("http://", "https://")):
        raise ValueError(f"{path.name}: source is not a URL: {url!r}")

    title = path.stem
    body_start = 1
    for i, line in enumerate(lines[1:4], start=1):
        if line.startswith("Title:"):
            title = line.removeprefix("Title:").strip()
            body_start = i + 1
        elif line.startswith("Retrieved:"):
            body_start = i + 1
    return url, title, "\n".join(lines[body_start:]).strip()


def chunk_text(text: str, size: int = config.CHUNK_WORDS, overlap: int = config.CHUNK_OVERLAP_WORDS) -> list[str]:
    """Split on line boundaries into chunks of about `size` words.

    Each new chunk starts with the last lines (about `overlap` words) of the one before,
    so a fact that straddles a boundary still appears whole in one chunk.
    """
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    chunks: list[str] = []
    current: list[str] = []
    count = 0
    fresh = False  # whether `current` has lines that no chunk holds yet
    for line in lines:
        current.append(line)
        count += len(line.split())
        fresh = True
        if count >= size:
            chunks.append("\n".join(current))
            tail: list[str] = []
            tail_count = 0
            for prev in reversed(current):
                n = len(prev.split())
                if tail_count + n > overlap:
                    break
                tail.insert(0, prev)
                tail_count += n
            current, count, fresh = tail, tail_count, False
    # Skip a leftover that is only overlap from the previous chunk.
    if current and fresh:
        chunks.append("\n".join(current))
    return chunks


def load_chunks(docs_dir: Path = config.DOCS_DIR) -> list[Chunk]:
    paths = sorted(p for p in docs_dir.iterdir() if p.suffix in (".md", ".txt"))
    if not paths:
        raise FileNotFoundError(f"No .md or .txt files in {docs_dir}")
    chunks: list[Chunk] = []
    for path in paths:
        url, title, body = parse_doc(path)
        for n, text in enumerate(chunk_text(body)):
            chunks.append(Chunk(id=f"{path.stem}#{n}", doc=path.stem, title=title, url=url, text=text))
    return chunks
