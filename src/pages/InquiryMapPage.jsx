import { useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import InquiryMap from "../components/InquiryMap";
import { useInquiryMap } from "../context/InquiryMapContext.jsx";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

const InquiryMapContent = () => {
  const {
    hypotheses,
    businessGoal,
    loadHypotheses,
    updateConfidence,
    refreshInquiryMap,
    isAnalyzing,
  } = useInquiryMap();
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && initiativeId) {
        loadHypotheses(user.uid, initiativeId);
      }
    });
    return () => unsubscribe();
  }, [initiativeId, loadHypotheses]);

  const parsedHypotheses = (Array.isArray(hypotheses) ? hypotheses : []).map((h) => ({
    id: h.id,
    statement: h.statement || h.text || h.label || h.id,
    confidence: typeof h.confidence === "number" ? h.confidence : 0,
    supportingEvidence: h.supportingEvidence || [],
    refutingEvidence: h.refutingEvidence || [],
    sourceContributions: h.sourceContributions || [],
    contested: h.contested || false,
  }));

  const handleUpdateConfidence = useCallback(
    (hypothesisId, confidence) => {
      updateConfidence(hypothesisId, confidence);
    },
    [updateConfidence]
  );

  const handleRefresh = useCallback(() => {
    refreshInquiryMap();
  }, [refreshInquiryMap]);

  return (
    <main className="min-h-screen pt-32 pb-40">
      <div className="flex items-center gap-4 mb-4">
        {isAnalyzing && <span>Analyzing evidence...</span>}
      </div>
      <InquiryMap
        businessGoal={businessGoal}
        hypotheses={parsedHypotheses}
        onUpdateConfidence={handleUpdateConfidence}
        onRefresh={handleRefresh}
        isAnalyzing={isAnalyzing}
      />
    </main>
  );
};

const InquiryMapPage = () => <InquiryMapContent />;

export default InquiryMapPage;
