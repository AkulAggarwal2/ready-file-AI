from pathlib import Path

import pytest

from po_assistant.docs_loader import chunk_text, load_chunks, parse_doc
from po_assistant.retrieval import Index, tokenize


def write(tmp_path: Path, name: str, text: str) -> Path:
    path = tmp_path / name
    path.write_text(text, encoding="utf-8")
    return path


def test_parse_doc_reads_source_title_and_body(tmp_path):
    path = write(tmp_path, "a.md", "Source: https://example.gov/a\nTitle: Page A\nRetrieved: today\n\nBody text.")
    assert parse_doc(path) == ("https://example.gov/a", "Page A", "Body text.")


def test_parse_doc_rejects_missing_source(tmp_path):
    path = write(tmp_path, "a.md", "No source line here")
    with pytest.raises(ValueError):
        parse_doc(path)


def test_chunk_text_overlaps_and_covers_all_lines():
    lines = [f"line{i} " + "word " * 19 for i in range(30)]  # 20 words per line
    chunks = chunk_text("\n".join(lines), size=100, overlap=40)
    assert len(chunks) > 1
    assert all(f"line{i} " in "\n".join(chunks) for i in range(30))
    # the last two lines of chunk 0 open chunk 1
    assert chunks[1].startswith(chunks[0].splitlines()[-2])


@pytest.mark.parametrize("last_line", ["Call the clerk at 260-449-3444.", "short " * 30])
def test_chunk_text_keeps_short_trailing_text(last_line):
    # The first chunk ends on a 60-word line, so its overlap tail is empty (or short).
    lines = ["intro " * 50, "long " * 60, last_line]
    chunks = chunk_text("\n".join(lines), size=100, overlap=40)
    assert last_line.strip() in chunks[-1]


def test_tokenize_drops_stopwords_and_folds_plurals():
    assert tokenize("What are the fees for copies?") == ["fee", "copy"]


def test_search_ranks_matching_doc_first(tmp_path):
    write(tmp_path, "fees.md", "Source: https://example.gov/fees\n\nThere is no filing fee for a protection order.")
    write(tmp_path, "pets.md", "Source: https://example.gov/pets\n\nThe judge may award possession of an animal.")
    write(tmp_path, "misc.md", "Source: https://example.gov/misc\n\nCourt hours are posted at the clerk office.")
    index = Index(load_chunks(tmp_path))
    hits = index.search("Is there a filing fee?")
    assert hits[0].chunk.url == "https://example.gov/fees"
    assert index.search("the and of") == []  # stopwords only


def test_real_docs_all_have_urls():
    chunks = load_chunks()
    assert chunks
    assert all(c.url.startswith("https://") for c in chunks)
