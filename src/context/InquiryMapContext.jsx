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
import { logisticConfidence } from "../utils/confidence";
import { generateTriagePrompt, calculateNewConfidence } from "../utils/inquiryLogic"; // We will create this file next

const InquiryMapContext = createContext();

const defaultState = {
  hypotheses: [],
  businessGoal: "",
  recommendations: [],
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

  const triageEvidence = useCallback(
    async (uid, initiativeId, evidenceText) => {
      setActiveTriages((c) => c + 1);
      try {
        const ref = doc(db, "users", uid, "initiatives", initiativeId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;

        const data = snap.data();
        const currentHypotheses = data?.inquiryMap?.hypotheses || [];
        const contacts = data?.contacts || [];
        const currentRecommendations = data?.inquiryMap?.recommendations || [];

        const prompt = generateTriagePrompt(evidenceText, currentHypotheses, contacts);
        const { text } = await generate(prompt);
        const analysis = parseJsonFromText(text);

        if (!analysis?.hypothesisLinks?.length) {
          console.error("AI triage returned invalid format");
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
    []
  );

  const value = {
    hypotheses,
    businessGoal,
    recommendations,
    loadHypotheses,
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