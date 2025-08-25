import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

async function addTaskMetadata() {
  const profiles = await db.collection("profiles").get();
  for (const userDoc of profiles.docs) {
    const tasksRef = userDoc.ref.collection("taskQueue");
    const tasksSnap = await tasksRef.get();
    const batch = db.batch();
    let counter = 0;
    tasksSnap.forEach((taskDoc) => {
      const data = taskDoc.data();
      const update = {};
      if (data.hypothesisId === undefined) update.hypothesisId = null;
      if (data.taskType === undefined) update.taskType = "explore";
      if (data.priority === undefined) update.priority = "low";
      if (Object.keys(update).length) {
        batch.update(taskDoc.ref, update);
        counter++;
      }
    });
    if (counter > 0) {
      await batch.commit();
      console.log(`Updated ${counter} tasks for user ${userDoc.id}`);
    }
  }
  console.log("Migration complete");
}

addTaskMetadata().catch((err) => {
  console.error("Migration failed", err);
});
