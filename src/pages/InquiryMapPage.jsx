import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import InquiryMap from "../components/InquiryMap";
import { useInquiryMap } from "../context/InquiryMapContext.jsx";
import { useMemo } from "react";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

const InquiryMapContent = () => {
  const {
    hypotheses,
    suggestedHypotheses,
    loadHypotheses,
    isAnalyzing,
    approveSuggestedHypothesis,
    rejectSuggestedHypothesis,
    addHypothesis,
  } = useInquiryMap();
  const [searchParams, setSearchParams] = useSearchParams();
  const initiativeId = searchParams.get("initiativeId");
  const initialHypothesisId = searchParams.get("hypothesisId");
  const wantsNew = searchParams.get("new") === "hypothesis";

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
    displayId: h.displayId || (typeof h.id === 'string' ? h.id : ''),
    statement: h.statement || h.hypothesis || h.text || h.label || h.id,
    confidence: typeof h.confidence === "number" ? h.confidence : 0,
    supportingEvidence: h.evidence?.supporting || h.supportingEvidence || [],
    refutingEvidence: h.evidence?.refuting || h.refutingEvidence || [],
    sourceContributions: h.sourceContributions || [],
    contested: h.contested || false,
    trend: Math.sign(h.auditLog?.[h.auditLog.length - 1]?.weight || 0),
  }));

  const suggestions = useMemo(
    () => (Array.isArray(suggestedHypotheses) ? suggestedHypotheses : []),
    [suggestedHypotheses]
  );

  const [newHyp, setNewHyp] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const submitHypothesis = async () => {
    const text = (newHyp || "").trim();
    if (!text) return;
    await addHypothesis(text);
    setNewHyp("");
    setShowAdd(false);
    // Clear any new= param once submitted
    if (searchParams.get("new")) {
      const sp = new URLSearchParams(searchParams);
      sp.delete("new");
      setSearchParams(sp, { replace: true });
    }
  };

  const closeAddHypothesis = () => {
    setShowAdd(false);
    if (searchParams.get("new")) {
      const sp = new URLSearchParams(searchParams);
      sp.delete("new");
      setSearchParams(sp, { replace: true });
    }
  };

  // Close slide-over on Escape
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" && (showAdd || wantsNew)) {
        closeAddHypothesis();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showAdd, wantsNew, closeAddHypothesis]);

  return (
    <main className="min-h-screen pb-40">
      <div className="flex items-center gap-4 mb-4">{isAnalyzing && <span>Analyzing evidence...</span>}</div>
      <section className="mx-auto mb-6 w-[90%]">
        {!showAdd && !wantsNew ? (
          <button className="generator-button" onClick={() => setShowAdd(true)}>Add Hypothesis</button>
        ) : null}
      </section>
      {(showAdd || wantsNew) && createPortal(
        <div className="slide-over-overlay" onClick={closeAddHypothesis}>
          <div className="slide-over-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center mb-2">
              <div className="font-semibold">Add Hypothesis</div>
              <div className="flex-1" />
              <button className="text-white" type="button" onClick={closeAddHypothesis}>Close</button>
            </div>
            <textarea
              className="generator-input w-full"
              rows={4}
              placeholder="State a clear, testable hypothesis"
              value={newHyp}
              autoFocus
              onChange={(e) => setNewHyp(e.target.value)}
            />
            <div className="modal-actions mt-2">
              <button className="generator-button" onClick={submitHypothesis} disabled={!newHyp.trim()}>Add</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {suggestions.length > 0 && (
        <section className="mx-auto mb-6 w-[90%]">
          <h3 className="mb-2 font-semibold">Suggested Hypotheses</h3>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.id} className="initiative-card flex items-center justify-between">
                <span>{s.statement}</span>
                <div className="flex gap-2">
                  <button className="generator-button" onClick={() => approveSuggestedHypothesis(s.id)}>Approve</button>
                  <button className="generator-button" onClick={() => rejectSuggestedHypothesis(s.id)}>Reject</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <InquiryMap hypotheses={parsedHypotheses} initialHypothesisId={initialHypothesisId || null} />
    </main>
  );
};

const InquiryMapPage = () => <InquiryMapContent />;

export default InquiryMapPage;
