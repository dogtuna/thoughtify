import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import InquiryMap from "../components/InquiryMap";
import { useInquiryMap } from "../context/InquiryMapContext.jsx";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

const InquiryMapContent = () => {
  const { hypotheses, loadHypotheses, isAnalyzing } = useInquiryMap();
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId");

  const [user, setUser] = useState(() => auth.currentUser);

  // Track auth state separately so we only load data when a user is available
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      console.log("Auth state changed", u?.uid);
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // Load hypotheses once both user and initiative ID are known
  useEffect(() => {
    if (user && initiativeId) {
      console.log("Loading hypotheses for", user.uid, initiativeId);
      loadHypotheses(user.uid, initiativeId);
    } else {
      console.log("Waiting for user or initiativeId", { user, initiativeId });
    }
  }, [user, initiativeId, loadHypotheses]);

  useEffect(() => {
    console.log("Hypotheses state updated", hypotheses);
  }, [hypotheses]);

  const parsedHypotheses = (Array.isArray(hypotheses) ? hypotheses : []).map((h) => ({
    id: h.id,
    statement: h.statement || h.text || h.label || h.id,
    confidence: typeof h.confidence === "number" ? h.confidence : 0,
    supportingEvidence: h.supportingEvidence || [],
    refutingEvidence: h.refutingEvidence || [],
    sourceContributions: h.sourceContributions || [],
    contested: h.contested || false,
    trend: Math.sign(h.auditLog?.[h.auditLog.length - 1]?.weight || 0),
  }));

  return (
    <main className="min-h-screen pb-40">
      <div className="flex items-center gap-4 mb-4">
        {isAnalyzing && <span>Analyzing evidence...</span>}
      </div>
      <InquiryMap hypotheses={parsedHypotheses} />
    </main>
  );
};

const InquiryMapPage = () => <InquiryMapContent />;

export default InquiryMapPage;
