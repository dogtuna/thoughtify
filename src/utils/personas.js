import { db, functions } from "../firebase.js";
import { collection, doc, getDocs, deleteDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

// Load all personas for a given user's initiative
export async function loadPersonas(uid, initiativeId) {
  const personasRef = collection(db, "users", uid, "initiatives", initiativeId, "personas");
  const snapshot = await getDocs(personasRef);
  return snapshot.docs.map((d) => ({
    id: d.id,
    type: "",
    role: "",
    department: "",
    careerStage: "",
    tenure: "",
    region: "",
    workSetting: "",
    shift: "",
    languages: [],
    devices: [],
    bandwidth: "",
    baselineKnowledge: "",
    assessmentComfort: "",
    supportLevel: "",
    accessibility: [],
    summary: "",
    ageRange: "",
    educationLevel: "",
    techProficiency: "",
    learningPreferences: "",
    learningPreferencesKeyword: "",
    ageRangeOptions: [],
    educationLevelOptions: [],
    techProficiencyOptions: [],
    learningPreferencesOptions: [],
    learningPreferenceOptionKeywords: [],
    motivations: [],
    motivation: null,
    motivationOptions: [],
    challengesList: [],
    challenges: null,
    challengeOptions: [],
    avatar: null,
    selectedTraits: [],
    ...d.data(),
  }));
}

// Save a persona via callable function for server-side validation
export async function savePersona(uid, initiativeId, persona) {
  const personasRef = collection(db, "users", uid, "initiatives", initiativeId, "personas");
  const personaId = persona.id || doc(personasRef).id;
  const callable = httpsCallable(functions, "savePersona");
  const defaults = {
    type: "",
    role: "",
    department: "",
    careerStage: "",
    tenure: "",
    region: "",
    workSetting: "",
    shift: "",
    languages: [],
    devices: [],
    bandwidth: "",
    baselineKnowledge: "",
    assessmentComfort: "",
    supportLevel: "",
    accessibility: [],
    summary: "",
    ageRange: "",
    educationLevel: "",
    techProficiency: "",
    learningPreferences: "",
    learningPreferencesKeyword: "",
    ageRangeOptions: [],
    educationLevelOptions: [],
    techProficiencyOptions: [],
    learningPreferencesOptions: [],
    learningPreferenceOptionKeywords: [],
    motivations: [],
    motivation: null,
    motivationOptions: [],
    challengesList: [],
    challenges: null,
    challengeOptions: [],
    avatar: null,
    selectedTraits: [],
  };
  await callable({ initiativeId, personaId, persona: { ...defaults, ...persona } });
  return personaId;
}

// Delete a persona document
export async function deletePersona(uid, initiativeId, personaId) {
  const personaRef = doc(db, "users", uid, "initiatives", initiativeId, "personas", personaId);
  await deleteDoc(personaRef);
}
