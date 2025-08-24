import { logisticConfidence } from "./confidence";

// --- Constants for Weighting ---
const AUTHORITY_WEIGHT = { High: 1.5, Medium: 1.0, Low: 0.5 };
const EVIDENCE_TYPE_WEIGHT = { Quantitative: 1.2, Qualitative: 0.8 };
const DIRECTNESS_WEIGHT = { Direct: 1.3, Indirect: 0.7 };
const CORROBORATION_MULTIPLIER = 2.0;

const scoreFromImpact = (impact) => {
  switch (impact) {
    case "High": return 0.2;
    case "Medium": return 0.1;
    default: return 0.05;
  }
};

/**
 * Generates the AI prompt for triaging a new piece of evidence.
 * @param {string} evidenceText - The new evidence to analyze.
 * @param {Array} hypotheses - The current list of project hypotheses.
 * @param {Array} contacts - The list of known project stakeholders.
 * @returns {string} The complete prompt for the AI.
 */
export const generateTriagePrompt = (evidenceText, hypotheses, contacts) => {
  const hypothesesList = hypotheses
    .map((h) => `${h.id}: ${h.statement || h.text || h.label || h.id}`)
    .join("\n");
  
  const contactsList = (contacts || [])
    .map((c) => `${c.name} (${c.role || "Unknown Role"})`)
    .join(", ");

  return `Your role is an expert Performance Consultant and Strategic Analyst. A new piece of evidence has been added to the project. Your task is to analyze this evidence in the context of our current working hypotheses.

Assess Relevance: Determine which of the Existing Hypotheses this new Evidence most strongly supports or refutes.

Analyze Impact: Evaluate the strategic impact of this new evidence. Is it a minor detail or a game-changing insight?

Classify the Evidence: For each relevant hypothesis, classify the evidence along three axes:
- Source Authority (High | Medium | Low)
- Evidence Type (Quantitative | Qualitative)
- Directness (Direct | Indirect)
Identify the specific source (stakeholder name or document).

Recommend Actions: Based on your analysis, recommend the next logical step.

Respond ONLY in the following JSON format:

{
  "analysisSummary": "A brief, one-sentence summary of what this new evidence reveals.",
  "hypothesisLinks": [
    {
      "hypothesisId": "The ID of the most relevant hypothesis (e.g., 'A')",
      "relationship": "Supports" | "Refutes",
      "impact": "High" | "Medium" | "Low",
      "source": "Name or description of the source",
      "sourceAuthority": "High" | "Medium" | "Low",
      "evidenceType": "Quantitative" | "Qualitative",
      "directness": "Direct" | "Indirect"
    }
  ],
  "strategicRecommendations": [
    "Actionable suggestions..."
  ]
}

---
### Project Data

**New Evidence:**
${evidenceText}

**Existing Hypotheses:**
${hypothesesList}

**Known Project Stakeholders:**
${contactsList}
`;
};

/**
 * Calculates the new confidence score for a hypothesis based on new evidence.
 * @param {object} hypothesis - The current hypothesis object.
 * @param {object} link - The hypothesisLink object from the AI's response.
 * @param {string} evidenceText - The text of the new evidence.
 * @param {string} analysisSummary - The AI's summary of the evidence.
 * @returns {object} An object containing the updated hypothesis and any new recommendations.
 */
export const calculateNewConfidence = (hypothesis, link, evidenceText, analysisSummary) => {
  const baseScore = hypothesis.confidenceScore ?? 0;
  const evidenceCount = (hypothesis.supportingEvidence?.length || 0) + (hypothesis.refutingEvidence?.length || 0);
  const diminishingFactor = 1 / Math.max(1, evidenceCount * 0.5);

  const authorityWeight = AUTHORITY_WEIGHT[link.sourceAuthority] || 1;
  const typeWeight = EVIDENCE_TYPE_WEIGHT[link.evidenceType] || 1;
  const directWeight = DIRECTNESS_WEIGHT[link.directness] || 1;

  const weightedImpact = scoreFromImpact(link.impact) * authorityWeight * typeWeight * directWeight;
  const delta = (link.relationship === "Supports" ? 1 : -1) * weightedImpact * diminishingFactor;

  const newEvidenceEntry = {
    text: evidenceText,
    analysisSummary,
    impact: link.impact,
    delta,
    source: link.source,
    sourceAuthority: link.sourceAuthority,
    evidenceType: link.evidenceType,
    directness: link.directness,
  };

  const key = link.relationship === "Supports" ? "supportingEvidence" : "refutingEvidence";
  const updatedEvidence = [...(hypothesis[key] || []), newEvidenceEntry];

  // --- Corroboration Check ---
  const existingSup = hypothesis.supportingEvidence || [];
  const beforeHasQuant = existingSup.some(e => e.evidenceType === "Quantitative");
  const beforeHasQual = existingSup.some(e => e.evidenceType === "Qualitative");
  const beforeSources = new Set(existingSup.map(e => e.source));
  const beforeCorroboration = beforeHasQuant && beforeHasQual && beforeSources.size > 1;

  const afterSup = link.relationship === "Supports" ? updatedEvidence : existingSup;
  const afterHasQuant = afterSup.some(e => e.evidenceType === "Quantitative");
  const afterHasQual = afterSup.some(e => e.evidenceType === "Qualitative");
  const afterSources = new Set(afterSup.map(e => e.source));
  const afterCorroboration = afterHasQuant && afterHasQual && afterSources.size > 1;

  let newScore = baseScore + delta;
  if (link.relationship === "Supports" && afterCorroboration && !beforeCorroboration) {
    newScore *= CORROBORATION_MULTIPLIER;
  }

  // --- Conflict Flag ---
  let contested = hypothesis.contested || false;
  const extraRecommendations = [];
  if (link.sourceAuthority === "High") {
    const oppositeKey = link.relationship === "Supports" ? "refutingEvidence" : "supportingEvidence";
    const oppositeEvidence = hypothesis[oppositeKey] || [];
    const highAuthorityConflict = oppositeEvidence.find(e => e.sourceAuthority === "High");
    if (highAuthorityConflict) {
      contested = true;
      extraRecommendations.push(
        `CRITICAL: Schedule a root cause alignment meeting with ${highAuthorityConflict.source} and ${link.source} to resolve the conflicting perspectives on hypothesis ${hypothesis.id}.`
      );
    }
  }
  
  const updatedHypothesis = {
    ...hypothesis,
    [key]: updatedEvidence,
    confidenceScore: newScore,
    confidence: logisticConfidence(newScore),
    contested,
  };

  return { updatedHypothesis, extraRecommendations };
};