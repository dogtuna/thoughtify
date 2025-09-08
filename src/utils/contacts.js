import { db } from "../firebase";
import { collection, getDocs, setDoc, doc, serverTimestamp } from "firebase/firestore";

const slug = (s) =>
  (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "contact";

export async function loadUserContacts(uid) {
  const snap = await getDocs(collection(db, "users", uid, "contacts"));
  const list = [];
  snap.forEach((d) => list.push({ id: d.id, ...(d.data() || {}) }));
  return list;
}

export async function upsertUserContacts(uid, contacts = []) {
  const now = serverTimestamp();
  for (const c of contacts) {
    if (!c || !c.name) continue;
    const id = (c.info?.email && c.info.email.toLowerCase()) || slug(c.name);
    await setDoc(
      doc(db, "users", uid, "contacts", id),
      {
        name: c.name,
        jobTitle: c.jobTitle || c.role || "",
        email: c.info?.email || c.email || "",
        scope: c.scope || (c.company ? "external" : "internal"),
        company: c.company || "",
        updatedAt: now,
      },
      { merge: true }
    );
  }
}

export async function saveUserContact(uid, contact) {
  if (!uid || !contact || !contact.name) return;
  const now = serverTimestamp();
  const email = contact.info?.email || contact.email || "";
  const id = (email && email.toLowerCase()) || slug(contact.name);
  await setDoc(
    doc(db, "users", uid, "contacts", id),
    {
      name: contact.name,
      jobTitle: contact.jobTitle || contact.role || "",
      email,
      scope: contact.scope || (contact.company ? "external" : "internal"),
      company: contact.company || "",
      updatedAt: now,
    },
    { merge: true }
  );
}

export default { loadUserContacts, upsertUserContacts, saveUserContact };

