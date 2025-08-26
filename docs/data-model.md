# Data Model

The application models project knowledge as an evidence graph. Core nodes include:

- **Hypothesis** – a proposed explanation with `confidence`, `supportingEvidence`, `refutingEvidence`, and an append-only `auditLog` that records every change in confidence.
- **Answer** – a stakeholder response to a question. Answers can contribute evidence toward hypotheses.
- **Document** – source material such as briefs or transcripts that may yield evidence.
- **MetricSnapshot** – quantitative observations captured at a point in time.
- **Task** – actions generated from inquiry or analysis.
- **Contact** – people involved in the project.
- **Source** – attribution for a piece of evidence (person, document, or metric).

Every confidence update stores a "why" record in the hypothesis `auditLog` detailing:

- the evidence and its weight (`delta`),
- when it was recorded (`timestamp`), and
- who entered it (`user`).

This audit trail enables a human‑readable diff such as `+12% from Priya’s doc` and ensures decisions remain transparent and traceable.
