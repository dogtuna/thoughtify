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
import { doc, getDoc, updateDoc, onSnapshot, collection, getDocs } from "firebase/firestore";
import { generate } from "../ai";
import { parseJsonFromText } from "../utils/json";
import { generateTriagePrompt, calculateNewConfidence } from "../utils/inquiryLogic";

const InquiryMapContext = createContext();

// Normalize potential object maps from Firestore into arrays to avoid runtime errors
const toArray = (val) =>
  Array.isArray(val) ? val : val && typeof val === "object" ? Object.values(val) : [];

const pickBetterHypotheses = (a1, a2) => {
  const arr1 = toArray(a1);
  const arr2 = toArray(a2);
  if (arr1.length && arr2.length) {
    const score = (arr) => {
      let c = 0;
      for (const h of arr) {
        if (typeof h?.confidence === "number") { c += 2; }
        const sup = h?.evidence?.supporting || h?.supportingEvidence || [];
        const ref = h?.evidence?.refuting || h?.refutingEvidence || [];
        if ((sup && sup.length) || (ref && ref.length)) { c += 1; }
      }
      return c;
    };
    return score(arr2) > score(arr1) ? arr2 : arr1;
  }
  return arr1.length ? arr1 : arr2;
};

const getInquiryData = (data) => ({
  hypotheses: pickBetterHypotheses(
    data?.inquiryMap?.hypotheses,
    data?.hypotheses
  ),
  recommendations: toArray(
    data?.inquiryMap?.recommendations ?? data?.recommendations
  ),
  suggestedHypotheses: toArray(data?.suggestedHypotheses),
});

const defaultState = {
  hypotheses: [],
  businessGoal: "",
  recommendations: [],
};

export const InquiryMapProvider = ({ children }) => {
  const [hypotheses, setHypotheses] = useState(defaultState.hypotheses);
  const [businessGoal, setBusinessGoal] = useState(defaultState.businessGoal);
  const [recommendations, setRecommendations] = useState(defaultState.recommendations);
  const [suggestedHypotheses, setSuggestedHypotheses] = useState([]);
  const [activeTriages, setActiveTriages] = useState(0);
  const unsubscribeRef = useRef(null);

  const [currentUser, setCurrentUser] = useState(null);
  const [currentInitiative, setCurrentInitiative] = useState(null);

  const isAnalyzing = activeTriages > 0;

  const loadHypotheses = useCallback((uid, initiativeId) => {
    console.log("loadHypotheses called", uid, initiativeId);
    setCurrentUser(uid);
    setCurrentInitiative(initiativeId);

    if (unsubscribeRef.current) {
      console.log("Unsubscribing previous listener");
      unsubscribeRef.current();
    }
    const ref = doc(db, "users", uid, "initiatives", initiativeId);
    unsubscribeRef.current = onSnapshot(
      ref,
      (snap) => {
        console.log("onSnapshot triggered", snap.exists());
        if (!snap.exists()) {
          console.warn("Initiative document missing");
          return;
        }
        const data = snap.data();
        const { hypotheses: hyps, recommendations: recs, suggestedHypotheses: sh } = getInquiryData(data);
        console.log("Snapshot data", { hyps, recs, businessGoal: data?.businessGoal });
        setHypotheses(hyps);
        setBusinessGoal(data?.businessGoal || "");
        setRecommendations(recs);
        setSuggestedHypotheses(sh || []);
      },
      (error) => {
        console.error("onSnapshot error", error);
      }
    );
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
        const { hypotheses: currentHypotheses, recommendations: currentRecommendations } =
          getInquiryData(data);
        const contacts = data?.contacts || [];

        const prompt = generateTriagePrompt(evidenceText, currentHypotheses, contacts);
        const { text } = await generate(prompt);
        const analysis = parseJsonFromText(text);

        if (!analysis?.hypothesisLinks?.length) {
          console.error("AI triage returned invalid or empty format", analysis);
          return null;
        }

        let updatedHypotheses = [...currentHypotheses];
        let allNewRecommendations = [...(analysis.strategicRecommendations || [])];
        let newProjectQuestions = [...(analysis.projectQuestions || [])];

        analysis.hypothesisLinks.forEach((link) => {
          const targetIndex = updatedHypotheses.findIndex(h => h.id === link.hypothesisId);
          if (targetIndex === -1) return;

          const { updatedHypothesis, extraRecommendations } = calculateNewConfidence(
            updatedHypotheses[targetIndex],
            link,
            evidenceText,
            analysis.analysisSummary,
            currentUser
          );

          updatedHypotheses[targetIndex] = updatedHypothesis;
          allNewRecommendations.push(...extraRecommendations);
        });

        if (analysis.newHypothesis?.statement) {
          const newConf = Math.min(1, Math.max(0, analysis.newHypothesis.confidence || 0));
          const lowest = updatedHypotheses.reduce(
            (min, h) => Math.min(min, h.confidence || 0),
            1,
          );
          if (newConf > lowest) {
            const add = window.confirm(
              `AI suggests a new hypothesis with ${(newConf * 100).toFixed(0)}% confidence:\n"${analysis.newHypothesis.statement}"\nAdd this hypothesis?`
            );
            if (add) {
              updatedHypotheses.push({
                id: `hyp-${Date.now()}`,
                statement: analysis.newHypothesis.statement,
                hypothesis: analysis.newHypothesis.statement,
                confidence: newConf,
                evidence: { supporting: [], refuting: [] },
                sourceContributions: [],
              });
            }
          }
        }

        const finalRecommendations = [...currentRecommendations, ...allNewRecommendations];
        const finalQuestions = [...(data.projectQuestions || []), ...newProjectQuestions];

        await updateDoc(ref, {
          "inquiryMap.hypotheses": updatedHypotheses,
          hypotheses: updatedHypotheses,
          "inquiryMap.recommendations": finalRecommendations,
          recommendations: finalRecommendations,
          projectQuestions: finalQuestions,
        });

        return analysis;
      } catch (err) {
        console.error("Triage evidence process failed:", err);
        return null;
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
        const { hypotheses: currentHypotheses } = getInquiryData(data);

        const existingEvidence = new Set();
        currentHypotheses.forEach((h) => {
          (h.evidence?.supporting || h.supportingEvidence || []).forEach((e) => existingEvidence.add(e.text));
          (h.evidence?.refuting || h.refutingEvidence || []).forEach((e) => existingEvidence.add(e.text));
        });

        for (const docItem of (data?.sourceMaterials || [])) {
          const text = `Document: ${docItem.name}\n\n${docItem.summary || docItem.content}`;
          if (!existingEvidence.has(text)) {
            await triageEvidence(text);
          }
        }

        const qList = data?.projectQuestions || [];
        for (const qItem of qList) {
          const questionText =
            typeof qItem === "string" ? qItem : qItem.question || "";
          const answersArray = Array.isArray(qItem?.answers)
            ? qItem.answers
            : Object.values(qItem?.answers || {});
          for (const ans of answersArray) {
            const ansText =
              typeof ans === "string" ? ans : ans?.text || "";
            if (
              ansText &&
              ansText.trim() &&
              !/^[A-Za-z0-9]{20,}$/.test(ansText.trim())
            ) {
              const combined = `Question: ${questionText}\nAnswer: ${ansText}`;
              if (!existingEvidence.has(combined)) {
                await triageEvidence(combined);
              }
            }
          }
        }

        // Also scan existing tasks as potential evidence
        try {
          const tasksRef = collection(db, "users", currentUser, "initiatives", currentInitiative, "tasks");
          const tSnap = await getDocs(tasksRef);
          for (const d of tSnap.docs) {
            const t = d.data();
            const msg = t?.message || t?.text || "";
            if (!msg || !msg.trim()) continue;
            const text = `Task: ${msg}`;
            let analysis = null;
            if (!existingEvidence.has(text)) {
              analysis = await triageEvidence(text);
            }
            try {
              // If AI linked this task to hypotheses, persist the linkage on the task
              const links = analysis?.hypothesisLinks || [];
              const ids = [...new Set(links.map((l) => l.hypothesisId).filter(Boolean))];
              if (ids.length) {
                const currentIds = Array.isArray(t.hypothesisIds) ? t.hypothesisIds : (t.hypothesisId ? [t.hypothesisId] : []);
                const merged = [...new Set([...currentIds, ...ids])];
                await updateDoc(d.ref, {
                  hypothesisIds: merged,
                  hypothesisId: t.hypothesisId || merged[0] || null,
                });
              }
            } catch (linkErr) {
              console.warn("Failed to link task to hypotheses", linkErr);
            }
          }
        } catch (e) {
          console.warn("Unable to scan tasks for evidence", e);
        }
      } catch (err) {
        console.error("Error refreshing inquiry map:", err);
      }
    },
    [currentUser, currentInitiative, triageEvidence]
  );

  const addHypothesis = useCallback(
    async (statement) => {
      if (!currentUser || !currentInitiative) return;
      const ref = doc(db, "users", currentUser, "initiatives", currentInitiative);
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error("Initiative not found");
        const currentHypotheses = getInquiryData(snap.data()).hypotheses;
        const newHypothesis = {
          id: `hyp-${Date.now()}`,
          statement,
          hypothesis: statement,
          confidence: 0,
          evidence: { supporting: [], refuting: [] },
          sourceContributions: [],
        };
        const updated = [...currentHypotheses, newHypothesis];
        await updateDoc(ref, {
          "inquiryMap.hypotheses": updated,
          hypotheses: updated,
        });
        // After adding, scan project data to connect relevant evidence
        try {
          await refreshInquiryMap();
        } catch (e) {
          console.warn("Post-add hypothesis refresh failed", e);
        }
      } catch (err) {
        console.error("Error adding hypothesis:", err);
      }
    },
    [currentUser, currentInitiative, refreshInquiryMap]
  );

  const addQuestion = useCallback(
    async (hypothesisId, question) => {
      if (!currentUser || !currentInitiative) return;
      const ref = doc(db, "users", currentUser, "initiatives", currentInitiative);
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error("Initiative not found");
        const currentHypotheses = getInquiryData(snap.data()).hypotheses;
        const updatedHypotheses = currentHypotheses.map((h) =>
          h.id === hypothesisId
            ? { ...h, questions: [...(h.questions || []), question] }
            : h
        );
        await updateDoc(ref, {
          "inquiryMap.hypotheses": updatedHypotheses,
          hypotheses: updatedHypotheses,
        });
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
        const currentHypotheses = getInquiryData(snap.data()).hypotheses;
        const key = supporting ? "supporting" : "refuting";
        const updatedHypotheses = currentHypotheses.map((h) =>
          h.id === hypothesisId
            ? {
                ...h,
                evidence: {
                  ...(h.evidence || {}),
                  [key]: [...(h.evidence?.[key] || []), { text: evidence }],
                },
              }
            : h
        );
        await updateDoc(ref, {
          "inquiryMap.hypotheses": updatedHypotheses,
          hypotheses: updatedHypotheses,
        });
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

        const currentHypotheses = getInquiryData(snap.data()).hypotheses;
        const updatedHypotheses = currentHypotheses.map((h) =>
          h.id === hypothesisId ? { ...h, confidence: Math.min(1, Math.max(0, confidence)) } : h
        );
        await updateDoc(ref, {
          "inquiryMap.hypotheses": updatedHypotheses,
          hypotheses: updatedHypotheses,
        });
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
    suggestedHypotheses,
    loadHypotheses,
    addHypothesis,
    addQuestion,
    addEvidence,
    triageEvidence,
    refreshInquiryMap,
    updateConfidence,
    isAnalyzing,
    approveSuggestedHypothesis: async (id) => {
      if (!currentUser || !currentInitiative) return;
      const ref = doc(db, "users", currentUser, "initiatives", currentInitiative);
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error("Initiative not found");
        const data = snap.data();
        const current = getInquiryData(data);
        const idx = (current.suggestedHypotheses || []).findIndex((h) => h.id === id);
        if (idx === -1) return;
        const sh = [...(current.suggestedHypotheses || [])];
        const picked = sh.splice(idx, 1)[0];
        const now = Date.now();
        const prov = picked?.provenance || {};
        const evidenceEntry = prov?.evidenceText
          ? {
              text: prov.evidenceText,
              analysisSummary: prov.analysisSummary || "",
              impact: "High",
              delta: 0,
              source: prov.source || prov.respondent || currentUser,
              sourceAuthority: "Medium",
              evidenceType: "Qualitative",
              directness: "Direct",
              relationship: "Supports",
              timestamp: now,
              user: prov.respondent || currentUser,
            }
          : null;
        const newHyp = {
          id: `hyp-${Date.now()}`,
          statement: picked.statement || picked.hypothesis,
          hypothesis: picked.hypothesis || picked.statement,
          confidence: picked.confidence ?? 0,
          evidence: {
            supporting: evidenceEntry ? [evidenceEntry] : [],
            refuting: [],
          },
          sourceContributions: [],
        };
        const hyps = [...(current.hypotheses || []), newHyp];
        await updateDoc(ref, {
          "inquiryMap.hypotheses": hyps,
          hypotheses: hyps,
          suggestedHypotheses: sh,
        });
      } catch (err) {
        console.error("approveSuggestedHypothesis error", err);
      }
    },
    rejectSuggestedHypothesis: async (id) => {
      if (!currentUser || !currentInitiative) return;
      const ref = doc(db, "users", currentUser, "initiatives", currentInitiative);
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error("Initiative not found");
        const data = snap.data();
        const sh = toArray(data?.suggestedHypotheses).filter((h) => h.id !== id);
        await updateDoc(ref, { suggestedHypotheses: sh });
      } catch (err) {
        console.error("rejectSuggestedHypothesis error", err);
      }
    },
  };

  return (
    <InquiryMapContext.Provider value={value}>{children}</InquiryMapContext.Provider>
  );
};

InquiryMapProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useInquiryMap = () => useContext(InquiryMapContext);
