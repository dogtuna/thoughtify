import { db } from "../firebase.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  where,
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
      const { _replace: _discard, ...rest } = q;
      void _discard;
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

  // Fetch initiative data to collect hypothesis IDs for related notifications.
  const initSnap = await getDoc(ref);
  const init = initSnap.exists() ? initSnap.data() : {};
  const hypothesisIds = new Set([
    ...(init.hypotheses || []).map((h) => h.id),
    ...(init.inquiryMap?.hypotheses || []).map((h) => h.id),
    ...(init.suggestedHypotheses || []).map((h) => h.id),
  ]);

  // Helper to delete all docs in a subcollection
  const deleteAll = async (colRef) => {
    const s = await getDocs(colRef);
    if (!s.empty) {
      const b = writeBatch(db);
      s.forEach((d) => b.delete(d.ref));
      await b.commit();
    }
  };

  // Remove status updates, tasks, suggested items under the initiative
  const batch = writeBatch(db);
  await deleteAll(collection(ref, "statusUpdates"));
  await deleteAll(collection(ref, "tasks"));
  const suggestedTasksRef = collection(ref, "suggestedTasks");
  const suggestedQuestionsRef = collection(ref, "suggestedQuestions");
  await deleteAll(suggestedTasksRef);
  await deleteAll(suggestedQuestionsRef);

  // Decrement global notification counters for initiative-scoped suggestions
  const [stSnap, sqSnap] = await Promise.all([
    getDocs(suggestedTasksRef),
    getDocs(suggestedQuestionsRef),
  ]);
  const stCount = stSnap.size || 0;
  const sqCount = sqSnap.size || 0;
  const shCount = Array.isArray(init.suggestedHypotheses)
    ? init.suggestedHypotheses.length
    : 0;

  const notifsRoot = collection(db, "users", uid, "notifications");
  const adjustNotificationCount = async (notifId, decrementBy) => {
    if (!decrementBy || decrementBy <= 0) return;
    const nRef = doc(notifsRoot, notifId);
    const nSnap = await getDoc(nRef);
    if (!nSnap.exists()) return;
    const data = nSnap.data() || {};
    const current = Number(data.count || 0);
    const next = Math.max(0, current - decrementBy);
    if (next > 0) {
      await updateDoc(nRef, { count: next });
    } else {
      await deleteDoc(nRef);
    }
  };
  await adjustNotificationCount("suggestedTasks", stCount);
  await adjustNotificationCount("suggestedQuestions", sqCount);
  await adjustNotificationCount("suggestedHypotheses", shCount);

  // Remove notifications that reference this initiative directly (links, ids)
  const notifSnap = await getDocs(notifsRoot);
  notifSnap.forEach((n) => {
    const data = n.data() || {};
    const related =
      data.initiativeId === initiativeId ||
      (typeof data.href === "string" && data.href.includes(initiativeId)) ||
      (n.id.startsWith("hyp-") && hypothesisIds.has(n.id.slice(4)));
    if (related) {
      batch.delete(n.ref);
    }
  });

  await batch.commit();

  // Remove messages related to this initiative
  try {
    const messagesRef = collection(db, "users", uid, "messages");
    const msgSnap = await getDocs(
      // Some environments may not index this; if so, best-effort filter in code
      messagesRef
    );
    const toDelete = msgSnap.docs.filter((d) => (d.data()?.initiativeId || "") === initiativeId);
    if (toDelete.length) {
      const b = writeBatch(db);
      toDelete.forEach((d) => b.delete(d.ref));
      await b.commit();
    }
  } catch (e) {
    console.warn("Failed to delete initiative messages", e);
  }
  await deleteDoc(ref);
}

// Remove user messages that are not associated with any existing (unarchived) initiative,
// and clear any answerReceived notifications that reference missing messages.
export async function pruneOrphanMessages(uid) {
  const userRoot = doc(db, "users", uid);
  const initsSnap = await getDocs(collection(userRoot, "initiatives"));
  const active = new Set(
    initsSnap.docs
      .map((d) => ({ id: d.id, archived: (d.data() || {}).archived }))
      .filter((r) => !r.archived)
      .map((r) => r.id)
  );

  // Delete messages lacking initiativeId or pointing to inactive initiatives
  const messagesCol = collection(userRoot, "messages");
  const msgSnap = await getDocs(messagesCol);
  const toDelete = msgSnap.docs.filter((d) => {
    const data = d.data() || {};
    const initId = data.initiativeId || "";
    return !initId || !active.has(String(initId));
  });
  if (toDelete.length) {
    const b = writeBatch(db);
    toDelete.forEach((d) => b.delete(d.ref));
    await b.commit();
  }

  // Clear notifications that reference deleted/missing messages
  const notifsCol = collection(userRoot, "notifications");
  const notifSnap = await getDocs(notifsCol);
  for (const n of notifSnap.docs) {
    const data = n.data() || {};
    if (data.type !== "answerReceived") continue;
    let messageId = data.messageId || null;
    if (!messageId && typeof data.href === "string") {
      try {
        const u = new URL(data.href, typeof window !== 'undefined' ? window.location.origin : 'https://example.com');
        messageId = u.searchParams.get("messageId");
      } catch {}
    }
    if (!messageId) continue;
    const mRef = doc(db, "users", uid, "messages", String(messageId));
    const mSnap = await getDoc(mRef);
    if (!mSnap.exists() && (data.count || 0) > 0) {
      try { await updateDoc(n.ref, { count: 0 }); } catch {}
    }
  }
}
