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

function deepMerge(target = {}, source = {}) {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (
      srcVal &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      tgtVal &&
      typeof tgtVal === "object" &&
      !Array.isArray(tgtVal)
    ) {
      output[key] = deepMerge(tgtVal, srcVal);
    } else {
      output[key] = srcVal;
    }
  }
  return output;
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
  const merged = deepMerge(existing, data);
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
