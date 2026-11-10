"""Minimal Gradio web UI.  Run:  python app.py   then open http://127.0.0.1:7860"""

import os
import re

os.environ.setdefault("GRADIO_ANALYTICS_ENABLED", "False")  # don't send usage pings

import gradio as gr

from po_assistant import config
from po_assistant.assistant import Assistant

assistant = Assistant()

EXAMPLES = [
    "Is there a filing fee for a protection order?",
    "How many copies of the petition do I need?",
    "What does ex parte mean?",
    "Should I file for stalking or harassment?",
]


def md_escape(text: str) -> str:
    """Show text literally in Markdown: no links, emphasis, or HTML from doc titles."""
    return re.sub(r"([\\`*_{}\[\]()<>#+!|~-])", r"\\\1", text)


def ask(question: str):
    if not question.strip():
        return "Please type a question.", "", "", {}
    response = assistant.answer(question)
    # Source URLs come from line 1 of our own docs/ files; titles are escaped in case they hold Markdown.
    sources = (
        "\n".join(f"- [{md_escape(s.title)}](<{s.url}>)" for s in response.sources)
        or "_No sources: the documents don't cover this._"
    )
    status = f"**Confidence:** {response.confidence} &nbsp;·&nbsp; **Needs a person to follow up:** {'yes' if response.needs_human else 'no'}"
    return response.answer, f"**Sources**\n\n{sources}", status, response.model_dump()


with gr.Blocks(title="Protection Order Filing Info") as demo:
    gr.Markdown(
        "# Protection Order Filing Info (Indiana)\n"
        "Answers come only from saved court and legal-help pages. "
        "**This is legal information, not legal advice.**"
    )
    if not config.SAFETY_VERIFIED:
        gr.Markdown("> ⚠️ Prototype: the domestic violence hotline number has not been verified yet, so answers list only 911.")
    question = gr.Textbox(label="Your question", placeholder="e.g. Is there a filing fee?", lines=2)
    submit = gr.Button("Ask", variant="primary")
    gr.Examples(EXAMPLES, inputs=question)
    # Plain text, not Markdown: model output (which may echo document text) must not render as links or HTML.
    answer = gr.Textbox(label="Answer", interactive=False, lines=8)
    sources = gr.Markdown()
    status = gr.Markdown()
    with gr.Accordion("Raw JSON", open=False):
        raw = gr.JSON()

    outputs = [answer, sources, status, raw]
    submit.click(ask, inputs=question, outputs=outputs)
    question.submit(ask, inputs=question, outputs=outputs)


if __name__ == "__main__":
    demo.launch()  # local only; no public share link
