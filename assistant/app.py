"""Minimal Gradio web UI.  Run:  python app.py   then open http://127.0.0.1:7860"""

import os

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


def ask(question: str):
    if not question.strip():
        return "Please type a question.", "", "", {}
    response = assistant.answer(question)
    sources = "\n".join(f"- [{s.title}]({s.url})" for s in response.sources) or "_No sources: the documents don't cover this._"
    status = f"**Confidence:** {response.confidence} &nbsp;·&nbsp; **Needs a person to follow up:** {'yes' if response.needs_human else 'no'}"
    return response.answer, f"**Sources**\n\n{sources}", status, response.model_dump()


with gr.Blocks(title="Protection Order Filing Info") as demo:
    gr.Markdown(
        "# Protection Order Filing Info (Indiana)\n"
        "Answers come only from saved court and legal-help pages. "
        "**This is legal information, not legal advice.**"
    )
    if not config.SAFETY_VERIFIED:
        gr.Markdown("> ⚠️ Prototype: hotline numbers in answers are placeholders and have not been verified.")
    question = gr.Textbox(label="Your question", placeholder="e.g. Is there a filing fee?", lines=2)
    submit = gr.Button("Ask", variant="primary")
    gr.Examples(EXAMPLES, inputs=question)
    answer = gr.Markdown(label="Answer")
    sources = gr.Markdown()
    status = gr.Markdown()
    with gr.Accordion("Raw JSON", open=False):
        raw = gr.JSON()

    outputs = [answer, sources, status, raw]
    submit.click(ask, inputs=question, outputs=outputs)
    question.submit(ask, inputs=question, outputs=outputs)


if __name__ == "__main__":
    demo.launch()  # local only; no public share link
