import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import { db } from "../firebase";
import { doc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";

const InquiryMapContext = createContext();

const defaultState = {
  hypotheses: [],
};

export const InquiryMapProvider = ({ children }) => {
  const [hypotheses, setHypotheses] = useState(defaultState.hypotheses);
  const unsubscribeRef = useRef(null);

  const loadHypotheses = useCallback((uid, initiativeId) => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }
    const ref = doc(db, "users", uid, "initiatives", initiativeId);
    unsubscribeRef.current = onSnapshot(ref, (snap) => {
      const data = snap.data();
      setHypotheses(data?.inquiryMap?.hypotheses || []);
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
    loadHypotheses,
    addQuestion,
    addEvidence,
    updateConfidence,
  };

  return (
    <InquiryMapContext.Provider value={value}>{children}</InquiryMapContext.Provider>
  );
};

InquiryMapProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useInquiryMap = () => useContext(InquiryMapContext);

