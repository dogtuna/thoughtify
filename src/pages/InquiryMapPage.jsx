import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import InquiryMap from "../components/InquiryMap";
import { InquiryMapProvider, useInquiryMap } from "../context/InquiryMapContext";
import { auth } from "../firebase";

const InquiryMapContent = () => {
  const { hypotheses, businessGoal, loadHypotheses } = useInquiryMap();
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
    confidence: h.confidence,
  }));

  return <InquiryMap businessGoal={businessGoal} hypotheses={parsedHypotheses} />;
};

const InquiryMapPage = () => (
  <InquiryMapProvider>
    <InquiryMapContent />
  </InquiryMapProvider>
);

export default InquiryMapPage;
