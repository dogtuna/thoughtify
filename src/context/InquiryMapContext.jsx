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
import { parseJsonFromText } from "../utils/json";
import { generateTriagePrompt, calculateNewConfidence } from "../utils/inquiryLogic";

const InquiryMapContext = createContext();

const defaultState = {
  hypotheses: [],
  businessGoal: "",
  recommendations: [],
};

export const InquiryMapProvider = ({ children }) => {
  const [hypotheses, setHypotheses] = useState(defaultState.hypotheses);
  const [businessGoal, setBusinessGoal] = useState(defaultState.businessGoal);
  const [recommendations, setRecommendations] = useState(defaultState.recommendations);
  const [activeTriages, setActiveTriages] = useState(0);
  const unsubscribeRef = useRef(null);
  const [currentUser, setCurrentUser] = useState(null); // Assuming you have a way to set the current user
  const [currentInitiative, setCurrentInitiative] = useState(null); // And the current initiative

  const isAnalyzing = activeTriages > 0;

  const loadHypotheses = useCallback((uid, initiativeId) => {
    setCurrentUser(uid);
    setCurrentInitiative(initiativeId);
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

  const triageEvidence = useCallback(
    async (evidenceText) => {
      if (!currentUser || !currentInitiative) return;
      setActiveTriages((c) => c + 1);
      try {
        const ref = doc(db, "users", currentUser, "initiatives", currentInitiative);
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error("Initiative not found");

        const data = snap.data();
        const currentHypotheses = data?.inquiryMap?.hypotheses || [];
        const contacts = data?.contacts || [];
        const currentRecommendations = data?.inquiryMap?.recommendations || [];

        const prompt = generateTriagePrompt(evidenceText, currentHypotheses, contacts);
        const { text } = await generate(prompt);
        const analysis = parseJsonFromText(text);

        if (!analysis?.hypothesisLinks?.length) {
          console.error("AI triage returned invalid or empty format", analysis);
          return;
        }

        let updatedHypotheses = [...currentHypotheses];
        let allNewRecommendations = [...(analysis.strategicRecommendations || [])];

        analysis.hypothesisLinks.forEach((link) => {
          const targetIndex = updatedHypotheses.findIndex(h => h.id === link.hypothesisId);
          if (targetIndex === -1) return;

          const { updatedHypothesis, extraRecommendations } = calculateNewConfidence(
            updatedHypotheses[targetIndex],
            link,
            evidenceText,
            analysis.analysisSummary
          );
          
          updatedHypotheses[targetIndex] = updatedHypothesis;
          allNewRecommendations.push(...extraRecommendations);
        });

        const finalRecommendations = [...currentRecommendations, ...allNewRecommendations];

        await updateDoc(ref, {
          "inquiryMap.hypotheses": updatedHypotheses,
          "inquiryMap.recommendations": finalRecommendations,
        });

      } catch (err) {
        console.error("Triage evidence process failed:", err);
      } finally {
        setActiveTriages((c) => c - 1);
      }
    },
    [currentUser, currentInitiative]
  );

  const refreshInquiryMap = useCallback(
    async () => {
      if (!currentUser || !currentInitiative) return;
      const ref = doc(db, "users", currentUser, "initiatives", currentInitiative);
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error("Initiative not found");

        const data = snap.data();
        const currentHypotheses = data?.inquiryMap?.hypotheses || [];
        
        const existingEvidence = new Set();
        currentHypotheses.forEach((h) => {
          (h.supportingEvidence || []).forEach((e) => existingEvidence.add(e.text));
          (h.refutingEvidence || []).forEach((e) => existingEvidence.add(e.text));
        });

        for (const docItem of (data?.sourceMaterials || [])) {
          const text = `Document: ${docItem.name}\n\n${docItem.summary || docItem.content}`;
          if (!existingEvidence.has(text)) {
            await triageEvidence(text);
          }
        }

        for (const q of (data?.questions || [])) {
          for (const ans of Object.values(q.answers || {})) {
            if (ans?.text && ans.text.trim()) {
              const combined = `Question: ${q.question}\nAnswer: ${ans.text}`;
              if (!existingEvidence.has(combined)) {
                await triageEvidence(combined);
              }
            }
          }
        }
      } catch (err) {
        console.error("Error refreshing inquiry map:", err);
      }
    },
    [currentUser, currentInitiative, triageEvidence]
  );
  
  const addQuestion = useCallback(
    async (hypothesisId, question) => {
      if (!currentUser || !currentInitiative) return;
      const ref = doc(db, "users", currentUser, "initiatives", currentInitiative);
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error("Initiative not found");
        const currentHypotheses = snap.data()?.inquiryMap?.hypotheses || [];
        const updatedHypotheses = currentHypotheses.map((h) =>
          h.id === hypothesisId
            ? { ...h, questions: [...(h.questions || []), question] }
            : h
        );
        await updateDoc(ref, { "inquiryMap.hypotheses": updatedHypotheses });
      } catch (err) {
        console.error("Error adding question:", err);
      }
    },
    [currentUser, currentInitiative]
  );

  const addEvidence = useCallback(
    async (hypothesisId, evidence, supporting = true) => {
      if (!currentUser || !currentInitiative) return;
      const ref = doc(db, "users", currentUser, "initiatives", currentInitiative);
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error("Initiative not found");
        const currentHypotheses = snap.data()?.inquiryMap?.hypotheses || [];
        const key = supporting ? "supportingEvidence" : "refutingEvidence";
        const updatedHypotheses = currentHypotheses.map((h) =>
          h.id === hypothesisId
            ? { ...h, [key]: [...(h[key] || []), { text: evidence }] } 
            : h
        );
        await updateDoc(ref, { "inquiryMap.hypotheses": updatedHypotheses });
      } catch (err) {
        console.error("Error adding evidence:", err);
      }
    },
    [currentUser, currentInitiative]
  );

  const updateConfidence = useCallback(
    async (hypothesisId, confidence) => {
      if (!currentUser || !currentInitiative) return;
      const ref = doc(db, "users", currentUser, "initiatives", currentInitiative);
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error("Initiative not found");

        const currentHypotheses = snap.data()?.inquiryMap?.hypotheses || [];
        const updatedHypotheses = currentHypotheses.map((h) =>
          h.id === hypothesisId ? { ...h, confidence: Math.min(1, Math.max(0, confidence)) } : h
        );
        await updateDoc(ref, { "inquiryMap.hypotheses": updatedHypotheses });
      } catch (err) {
        console.error("Error updating confidence:", err);
      }
    },
    [currentUser, currentInitiative]
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