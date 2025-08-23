import { useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import InquiryMap from "../components/InquiryMap";
import { useInquiryMap } from "../context/InquiryMapContext";
import { auth } from "../firebase";

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
    const user = auth.currentUser;
    if (user && initiativeId) {
      loadHypotheses(user.uid, initiativeId);
    }
  }, [initiativeId, loadHypotheses]);

  const parsedHypotheses = hypotheses.map((h) => ({
    id: h.id,
    statement: h.statement || h.text || h.label || h.id,
    confidence: typeof h.confidence === "number" ? h.confidence : 0,
  }));

  const handleUpdateConfidence = useCallback(
    (hypothesisId, confidence) => {
      const user = auth.currentUser;
      if (user && initiativeId) {
        updateConfidence(user.uid, initiativeId, hypothesisId, confidence);
      }
    },
    [initiativeId, updateConfidence]
  );

  const handleRefresh = useCallback(() => {
    const user = auth.currentUser;
    if (user && initiativeId) {
      refreshInquiryMap(user.uid, initiativeId);
    }
  }, [initiativeId, refreshInquiryMap]);

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <button
          className="px-4 py-2 bg-green-500 text-white rounded"
          onClick={handleRefresh}
        >
          Refresh Inquiry Map
        </button>
        {isAnalyzing && <span>Analyzing evidence...</span>}
      </div>
      <InquiryMap
        businessGoal={businessGoal}
        hypotheses={parsedHypotheses}
        onUpdateConfidence={handleUpdateConfidence}
      />
    </div>
  );
};

const InquiryMapPage = () => <InquiryMapContent />;

export default InquiryMapPage;
