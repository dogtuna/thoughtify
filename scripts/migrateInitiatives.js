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

      const contacts = (data.contacts || data.keyContacts || []).map(
        (c, i) => ({ id: c.id || `C${i + 1}`, ...c }),
      );

      const projectQuestions = (data.clarifyingQuestions || []).map((q, idx) => {
        const questionObj =
          typeof q === "object" ? q : { question: q, phase: "General" };
        const contactNames = data.clarifyingContacts
          ? data.clarifyingContacts[idx] || []
          : [];
        const contactsIds = contactNames.map((n) => {
          const match = contacts.find((c) => c.name === n);
          return match?.id || n;
        });
        const rawAnswers = data.clarifyingAnswers
          ? data.clarifyingAnswers[idx] || {}
          : {};
        const answers = Object.entries(rawAnswers).map(([name, val]) => ({
          contactId: contacts.find((c) => c.name === name)?.id || name,
          text: typeof val === "string" ? val : val?.text || "",
        }));
        return {
          id: questionObj.id || `Q${idx + 1}`,
          phase: questionObj.phase || "General",
          question: questionObj.question,
          contacts: contactsIds,
          answers,
        };
      });

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
