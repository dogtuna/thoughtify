import { db } from "../firebase.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

// Ensure initiatives always expose the latest schema fields
const DEFAULT_FIELDS = {
  audienceProfile: "",
  brief: "",
  businessGoal: "",
  contacts: [],
  inquiryMap: {},
  projectQuestions: [],
  sourceMaterials: [],
};

function normalizeInitiative(docSnap) {
  return { id: docSnap.id, ...DEFAULT_FIELDS, ...docSnap.data() };
}

export function deepMerge(target = {}, source = {}) {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    // Treat null/undefined as a directive to delete the key
    if (srcVal === null || srcVal === undefined) {
      if (key in output) delete output[key];
      continue;
    }
    if (
      srcVal &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      tgtVal &&
      typeof tgtVal === "object" &&
      !Array.isArray(tgtVal)
    ) {
      const merged = deepMerge(tgtVal, srcVal);
      // If the merge produced an empty object, drop the key entirely
      if (merged && Object.keys(merged).length === 0) {
        if (key in output) delete output[key];
      } else {
        output[key] = merged;
      }
    } else {
      output[key] = srcVal;
    }
  }
  return output;
}

// Merge project questions by id so that updates to a single question
// do not clobber the rest of the array. Each question's fields are
// deep merged to preserve asked/answers/contactStatus history.
export function mergeQuestionArrays(existing = [], updates = []) {
  const byId = Object.fromEntries(existing.map((q) => [q.id, q]));
  updates.forEach((q) => {
    if (!q || q.id === undefined) return;
    // Allow callers to replace the entire question object by passing _replace: true
    if (q._replace) {
      const { _replace, ...rest } = q;
      if (rest && Object.keys(rest).length > 0) {
        byId[q.id] = rest;
      } else {
        delete byId[q.id];
      }
      return;
    }
    byId[q.id] = deepMerge(byId[q.id] || {}, q);
  });
  return Object.values(byId);
}

export async function loadInitiatives(uid) {
  const initiativesRef = collection(db, "users", uid, "initiatives");
  const snap = await getDocs(initiativesRef);
  return snap.docs.map(normalizeInitiative);
}

export async function loadInitiative(uid, initiativeId) {
  const ref = doc(db, "users", uid, "initiatives", initiativeId);
  const snap = await getDoc(ref);
  return snap.exists() ? normalizeInitiative(snap) : null;
}

export async function saveInitiative(uid, initiativeId, data) {
  const ref = doc(db, "users", uid, "initiatives", initiativeId);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() : {};
  let toMerge = data;
  if (data.projectQuestions) {
    const mergedQuestions = mergeQuestionArrays(
      existing.projectQuestions || [],
      data.projectQuestions,
    );
    toMerge = { ...data, projectQuestions: mergedQuestions };
  }
  const merged = deepMerge(existing, toMerge);
  await setDoc(ref, { ...merged, updatedAt: serverTimestamp() }, { merge: true });
  return initiativeId;
}

export async function saveContentAssets(
  uid,
  initiativeId,
  draftContent = {},
  mediaAssets = []
) {
  const ref = doc(db, "users", uid, "initiatives", initiativeId);
  await setDoc(
    ref,
    { draftContent, mediaAssets, updatedAt: serverTimestamp() },
    { merge: true }
  );
  return initiativeId;
}

export async function deleteInitiative(uid, initiativeId) {
  const ref = doc(db, "users", uid, "initiatives", initiativeId);
  const statusRef = collection(ref, "statusUpdates");
  const snap = await getDocs(statusRef);
  const batch = writeBatch(db);
  snap.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  await deleteDoc(ref);
}
