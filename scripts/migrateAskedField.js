/* eslint-env node */
/* global process */
import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

async function migrateAskedField() {
  const usersSnap = await db.collection("users").get();
  for (const user of usersSnap.docs) {
    const initsSnap = await user.ref.collection("initiatives").get();
    for (const docSnap of initsSnap.docs) {
      const data = docSnap.data();
      const contacts = (data.contacts || data.keyContacts || []).map(
        (c, i) => ({ id: c.id || `C${i + 1}`, ...c }),
      );
      const nameToId = Object.fromEntries(
        contacts.map((c) => [c.name, c.id]),
      );
      const projectQuestions = data.projectQuestions || [];
      let changed = false;
      for (const q of projectQuestions) {
        if (!q.asked) continue;
        const newAsked = {};
        let qChanged = false;
        for (const [key, val] of Object.entries(q.asked)) {
          const id = nameToId[key] || key;
          newAsked[id] = val;
          if (id !== key) qChanged = true;
        }
        if (qChanged) {
          q.asked = newAsked;
          changed = true;
        }
      }
      if (changed) {
        await docSnap.ref.update({ projectQuestions });
        console.log(`Updated asked field for ${user.id}/${docSnap.id}`);
      }
    }
  }
  console.log("Asked field migration complete");
}

migrateAskedField().catch((err) => {
  console.error("Migration failed", err);
  process.exit(1);
});
