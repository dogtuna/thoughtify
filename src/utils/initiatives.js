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

export async function loadInitiatives(uid) {
  const initiativesRef = collection(db, "users", uid, "initiatives");
  const snap = await getDocs(initiativesRef);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function loadInitiative(uid, initiativeId) {
  const ref = doc(db, "users", uid, "initiatives", initiativeId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveInitiative(uid, initiativeId, data) {
  const ref = doc(db, "users", uid, "initiatives", initiativeId);
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
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
