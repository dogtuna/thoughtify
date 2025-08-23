import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import PropTypes from "prop-types";
import { db } from "../firebase";
import { doc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { generate } from "../ai";

const InquiryMapContext = createContext();

const defaultState = {
  hypotheses: [],
  businessGoal: "",
  recommendations: [],
};

const scoreFromImpact = (impact) => {
  switch (impact) {
    case "High":
      return 20;
    case "Medium":
      return 10;
    default:
      return 5;
  }
};

export const InquiryMapProvider = ({ children }) => {
  const [hypotheses, setHypotheses] = useState(defaultState.hypotheses);
  const [businessGoal, setBusinessGoal] = useState(defaultState.businessGoal);
  const [recommendations, setRecommendations] = useState(
    defaultState.recommendations,
  );
  const [activeTriages, setActiveTriages] = useState(0);
  const unsubscribeRef = useRef(null);

  const isAnalyzing = activeTriages > 0;

  const loadHypotheses = useCallback((uid, initiativeId) => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }
    const ref = doc(db, "users", uid, "initiatives", initiativeId);
    unsubscribeRef.current = onSnapshot(ref, (snap) => {
      const data = snap.data();
      setHypotheses(data?.inquiryMap?.hypotheses || []);
      setBusinessGoal(data?.businessGoal || "");
      setRecommendations(data?.inquiryMap?.recommendations || []);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const addQuestion = useCallback(
    async (uid, initiativeId, hypothesisId, question) => {
      const ref = doc(db, "users", uid, "initiatives", initiativeId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const current = data?.inquiryMap?.hypotheses || [];
      const updated = current.map((h) =>
        h.id === hypothesisId
          ? { ...h, questions: [...(h.questions || []), question] }
          : h
      );
      await updateDoc(ref, { "inquiryMap.hypotheses": updated });
    },
    []
  );

  const addEvidence = useCallback(
    async (uid, initiativeId, hypothesisId, evidence, supporting = true) => {
      const ref = doc(db, "users", uid, "initiatives", initiativeId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const current = data?.inquiryMap?.hypotheses || [];
      const key = supporting ? "supportingEvidence" : "refutingEvidence";
      const updated = current.map((h) =>
        h.id === hypothesisId
          ? { ...h, [key]: [...(h[key] || []), evidence] }
          : h
      );
      await updateDoc(ref, { "inquiryMap.hypotheses": updated });
    },
    []
  );

  const triageEvidence = useCallback(
    async (uid, initiativeId, evidenceText) => {
      setActiveTriages((c) => c + 1);
      try {
        const ref = doc(db, "users", uid, "initiatives", initiativeId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          return;
        }
        const data = snap.data();
        const current = data?.inquiryMap?.hypotheses || [];
        const hypothesesList = current
          .map(
            (h) => `${h.id}: ${h.statement || h.text || h.label || h.id}`,
          )
          .join("\n");

        const prompt = `Your role is an expert Performance Consultant and Strategic Analyst. A new piece of evidence has been added to the project. Your task is to analyze this evidence in the context of our current working hypotheses.

Assess Relevance: Determine which of the Existing Hypotheses this new Evidence most strongly supports or refutes.

Analyze Impact: Evaluate the strategic impact of this new evidence. Is it a minor detail or a game-changing insight that significantly alters our understanding of the project?

Recommend Actions: Based on your analysis, recommend the next logical step. Should we refine a hypothesis? Consider a new one? Or does this evidence confirm a hypothesis, allowing us to move on?

Respond ONLY in the following JSON format:

{
  "analysisSummary": "A brief, one-sentence summary of what this new evidence reveals.",
  "hypothesisLinks": [
    {
      "hypothesisId": "The ID of the most relevant hypothesis (e.g., 'A')",
      "relationship": "Supports" | "Refutes",
      "impact": "High" | "Medium" | "Low"
    }
  ],
  "strategicRecommendations": [
    "Actionable suggestions based on the analysis. For example: 'Suggest new hypothesis: ...', 'Refine Hypothesis A to focus on...', or 'Mark Hypothesis C as validated.'"
  ]
}

Project Data
New Evidence:
${evidenceText}

Existing Hypotheses:
${hypothesesList}
`;

        let analysis;
        try {
          const { text } = await generate(prompt);
          analysis = JSON.parse(text);
        } catch (err) {
          console.error("AI triage failed", err);
          return;
        }

        let updatedHypotheses = current;
        analysis.hypothesisLinks.forEach((link) => {
          const key =
            link.relationship === "Supports"
              ? "supportingEvidence"
              : "refutingEvidence";
          const delta =
            (link.relationship === "Supports" ? 1 : -1) *
            scoreFromImpact(link.impact);
          updatedHypotheses = updatedHypotheses.map((h) =>
            h.id === link.hypothesisId
              ? {
                  ...h,
                  [key]: [
                    ...(h[key] || []),
                    {
                      text: evidenceText,
                      analysisSummary: analysis.analysisSummary,
                      impact: link.impact,
                    },
                  ],
                  confidence: (h.confidence || 0) + delta,
                }
              : h,
          );
        });

        const updatedRecommendations = [
          ...(data?.inquiryMap?.recommendations || []),
          ...(analysis.strategicRecommendations || []),
        ];

        await updateDoc(ref, {
          "inquiryMap.hypotheses": updatedHypotheses,
          "inquiryMap.recommendations": updatedRecommendations,
        });
      } finally {
        setActiveTriages((c) => c - 1);
      }
    },
    [],
  );

  const refreshInquiryMap = useCallback(
    async (uid, initiativeId) => {
      const ref = doc(db, "users", uid, "initiatives", initiativeId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const current = data?.inquiryMap?.hypotheses || [];

      const existing = new Set();
      current.forEach((h) => {
        (h.supportingEvidence || []).forEach((e) => existing.add(e.text));
        (h.refutingEvidence || []).forEach((e) => existing.add(e.text));
      });

      const materials = data?.sourceMaterials || [];
      for (const docItem of materials) {
        const text = `Title: ${docItem.name}\n\n${docItem.content}`;
        if (!existing.has(text)) {
          await triageEvidence(uid, initiativeId, text);
          existing.add(text);
        }
      }

      const questions = data?.clarifyingQuestions || [];
      const answers = data?.clarifyingAnswers || [];
      for (let i = 0; i < questions.length; i += 1) {
        const q = questions[i]?.question;
        const ansObj = answers[i] || {};
        for (const ans of Object.values(ansObj)) {
          const ansText = ans?.text;
          if (q && ansText && ansText.trim()) {
            const combined = `Question: ${q}\nAnswer: ${ansText}`;
            if (!existing.has(combined)) {
              await triageEvidence(uid, initiativeId, combined);
              existing.add(combined);
            }
          }
        }
      }
    },
    [triageEvidence],
  );

  const updateConfidence = useCallback(
    async (uid, initiativeId, hypothesisId, confidence) => {
      const ref = doc(db, "users", uid, "initiatives", initiativeId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const current = data?.inquiryMap?.hypotheses || [];
      const updated = current.map((h) =>
        h.id === hypothesisId ? { ...h, confidence } : h
      );
      await updateDoc(ref, { "inquiryMap.hypotheses": updated });
    },
    []
  );

  const value = {
    hypotheses,
    businessGoal,
    recommendations,
    loadHypotheses,
    addQuestion,
    addEvidence,
    triageEvidence,
    refreshInquiryMap,
    updateConfidence,
    isAnalyzing,
  };

  return (
    <InquiryMapContext.Provider value={value}>{children}</InquiryMapContext.Provider>
  );
};

InquiryMapProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useInquiryMap = () => useContext(InquiryMapContext);

