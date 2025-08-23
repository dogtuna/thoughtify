import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import InquiryMap from "../components/InquiryMap";
import { InquiryMapProvider, useInquiryMap } from "../context/InquiryMapContext";
import { auth } from "../firebase";

const InquiryMapContent = () => {
  const { hypotheses, loadHypotheses } = useInquiryMap();
  const [searchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId");

  useEffect(() => {
    const user = auth.currentUser;
    if (user && initiativeId) {
      loadHypotheses(user.uid, initiativeId);
    }
  }, [initiativeId, loadHypotheses]);

  const hypothesisLabels = hypotheses.map((h) => h.text || h.label || h.id);

  return <InquiryMap hypotheses={hypothesisLabels} />;
};

const InquiryMapPage = () => (
  <InquiryMapProvider>
    <InquiryMapContent />
  </InquiryMapProvider>
);

export default InquiryMapPage;
