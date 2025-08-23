import { db, functions } from "../firebase";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  onSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

export async function createInquiryMap(goal, sponsorInput = "") {
  const mapRef = doc(collection(db, "inquiryMaps"));
  await setDoc(mapRef, { goal });

  try {
    const seedFn = httpsCallable(functions, "seedInquiryMap");
    const result = await seedFn({ goal, sponsorInput });
    const hypotheses = result.data?.hypotheses || [];
    for (const h of hypotheses) {
      const hypRef = await addDoc(collection(mapRef, "hypotheses"), {
        text: h.text,
        confidence: 0,
      });
      if (Array.isArray(h.questions)) {
        for (const q of h.questions) {
          await addDoc(collection(hypRef, "questions"), { text: q });
        }
      }
    }
  } catch (err) {
    console.error("seedInquiryMap failed", err);
  }

  return mapRef.id;
}

export function subscribeInquiryMap(mapId, callback) {
  const mapRef = doc(db, "inquiryMaps", mapId);
  return onSnapshot(mapRef, async (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    const map = { id: snap.id, ...snap.data(), hypotheses: [] };
    const hypSnap = await getDocs(collection(mapRef, "hypotheses"));
    for (const h of hypSnap.docs) {
      const qSnap = await getDocs(collection(h.ref, "questions"));
      map.hypotheses.push({
        id: h.id,
        ...h.data(),
        questions: qSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      });
    }
    callback(map);
  });
}

export async function addHypothesis(mapId, text) {
  const mapRef = doc(db, "inquiryMaps", mapId);
  return addDoc(collection(mapRef, "hypotheses"), { text, confidence: 0 });
}

export async function addQuestion(mapId, hypothesisId, text) {
  const hypRef = doc(db, "inquiryMaps", mapId, "hypotheses", hypothesisId);
  return addDoc(collection(hypRef, "questions"), { text });
}

export async function processEvidence(mapId, content) {
  const mapRef = doc(db, "inquiryMaps", mapId);
  const snap = await getDoc(mapRef);
  if (!snap.exists()) return;
  const map = { id: snap.id, ...snap.data(), hypotheses: [] };
  const hypSnap = await getDocs(collection(mapRef, "hypotheses"));
  for (const h of hypSnap.docs) {
    const qSnap = await getDocs(collection(h.ref, "questions"));
    map.hypotheses.push({
      id: h.id,
      ...h.data(),
      questions: qSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  }
  try {
    const updateFn = httpsCallable(functions, "updateInquiryMap");
    const res = await updateFn({ map, content });
    const data = res.data || {};
    if (Array.isArray(data.hypotheses)) {
      for (const h of data.hypotheses) {
        if (h.id && typeof h.confidence === "number") {
          await updateDoc(doc(mapRef, "hypotheses", h.id), {
            confidence: h.confidence,
          });
        }
        if (Array.isArray(h.newQuestions)) {
          const hypRef = doc(mapRef, "hypotheses", h.id);
          for (const q of h.newQuestions) {
            await addDoc(collection(hypRef, "questions"), { text: q });
          }
        }
      }
    }
    if (Array.isArray(data.newHypotheses)) {
      for (const h of data.newHypotheses) {
        const hypRef = await addDoc(collection(mapRef, "hypotheses"), {
          text: h.text,
          confidence: h.confidence || 0,
        });
        if (Array.isArray(h.questions)) {
          for (const q of h.questions) {
            await addDoc(collection(hypRef, "questions"), { text: q });
          }
        }
      }
    }
  } catch (err) {
    console.error("updateInquiryMap failed", err);
  }
}

