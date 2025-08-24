import { logisticConfidence } from "./confidence";

// --- Constants for Weighting ---
// These are now more aggressive to prioritize objective proof.
const AUTHORITY_WEIGHT = { High: 2.0, Medium: 1.0, Low: 0.5 };
const EVIDENCE_TYPE_WEIGHT = { Quantitative: 1.5, Qualitative: 0.8 };
const DIRECTNESS_WEIGHT = { Direct: 1.5, Indirect: 0.7 };
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
 */
export const generateTriagePrompt = (evidenceText, hypotheses, contacts) => {
  const hypothesesList = hypotheses
    .map((h) => `${h.id}: ${h.statement || h.text || h.label || h.id}`)
    .join("\n");
  
  const contactsList = (contacts || [])
    .map((c) => `${c.name} (${c.role || "Unknown Role"})`)
    .join(", ");

  // This revised prompt is more direct in asking the AI to check for refutations.
    return `Your role is an expert Performance Consultant. Analyze the New Evidence in the context of the Existing Hypotheses.

1.  **Analyze the Relationship:** For each hypothesis, determine if the new evidence directly **Supports**, directly **Refutes**, or is **Unrelated** to it. Be extremely critical. If a stakeholder says "the training was fine, but the tool is the problem," that *refutes* a hypothesis about training and *supports* a hypothesis about the tool. Do not just match keywords.
2.  **Determine the Impact:** Classify the evidence's strategic impact (High, Medium, Low).
3.  **Classify the Source:** Identify the source and classify its authority, type, and directness.

Respond ONLY in the following JSON format:
{
  "analysisSummary": "A brief summary of the evidence's strategic meaning.",
  "hypothesisLinks": [
    {
      "hypothesisId": "A",
      "relationship": "Refutes",
      "impact": "High",
      "source": "Chloe Zhao",
      "sourceAuthority": "Medium",
      "evidenceType": "Qualitative",
      "directness": "Direct"
    }
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
 */
export const calculateNewConfidence = (hypothesis, link, evidenceText, analysisSummary) => {
  const baseScore = hypothesis.confidenceScore ?? 0;
  const evidenceCount = (hypothesis.supportingEvidence?.length || 0) + (hypothesis.refutingEvidence?.length || 0);
  const diminishingFactor = 1 / Math.max(1, evidenceCount * 0.5);

  const authorityWeight = AUTHORITY_WEIGHT[link.sourceAuthority] || 1;
  const typeWeight = EVIDENCE_TYPE_WEIGHT[link.evidenceType] || 1;
  const directWeight = DIRECTNESS_WEIGHT[link.directness] || 1;

  const weightedImpact = scoreFromImpact(link.impact) * authorityWeight * typeWeight * directWeight;
  
  // A more aggressive penalty for refuting evidence.
  const multiplier = link.relationship === "Refutes" ? -1.5 : 1;
  const delta = weightedImpact * diminishingFactor * multiplier;

  const newEvidenceEntry = {
    text: evidenceText,
    analysisSummary,
    impact: link.impact,
    delta,
    source: link.source,
    sourceAuthority: link.sourceAuthority,
    evidenceType: link.evidenceType,
    directness: link.directness,
    relationship: link.relationship,
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

  return { updatedHypothesis, extraRecommendations: [] };
};