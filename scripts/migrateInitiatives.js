/* eslint-env node */
/* global process */
import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

async function migrateInitiatives() {
  const usersSnap = await db.collection("users").get();
  for (const user of usersSnap.docs) {
    const initSnap = await user.ref.collection("initiatives").get();
    for (const docSnap of initSnap.docs) {
      const data = docSnap.data();

      const projectQuestions = (data.clarifyingQuestions || []).map((q, idx) => ({
        ...(typeof q === "object" ? q : { question: q }),
        answer: data.clarifyingAnswers ? data.clarifyingAnswers[idx] : undefined,
        asked: data.clarifyingAsked ? data.clarifyingAsked[idx] : undefined,
        contacts: data.clarifyingContacts
          ? data.clarifyingContacts[idx]
          : undefined,
      }));

      const contacts = data.contacts || data.keyContacts || [];

      const update = {
        audienceProfile: data.audienceProfile || "",
        brief: data.brief || data.projectBrief || "",
        businessGoal: data.businessGoal || "",
        contacts,
        inquiryMap: data.inquiryMap || (data.hypotheses ? { hypotheses: data.hypotheses } : {}),
        projectQuestions,
        sourceMaterials: data.sourceMaterials || [],
        updatedAt: FieldValue.serverTimestamp(),
      };

      await docSnap.ref.set(update, { merge: true });
      await docSnap.ref.update({
        clarifyingQuestions: FieldValue.delete(),
        clarifyingAnswers: FieldValue.delete(),
        clarifyingAsked: FieldValue.delete(),
        clarifyingContacts: FieldValue.delete(),
        keyContacts: FieldValue.delete(),
        projectBrief: FieldValue.delete(),
        hypotheses: FieldValue.delete(),
      });
    }
  }
  console.log("Initiative migration complete");
}

migrateInitiatives().catch((err) => {
  console.error("Migration failed", err);
  process.exit(1);
});
