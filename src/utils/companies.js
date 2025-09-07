import { db } from "../firebase";
import { collection, getDocs, setDoc, doc, serverTimestamp } from "firebase/firestore";

const slug = (s) =>
  (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "company";

/**
 * Load all companies for the current user.
 * @param {string} uid
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function loadCompanies(uid) {
  const snap = await getDocs(collection(db, "profiles", uid, "companies"));
  const list = [];
  snap.forEach((d) => list.push({ id: d.id, ...(d.data() || {}) }));
  return list;
}

/**
 * Load all contacts across all companies for the user.
 * @param {string} uid
 * @returns {Promise<Array<{id: string, name: string, company: string, email?: string, jobTitle?: string}>>}
 */
export async function loadAllContacts(uid) {
  const companies = await loadCompanies(uid);
  const result = [];
  for (const c of companies) {
    const snap = await getDocs(collection(db, "profiles", uid, "companies", c.id, "contacts"));
    snap.forEach((d) => result.push({ id: d.id, company: c.name, ...(d.data() || {}) }));
  }
  return result;
}

/**
 * Upsert companies and contacts (by name/email) for quick-pick suggestions.
 * @param {string} uid
 * @param {string[]} companies
 * @param {Array<{name:string, company?:string, email?:string, jobTitle?:string}>} contacts
 */
export async function upsertCompaniesAndContacts(uid, companies, contacts) {
  const now = serverTimestamp();
  const uniqCompanies = Array.from(
    new Set((companies || []).map((n) => (n || "").trim()).filter(Boolean))
  );
  for (const name of uniqCompanies) {
    const id = slug(name);
    await setDoc(
      doc(db, "profiles", uid, "companies", id),
      { name, updatedAt: now },
      { merge: true }
    );
  }
  for (const c of contacts || []) {
    const companyName = (c.company || "").trim();
    if (!companyName || !c.name) continue;
    const companyId = slug(companyName);
    await setDoc(
      doc(db, "profiles", uid, "companies", companyId),
      { name: companyName, updatedAt: now },
      { merge: true }
    );
    const contactId = (c.email && c.email.toLowerCase()) || slug(`${c.name}-${Date.now()}`);
    await setDoc(
      doc(db, "profiles", uid, "companies", companyId, "contacts", contactId),
      {
        name: c.name,
        email: c.email || "",
        jobTitle: c.jobTitle || "",
        updatedAt: now,
      },
      { merge: true }
    );
  }
}

