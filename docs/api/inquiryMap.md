# Inquiry Map API

This document describes the structure of the inquiry map data used throughout the application.

## Hypothesis

Each hypothesis in the inquiry map is represented with the following properties:

- `id` (string): Identifier for the hypothesis.
- `statement` or `label` (string): Text description of the hypothesis.
- `confidence` (number): Overall confidence value between 0 and 1.
- `confidenceScore` (number, optional): Internal raw score used to compute `confidence` via a logistic transform.
- `supportingEvidence` (array): Evidence items that support the hypothesis. Each item has:
  - `text` (string): Source text.
  - `analysisSummary` (string): Summary from the triage analysis.
  - `impact` ("High" | "Medium" | "Low"): Impact assessment.
  - `delta` (number): Contribution of the evidence toward confidence.
  - `source` (string): Name or description of the source.
  - `sourceAuthority` ("High" | "Medium" | "Low"): Authority level of the source.
  - `evidenceType` ("Quantitative" | "Qualitative"): Nature of the evidence.
  - `directness` ("Direct" | "Indirect"): How directly the evidence relates to the hypothesis.
- `refutingEvidence` (array): Evidence items that refute the hypothesis with the same shape as `supportingEvidence`.
- `sourceContributions` (array): Breakdown of confidence contributions per evidence source. Each entry contains:
  - `source` (string): Text of the evidence source.
  - `percent` (number): Signed fractional contribution of that source to the overall confidence. Positive values indicate supporting evidence while negative values indicate refuting evidence.
- `contested` (boolean, optional): Indicates whether high-authority sources provide conflicting views on the hypothesis.

`percent` values sum to 1 when considering absolute values. They are intended for display purposes to show how much each piece of evidence contributes to the hypothesis confidence.

## Recommendations

The inquiry map may also include `recommendations`, a list of strategic suggestions generated during evidence triage.
