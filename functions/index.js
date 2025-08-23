/* eslint-disable no-unused-vars */
// functions/index.js
import process from "process";
import functions from "firebase-functions";
import nodemailer from "nodemailer";
import admin from "firebase-admin";
import { gemini, googleAI } from "@genkit-ai/googleai";
import { genkit } from "genkit";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { createAvatar } from "@dicebear/core";
import { notionists } from "@dicebear/collection";
import crypto from "crypto";
import { Buffer } from "buffer";

const FIREBASE_CONFIG = JSON.parse(process.env.FIREBASE_CONFIG || "{}");
const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  "thoughtify-web-bb1ea";

const BUCKET_NAME =
  FIREBASE_CONFIG.storageBucket ||                 // ✅ best source
  process.env.FIREBASE_STORAGE_BUCKET ||           // optional override
  `${PROJECT_ID}.appspot.com`;                     // legacy fallback

if (!admin.apps.length) {
  admin.initializeApp({ storageBucket: BUCKET_NAME });
}

const db = admin.firestore();

const AGE_RANGES = ["18-24", "25-34", "35-44", "45-54", "55+"];
const EDUCATION_LEVELS = [
  "No College",
  "High school diploma",
  "Associate degree",
  "Bachelor's degree",
  "Master's degree",
  "Doctorate",
];
const TECH_LEVELS = ["Beginner", "Intermediate", "Advanced"];

// Additional persona trait option lists
const ROLES = [
  "Sales Associate",
  "Project Manager",
  "Technician",
  "Customer Support Agent",
  "Consultant",
  "Engineer",
  "Trainer",
];

const DEPARTMENTS = [
  "Sales",
  "Marketing",
  "Engineering",
  "HR",
  "Operations",
  "Support",
  "Finance",
];

const CAREER_STAGES = ["Entry", "Mid", "Senior", "Lead/Manager"];
const TENURE_OPTIONS = ["0-6 mo", "6-12 mo", "1-3 yr", "3+ yr"];
const REGIONS = [
  "North America",
  "Europe",
  "Asia",
  "South America",
  "Africa",
  "Australia",
];
const WORK_SETTINGS = ["Onsite", "Hybrid", "Remote", "Field"];
const SHIFT_WINDOWS = ["Weekdays 9-5", "Weekends", "Evenings", "Flexible"];
const LANGUAGES = ["English", "Spanish", "French", "German", "Mandarin", "Hindi"];
const DEVICES = ["Desktop", "Laptop", "Tablet", "Phone"];
const BANDWIDTH_LEVELS = ["Low", "Medium", "High"];
const KNOWLEDGE_LEVELS = ["Novice", "Intermediate", "Expert"];
const ASSESSMENT_COMFORTS = ["Quizzes", "Sims", "Role-play"];
const SUPPORT_LEVELS = ["Low", "Medium", "High"];
const ACCESSIBILITY_NEEDS = [
  "Captions",
  "Screen reader",
  "Keyboard-only",
  "Color contrast",
  "Audio descriptions",
  "Extra time",
];

function getRandomItems(arr, count) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function getRandomItem(arr) {
  return arr[crypto.randomInt(0, arr.length)];
}

function generateUniquePersonaType(existing = []) {
  const used = new Set(existing.map((n) => n.toLowerCase()));
  for (let i = 0; i < 100; i++) {
    const role = getRandomItem(ROLES);
    const stage = getRandomItem(CAREER_STAGES);
    const type = `${stage} ${role}`;
    if (!used.has(type.toLowerCase())) {
      return { type, role, careerStage: stage };
    }
  }
  return {
    type: `Persona ${crypto.randomInt(1000, 9999)}`,
    role: getRandomItem(ROLES),
    careerStage: getRandomItem(CAREER_STAGES),
  };
}

// Retrieve the API key from environment variables (using Firebase secrets)
// Make sure you have set the secret via:
//    firebase functions:secrets:set GOOGLE_GENAI_API_KEY "your_api_key"
const apiKey = process.env.GOOGLE_GENAI_API_KEY;
if (!apiKey) {
  console.warn("No API key found in process.env.GOOGLE_GENAI_API_KEY; please set it as a secret.");
}

// Create a nodemailer transporter.
const transporter = nodemailer.createTransport({
  host: "smtp.zoho.com",
  port: 465,
  secure: true, // Use SSL
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function parseJsonFromText(text) {
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  if (objStart === -1 && arrStart === -1) {
    throw new Error("No JSON content found in text");
  }

  const start =
    arrStart !== -1 && (arrStart < objStart || objStart === -1)
      ? arrStart
      : objStart;
  const open = text[start];
  const close = open === "[" ? "]" : "}";

  let depth = 0,
    inStr = false,
    esc = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === "\\") {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }

    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        return JSON.parse(candidate);
      }
    }
  }

  throw new Error("No complete JSON content found");
}

function getInquiryMapCollections(projectId) {
  const base = db.collection("projects").doc(projectId).collection("inquiryMap");
  return {
    hypotheses: base.collection("hypotheses"),
    questions: base.collection("questions"),
    evidence: base.collection("evidence"),
    tasks: base.collection("tasks"),
  };
}

function buildInquiryNode({
  title,
  parentHypothesisId = null,
  confidenceScore = 0,
  status = "open",
  links = [],
}) {
  return {
    title,
    parentHypothesisId,
    confidenceScore,
    status,
    links,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

export const setCustomClaims = onRequest(async (req, res) => {
  // Expect a JSON body like: { id: "USER_UID", claims: { admin: true } }
  const { id, claims } = req.body;
  if (!id || !claims) {
    res.status(400).send({ status: "error", message: "Missing id or claims" });
    return;
  }

  try {
    await admin.auth().setCustomUserClaims(id, claims);
    res.status(200).send({ status: "success", message: "Custom claims set successfully" });
  } catch (error) {
    console.error("Error setting custom claims:", error);
    res.status(500).send({ status: "error", message: error.message });
  }
});

export const generateInvitation = functions.https.onCall(async (data, context) => {
  // Extract the payload: check if data is nested
  const payload = data.data || data;
  const { businessName, businessEmail } = payload;
  if (!businessName || !businessEmail) {
    throw new functions.https.HttpsError("invalid-argument", "Business name and email are required.");
  }

  // Generate a random 8-character code.
  const generateRandomCode = () => Math.random().toString(36).substring(2, 10).toUpperCase();

  const invitationCode = generateRandomCode();
  const invitationData = {
    businessName,
    businessEmail,
    invitationCode,
    status: "not started",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastLogin: null,
  };

  await db.collection("invitations").add(invitationData);
  return { invitationCode };
});

export const generateTrainingPlan = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (request) => {
    console.log("Incoming request data:", request.data);
    console.log("Incoming auth:", request.auth);

    const payload = request.data;
    const prompt = payload?.prompt;
    if (!prompt) {
      throw new HttpsError("invalid-argument", "A prompt must be provided.");
    }

    try {
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) throw new HttpsError("internal", "No API key available.");

      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini("gemini-1.5-pro"),
      });

      const trainingPlanFlow = ai.defineFlow("trainingPlanFlow", async () => {
        const { text } = await ai.generate(prompt);
        return text;
      });

      const trainingPlan = await trainingPlanFlow();
      return { trainingPlan };
    } catch (error) {
      console.error("Error generating training plan:", error);
      throw new HttpsError("internal", "Failed to generate training plan.");
    }
  }
);

export const generateStudyMaterial = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (request) => {
    console.log("Incoming request data:", request.data);
    console.log("Incoming auth:", request.auth);

    const topic = request?.data?.topic;
    if (!topic) {
      throw new HttpsError("invalid-argument", "A topic must be provided.");
    }

    try {
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) throw new HttpsError("internal", "No API key available.");

      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini("gemini-1.5-pro"),
      });

      const promptTemplate = `Create a comprehensive study guide on "${topic}" for high school or college students.  Include the following:

* **Target Audience:** High school or college students (specify which if known).
* **Comprehensive Overview:** A thorough explanation of the topic, covering all key aspects.
* **Key Concepts:**  Essential concepts, theories, and terminology.  Explain each clearly.
* **Examples:** Illustrative examples and practical applications.
* **Review Questions or Practice Problems:** Questions or problems to test understanding and aid in exam preparation.

Prioritize accuracy and avoid fabricating information. If unsure about specific details, it's better to omit them than provide inaccurate information.  Focus on clear explanations and relevant examples.
`;

      const flow = ai.defineFlow("studyMaterialFlow", async () => {
        const { text } = await ai.generate(promptTemplate);
        return text;
      });

      const studyMaterial = await flow();
      return { studyMaterial };
    } catch (error) {
      console.error("Error generating study material:", error);
      throw new HttpsError("internal", "Failed to generate study material.");
    }
  }
);

export const generateCourseOutline = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (request) => {
    console.log("Incoming request data:", request.data);
    console.log("Incoming auth:", request.auth);

    const topic = request?.data?.topic;
    if (!topic) {
      throw new HttpsError("invalid-argument", "A course topic must be provided.");
    }

    try {
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) throw new HttpsError("internal", "No API key available.");

      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini("gemini-1.5-pro"),
      });

      const promptTemplate = `Generate a professional, multi-module course outline for a course on "${topic}".
Prioritize accuracy and avoid fabricating information.  If you are unsure about the details of a resource, it is better to omit it than to provide inaccurate information.  Focus on generating a solid course structure and suggesting general learning areas.
      Include the following sections:
1. **Course Title:** Provide a concise, engaging title.
2. **Introduction/Overview:** Write a brief overview summarizing the course content and objectives.
3. **Target Audience:** Define who the course is designed for.
4. **Learning Objectives:** List the key outcomes learners will achieve.
5. **Module Summaries:** For each module, include:
   - **Module Title:** A clear, concise title.
   - **Description:** A summary of the module's content.
   - **Key Concepts:** A bullet list of main topics.
   - **Recommended Resources:** One or two resources for further learning.
   - **Duration:** A suggested duration for the module.
6. **Conclusion/Next Steps:** Summarize the overall course and provide actionable recommendations for further study.
Use clear, concise, and professional language suitable for a general audience.`;

      const flow = ai.defineFlow("courseOutlineFlow", async () => {
        const { text } = await ai.generate(promptTemplate);
        return text;
      });

      const outline = await flow();
      return { outline };
    } catch (error) {
      console.error("Error generating course outline:", error);
      throw new HttpsError("internal", "Failed to generate the course outline.");
    }
  }
);

export const generateAssessment = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (request) => {
    console.log("Incoming request data:", request.data);
    console.log("Incoming auth:", request.auth);

    const topic = request?.data?.topic;
    if (!topic) {
      throw new HttpsError("invalid-argument", "A topic must be provided.");
    }

    try {
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) throw new HttpsError("internal", "No API key available.");

      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini("gemini-1.5-pro"),
      });

      const promptTemplate = `Create an assessment and answer key/rubric on the topic of "${topic}".  The assessment should evaluate understanding of the key concepts related to this topic.

**Assessment Format:**  Choose a suitable format for assessing knowledge of this topic (e.g., multiple-choice questions, short answer questions, essay question, coding challenge, project proposal, etc.).  Clearly indicate the chosen format.

**Assessment Questions/Tasks:** Provide the assessment itself. This should include clear instructions and specific questions or tasks.

**Answer Key/Rubric:**  Provide the correct answers or a detailed rubric for grading the assessment.  Ensure the answer key/rubric aligns with the chosen assessment format and effectively evaluates understanding of the topic.
`;

      const flow = ai.defineFlow("assessmentFlow", async () => {
        const { text } = await ai.generate(promptTemplate);
        return text;
      });

      const assessment = await flow();
      return { assessment };
    } catch (error) {
      console.error("Error generating assessment:", error);
      throw new HttpsError("internal", "Failed to generate assessment.");
    }
  }
);

export const generateLessonContent = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (request) => {
    console.log("Incoming request data:", request.data);
    console.log("Incoming auth:", request.auth);

    const topic = request?.data?.topic;
    if (!topic) {
      throw new HttpsError("invalid-argument", "A topic must be provided.");
    }

    try {
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) throw new HttpsError("internal", "No API key available.");

      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini("gemini-1.5-pro"),
      });

      const promptTemplate = `Create comprehensive lesson content on the topic: "${topic}".

The target audience is undergraduate students.  The content should include:

* **Engaging Introduction:**  Start with a hook to grab the reader's attention and briefly introduce the topic.
* **Detailed Explanations:** Provide thorough explanations of all key concepts, using clear and accessible language.  Break down complex ideas into smaller, manageable parts.
* **Examples:**  Illustrate key concepts with relevant and concrete examples.  Real-world examples are particularly helpful.
* **Visual Aids (if applicable):**  Include diagrams, charts, equations, or other visual aids to enhance understanding where appropriate.  Use clear labels and captions.
* **Concluding Summary:**  Summarize the main points of the lesson and provide a brief overview of what was covered.

The lesson content should be well-structured, accurate, and engaging.  Prioritize clarity and avoid unnecessary jargon. If unsure about specific details, it's better to omit them than provide inaccurate information.
`;

      const flow = ai.defineFlow("lessonContentFlow", async () => {
        const { text } = await ai.generate(promptTemplate);
        return text;
      });

      const lessonContent = await flow();
      return { lessonContent };
    } catch (error) {
      console.error("Error generating lesson content:", error);
      throw new HttpsError("internal", "Failed to generate lesson content.");
    }
  }
);

export const generateClarifyingQuestions = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"], invoker: "public" },
  async (request) => {
    const {
      businessGoal,
      audienceProfile,
      sourceMaterial,
      projectConstraints,
      keyContacts = [],
    } = request.data || {};

    if (!businessGoal) {
      throw new HttpsError("invalid-argument", "A business goal is required.");
    }

    const key = process.env.GOOGLE_GENAI_API_KEY;
    if (!key) {
      throw new HttpsError("internal", "No API key available.");
    }

    const ai = genkit({
      plugins: [googleAI({ apiKey: key })],
      model: gemini("gemini-1.5-pro"),
    });

    const contactsInfo =
      Array.isArray(keyContacts) && keyContacts.length
        ? `\nKey Contacts: ${keyContacts
            .map((c) => `${c.name} (${c.role})`)
            .join("; ")}`
        : "";
    const promptTemplate =
      `You are an expert Instructional Designer and Performance Consultant. Your primary goal is to generate deeply contextual clarifying questions based on the provided project information and documents.

Follow these steps in order:

Analyze Document Themes: First, meticulously scan the body of any provided documents. Identify and extract specific, recurring keywords, themes, patterns, and data points (e.g., 'narrow aisles', 'micromanagement', '15% drop'). This is your most important task.

Generate Theme-Based Questions: Based only on your analysis in Step 1, generate 2-3 high-priority questions that directly reference or quote the key themes and data points you found. These questions should dig into the "why" behind those specific details.

Generate Broader Strategic Questions: After you have created the theme-based questions, generate additional clarifying questions about the overall project goals, current state, and constraints that may not have been in the documents.

Format the Final Output: For every question you've generated, suggest the primary stakeholder roles that should be consulted and assign the question to one of these phases: "The Core Problem & Vision", "The Current State", or "The Project Constraints".

Return a valid JSON object with the structure:{
  "clarifyingQuestions": [
    {"question":"text","stakeholders":["role1","role2"],"phase":"The Core Problem & Vision"}
  ]
}
Do not include any code fences or additional formatting.

Business Goal: ${businessGoal}
Audience Profile: ${audienceProfile}
Project Constraints: ${projectConstraints}
Source Material: ${sourceMaterial}${contactsInfo}`;

    try {
      const { text } = await ai.generate(promptTemplate);

      let json;
      try {
        json = parseJsonFromText(text);
      } catch (err) {
        console.error("Failed to parse AI response:", err, text);
        throw new HttpsError("internal", "Invalid AI response format.");
      }

      if (!Array.isArray(json.clarifyingQuestions)) {
        console.error(
          "AI response missing clarifyingQuestions field:",
          json
        );
        throw new HttpsError(
          "internal",
          "AI response missing clarifying questions."
        );
      }

      // Must return a plain object for callables
      return json;
    } catch (error) {
      console.error("Error generating clarifying questions:", error);
      throw new HttpsError(
        "internal",
        "Failed to generate clarifying questions."
      );
    }
  }
);

export const generateProjectBrief = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"], invoker: "public" },
  async (request) => {
    const {
      businessGoal,
      audienceProfile,
      sourceMaterial,
      projectConstraints,
      keyContacts = [],
      clarifyingQuestions = [],
      clarifyingAnswers = [],
    } = request.data || {};

    if (!businessGoal) {
      throw new HttpsError("invalid-argument", "A business goal is required.");
    }

    const key = process.env.GOOGLE_GENAI_API_KEY;
    if (!key) {
      throw new HttpsError("internal", "No API key available.");
    }

    const ai = genkit({
      plugins: [googleAI({ apiKey: key })],
      model: gemini("gemini-1.5-pro"),
    });

    const contactsInfo =
      Array.isArray(keyContacts) && keyContacts.length
        ? `\nKey Contacts: ${keyContacts
            .map((c) => `${c.name} (${c.role})`)
            .join("; ")}`
        : "";
    const clarificationsBlock = (() => {
      const pairs = clarifyingQuestions.map(
        (q, i) => `Q: ${q?.question || q}\nA: ${clarifyingAnswers[i] || ""}`
      );
      return pairs.length ? `\nClarifications:\n${pairs.join("\n")}` : "";
    })();

    const promptTemplate =
      `You are an expert Performance Consultant and Business Analyst. Using the information provided, create a project brief written in a clear, narrative style like a blog post, using distinct paragraphs for readability.
Return a valid JSON object with the structure:{
  "projectBrief": "text of the brief"
}
Do not include any code fences or additional formatting.

Business Goal: ${businessGoal}
Audience Profile: ${audienceProfile}
Project Constraints: ${projectConstraints}
Source Material: ${sourceMaterial}${contactsInfo}${clarificationsBlock}`;

    try {
      const { text } = await ai.generate(promptTemplate);

      let json;
      try {
        json = parseJsonFromText(text);
      } catch (err) {
        console.error("Failed to parse AI response:", err, text);
        throw new HttpsError("internal", "Invalid AI response format.");
      }

      if (!json.projectBrief) {
        console.error("AI response missing projectBrief field:", json);
        throw new HttpsError("internal", "AI response missing project brief.");
      }

      // Must return a plain object for callables
      return json;
  } catch (error) {
      console.error("Error generating project brief:", error);
      throw new HttpsError("internal", "Failed to generate project brief.");
    }
  }
);

export const generateStatusUpdate = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"], invoker: "public" },
  async (request) => {
      const {
        audience = "",
        today = "",
        previousUpdateSummary = "None",
        newStakeholderAnswers = "",
        newDocuments = "",
        projectBaseline = "",
        allOutstandingTasks = "",
      } = request.data || {};

    const key = process.env.GOOGLE_GENAI_API_KEY;
    if (!key) {
      throw new HttpsError("internal", "No API key available.");
    }

    const ai = genkit({
      plugins: [googleAI({ apiKey: key })],
      model: gemini("gemini-1.5-pro"),
    });

      const promptTemplate = `Your role is an expert Performance Consultant delivering a strategic brief to a client. Your writing style must be analytical, evidence-based, and consultative. Your primary goal is to analyze the project's trajectory and provide a forward-looking strategic update, not a simple list of activities.

---
### Core Analytical Task: Delta Analysis

Your most important task is to analyze the project's evolution since the last update.

**IF \`Previous Update\` is "None":**
This is the **initial project brief**. Your task is to establish the baseline. Synthesize the \`Project Baseline\` data with any initial documents or answers to define the business problem, state the initial working hypothesis, and outline the clear next actions for the discovery phase.

**IF \`Previous Update\` exists:**
This is a **follow-up brief**. Do not re-summarize old information from the previous update. Your analysis must focus **exclusively** on the strategic impact of the \`New Stakeholder Answers\` and \`New Documents\`.
1.  In the \`Situation Analysis\`, explicitly state how this new information **confirms, challenges, or changes** the previous working hypothesis.
2.  In the \`Key Findings\`, detail the specific new evidence and its implications.
3.  In the \`Strategic Recommendations\`, your actions must be a direct consequence of the new findings, showing a clear evolution of the project plan.

---
### Step-by-Step Instructions

**Step 1: Factual Grounding (Internal Thought Process)**
First, review all \`Project Data\`. Create a private, internal list of only the most critical facts from the **new** information provided.

**Step 2: Strategic Synthesis & Drafting (The Final Output)**
Now, using ONLY the facts you summarized in Step 1 and your \`Core Analytical Task\` above, draft the project brief. Frame your findings as a diagnosis and your recommendations as a clear, expert-guided path forward.

**CRITICAL RULE:** Do not invent any meetings, conversations, stakeholder names, or data points that are not explicitly present in the \`Project Data\`. Every conclusion must be a logical deduction from the provided evidence.

Begin the response with "Date: ${today}" and structure it under the following headings:

Situation Analysis & Working Hypothesis

Key Findings & Evidence

Strategic Recommendations & Next Actions

Return a valid JSON object with the structure:
{
  "statusUpdate": "full text of the brief"
}
Do not include any code fences or additional formatting.

Project Data
Audience: ${audience}
Previous Update: ${previousUpdateSummary}
Project Baseline: ${projectBaseline}
New Stakeholder Answers: ${newStakeholderAnswers}
New Documents: ${newDocuments}
All Outstanding Questions & Tasks: ${allOutstandingTasks}
`;

    try {
      const { text } = await ai.generate(promptTemplate);

      let json;
      try {
        json = parseJsonFromText(text);
      } catch (err) {
        console.error("Failed to parse AI response:", err, text);
        throw new HttpsError("internal", "Invalid AI response format.");
      }

      if (!json.statusUpdate) {
        console.error("AI response missing statusUpdate field:", json);
        throw new HttpsError("internal", "AI response missing status update.");
      }

      return json;
    } catch (error) {
      console.error("Error generating status update:", error);
      throw new HttpsError("internal", "Failed to generate status update.");
    }
  }
);

export const generateLearningStrategy = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (req) => {
    const {
      projectBrief,
      businessGoal,
      audienceProfile,
      projectConstraints,
      keyContacts = [],
      sourceMaterial = "",
      clarifyingQuestions = [],
      clarifyingAnswers = [],
      personaCount = 3,
    } = req.data || {};

    if (!projectBrief) {
      throw new HttpsError("invalid-argument", "A project brief is required.");
    }

    const key = process.env.GOOGLE_GENAI_API_KEY;
    if (!key) throw new HttpsError("internal", "No API key available.");

    const ai = genkit({
      plugins: [googleAI({ apiKey: key })],
      model: gemini("gemini-1.5-pro"),
    });

    const personaInstruction = personaCount
      ? ` and create ${personaCount} learner persona${
          personaCount > 1 ? "s" : ""
        }`
      : "";
    const returnStructure = personaCount
      ? `{
  "modalityRecommendation": "brief recommendation",
  "rationale": "why this modality fits",
  "nuances": "project-specific nuances",
  "blendedModalities": ["modality 1", "modality 2"],
  "alternatives": [
    {"modality": "Alternative 1", "rationale": "why it fits", "nuances": "project nuances"},
    {"modality": "Alternative 2", "rationale": "why it fits", "nuances": "project nuances"}
  ],
  "learnerPersonas": [{"name":"Name","motivation":"text","challenges":"text"}]
}`
      : `{
  "modalityRecommendation": "brief recommendation",
  "rationale": "why this modality fits",
  "nuances": "project-specific nuances",
  "blendedModalities": ["modality 1", "modality 2"],
  "alternatives": [
    {"modality": "Alternative 1", "rationale": "why it fits", "nuances": "project nuances"},
    {"modality": "Alternative 2", "rationale": "why it fits", "nuances": "project nuances"}
  ]
}`;

    const clarificationsBlock = (() => {
      const pairs = clarifyingQuestions.map(
        (q, i) => `Q: ${q?.question || q}\nA: ${clarifyingAnswers[i] || ""}`
      );
      return pairs.length ? `\nClarifications:\n${pairs.join("\n")}` : "";
    })();

    const prompt =
      `You are a Senior Instructional Designer. Using the provided information, recommend the most effective training modality${personaInstruction}. ` +
      `Also provide exactly two alternative modalities. For the recommended modality and each alternative, include a rationale and project-specific nuances to consider. If the recommendation is blended learning, also return a "blendedModalities" array listing the specific delivery modalities that make up the blend. ` +
      `Return a JSON object with the structure:${returnStructure} ` +
      `Do not include code fences or extra formatting.\n\n` +
      `Project Brief: ${projectBrief}\n` +
      `Business Goal: ${businessGoal}\n` +
      `Audience Profile: ${audienceProfile}\n` +
      `Project Constraints: ${projectConstraints}\n` +
      `Key Contacts: ${keyContacts
        .map((c) => `${c.name} (${c.role})`)
        .join("; " )}\n` +
      `Source Material: ${sourceMaterial}` +
      clarificationsBlock;

    const { text } = await ai.generate(prompt);

    let strategy;
    try {
      strategy = parseJsonFromText(text);
    } catch (err) {
      console.error("Failed to parse AI response:", err, text);
      throw new HttpsError("internal", "Invalid AI response format.");
    }
    if (
      !strategy.modalityRecommendation ||
      !strategy.rationale ||
      !strategy.nuances ||
      !Array.isArray(strategy.alternatives)
    ) {
      console.error("AI response missing expected fields:", strategy);
      throw new HttpsError(
        "internal",
        "AI response missing learning strategy fields."
      );
    }

    if (!Array.isArray(strategy.blendedModalities)) {
      strategy.blendedModalities = [];
    }

    return strategy;
  }
);

export const generateContentAssets = onCall(
  {
    region: "us-central1",
    secrets: ["GOOGLE_GENAI_API_KEY"],
    timeoutSeconds: 300,
    cors: ["https://thoughtify.training"],
  },
  async (req) => {
    const { ldd, component, components, jobId } = req.data || {};
    if (!ldd) {
      throw new HttpsError(
        "invalid-argument",
        "A Learning Design Document is required."
      );
    }

    const key = process.env.GOOGLE_GENAI_API_KEY;
    if (!key) throw new HttpsError("internal", "No API key available.");

    const ai = genkit({
      plugins: [googleAI({ apiKey: key })],
      model: gemini("gemini-2.5-pro"),
    });

    const ALL_COMPONENTS = [
      "lessonContent",
      "videoScripts",
      "facilitatorGuides",
      "participantWorkbooks",
      "knowledgeBaseArticles",
    ];

    let targets = [];
    if (Array.isArray(components) && components.length > 0) {
      targets = components;
    } else if (typeof component === "string") {
      targets = [component];
    } else {
      targets = ALL_COMPONENTS;
    }

    const drafts = {};
    let mediaAssets = [];

    for (const comp of targets) {
      if (jobId) {
        await db
          .collection("contentAssetJobs")
          .doc(jobId)
          .set({ current: comp }, { merge: true });
      }

      const prompt =
        `You are acting as a subject matter expert and content developer. Given the Learning Design Document below, produce draft ${comp} materials and any associated media asset descriptions.\n\n` +
        `LDD:\n${JSON.stringify(ldd, null, 2)}\n\n` +
        `Respond ONLY with valid JSON matching this structure:\n{\n  "${comp}": [],\n  "mediaAssets": []\n}\n` +
        `Each ${comp} entry should be suitable as draft content. Each mediaAssets entry should include a type, description, and usage notes. Do not include any explanatory text outside the JSON.`;

      const { text } = await ai.generate(prompt);

      let result;
      try {
        result = parseJsonFromText(text);
      } catch (err) {
        console.error("Failed to parse AI response:", err, text);
        throw new HttpsError("internal", "Invalid AI response format.");
      }

      drafts[comp] = result[comp] || [];
      if (Array.isArray(result.mediaAssets)) {
        mediaAssets = mediaAssets.concat(result.mediaAssets);
      }

      if (jobId) {
        await db
          .collection("contentAssetJobs")
          .doc(jobId)
          .set(
            {
              current: null,
              completed: admin.firestore.FieldValue.arrayUnion(comp),
            },
            { merge: true }
          );
      }
    }

    if (jobId) {
      await db
        .collection("contentAssetJobs")
        .doc(jobId)
        .set(
          { status: "complete", results: { drafts, mediaAssets } },
          { merge: true }
        );
    }

    return { drafts, mediaAssets };
  }
);

export const generateLearnerPersona = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (req) => {
    const {
      projectBrief,
      businessGoal,
      audienceProfile,
      projectConstraints,
      keyContacts = [],
      sourceMaterial = "",
      existingMotivationKeywords = [],
      existingChallengeKeywords = [],
      existingLearningPreferenceKeywords = [],
      refreshField,
      personaType,
      existingTypes = [],
      selectedTraits = [],
    } = req.data || {};

    if (!projectBrief) {
      throw new HttpsError("invalid-argument", "A project brief is required.");
    }

    const key = process.env.GOOGLE_GENAI_API_KEY;
    if (!key) throw new HttpsError("internal", "No API key available.");

    const ai = genkit({
      plugins: [googleAI({ apiKey: key })],
      model: gemini("gemini-1.5-pro"),
    });

    const contactsInfo = keyContacts.length
      ? `\nKey Contacts: ${keyContacts
          .map((c) => `${c.name} (${c.role})`)
          .join("; ")}`
      : "";
    const baseInfo = `Project Brief: ${projectBrief}\nBusiness Goal: ${businessGoal}\nAudience Profile: ${audienceProfile}\nProject Constraints: ${projectConstraints}\nSource Material: ${sourceMaterial}${contactsInfo}`;

    const randomSeed = Math.random().toString(36).substring(2, 8);
    const typeInfo = personaType
      ? { type: personaType, role: null, careerStage: null }
      : generateUniquePersonaType(existingTypes);
    const finalType = typeInfo.type;
    const defaultRole = typeInfo.role;
    const defaultStage = typeInfo.careerStage;
    const ageRange = AGE_RANGES[crypto.randomInt(0, AGE_RANGES.length)];
    const ageRangeOptions = getRandomItems(
      AGE_RANGES.filter((a) => a !== ageRange),
      2
    );

    // Refresh field options only
    const refreshableFields = [
      "motivation",
      "challenges",
      "educationLevel",
      "techProficiency",
      "learningPreferences",
    ];
    if (refreshField && refreshableFields.includes(refreshField)) {
      let listPrompt;
      if (refreshField === "motivation" || refreshField === "challenges") {
        listPrompt = `You are a Senior Instructional Designer. Based on the project information below, list three fresh learner ${
          refreshField
        } options in JSON with an array called "options". Each option must have a short, specific "keyword" (1-3 words) that captures the theme — do not use generic terms like "general" or "other" — and a "text" field written as a full sentence about the learner without using their name or pronouns. Vary the sentence openings and do not begin with "The learner." Avoid the following ${
          refreshField
        } keywords: ${
          refreshField === "motivation"
            ? existingMotivationKeywords.join(", ") || "none"
            : existingChallengeKeywords.join(", ") || "none"
        }.

${baseInfo}`;
      } else if (refreshField === "learningPreferences") {
        const personaInstruction = "";
        listPrompt = `You are a Senior Instructional Designer.${personaInstruction} Based on the project information below, list three fresh learner learning preference options in JSON with an array called "options". Each option must have a short, specific "keyword" (1-3 words) describing a distinct modality or strategy and a "text" field that is a full sentence about the learner without using their name or pronouns. Vary the sentence openings and do not begin with "The learner." Avoid the following learning preference keywords: ${existingLearningPreferenceKeywords.join(", ") || "none"}.

${baseInfo}`;
      } else {
        const fieldDescriptions = {
          educationLevel: "education level",
          techProficiency: "tech proficiency level",
        };
        const optionLists = {
          educationLevel: EDUCATION_LEVELS,
          techProficiency: TECH_LEVELS,
        };
        const list = optionLists[refreshField] || [];
        const listText = list.join(", ");
        listPrompt = `You are a Senior Instructional Designer. Based on the project information below, list three fresh learner ${
          fieldDescriptions[refreshField]
        } options in JSON with an array called "options". Each option must be a concise phrase selected from [${listText}].

${baseInfo}`;
      }

      const { text } = await ai.generate(listPrompt);

      let data;
      try {
        data = parseJsonFromText(text);
      } catch (err) {
        console.error("Failed to parse AI response:", err, text);
        throw new HttpsError("internal", "Invalid AI response format.");
      }

      if (refreshField === "motivation") {
        return { motivationOptions: data.options || [] };
      }
      if (refreshField === "challenges") {
        return { challengeOptions: data.options || [] };
      }
      const key = `${refreshField}Options`;
      return { [key]: data.options || [] };
    }

      const nameInstruction = ``;
      const educationList = EDUCATION_LEVELS.join(", ");
      const techList = TECH_LEVELS.join(", ");
      const textPrompt = `You are a Senior Instructional Designer. ${nameInstruction} The persona is in the ${ageRange} age group. Using the provided information, create one learner persona. Provide:
  - "educationLevel": select one option from [${educationList}] and "educationLevelOptions" with two other distinct options from this list.
  - "techProficiency": select one option from [${techList}] and "techProficiencyOptions" with two other distinct options from this list.
   - "learningPreferences": {"keyword": "short concept", "text": "full sentence about the learner without using their name or pronouns"} describing the learner's preferred learning style and "learningPreferencesOptions" with two alternative objects following the same keyword/text structure. Each keyword must capture a distinct modality or strategy (e.g., "hands-on practice", "visual storytelling"). Vary sentence openings and do not begin with "The learner." 
  - For both the primary motivation and the primary challenge:
    - Provide a short, specific keyword (1-3 words) that summarizes the item. Avoid generic labels such as "general" or "other".
    - Provide a full-sentence description in a "text" field about the learner without using their name or pronouns. Vary the sentence openings and do not begin with "The learner." 
    - Also supply exactly two alternative options for motivation and two for challenges, each following the same keyword/text structure with unique keywords. Ensure each option's "text" also avoids pronouns and does not begin with "The learner." 
  Return a JSON object exactly like this, no code fences, and vary the persona each time using this seed: ${randomSeed}

  {
    "type": "Persona Type",
    "educationLevel": "High school diploma",
    "educationLevelOptions": ["No College", "Bachelor's degree"],
    "techProficiency": "Intermediate",
    "techProficiencyOptions": ["Beginner", "Advanced"],
    "learningPreferences": {"keyword": "concept", "text": "Full sentence about FirstName"},
    "learningPreferencesOptions": [
      {"keyword": "concept", "text": "Full sentence about FirstName"},
      {"keyword": "concept", "text": "Full sentence about FirstName"}
    ],
    "motivation": {"keyword": "short", "text": "Full sentence about the learner"},
    "motivationOptions": [{"keyword": "short", "text": "Full sentence about the learner"}, {"keyword": "short", "text": "Full sentence about the learner"}],
    "challenges": {"keyword": "short", "text": "Full sentence about the learner"},
    "challengeOptions": [{"keyword": "short", "text": "Full sentence about the learner"}, {"keyword": "short", "text": "Full sentence about the learner"}]
  }

  Avoid motivation keywords: ${existingMotivationKeywords.join(", ") || "none"}.
  Avoid challenge keywords: ${existingChallengeKeywords.join(", ") || "none"}.
  Avoid learning preference keywords: ${
    existingLearningPreferenceKeywords.join(", ") || "none"
  }.

${baseInfo}`;

    const { text } = await ai.generate(textPrompt);

    let persona;
    try {
      persona = parseJsonFromText(text);
    } catch (err) {
      console.error("Failed to parse AI response:", err, text);
      throw new HttpsError("internal", "Invalid AI response format.");
    }
      persona.type = finalType;
      if (selectedTraits.includes("role")) {
        persona.role = persona.role || defaultRole || getRandomItem(ROLES);
      }
      if (selectedTraits.includes("careerStage")) {
        persona.careerStage =
          persona.careerStage || defaultStage || getRandomItem(CAREER_STAGES);
      }
      if (selectedTraits.includes("department")) {
        persona.department = persona.department || getRandomItem(DEPARTMENTS);
      }
      if (selectedTraits.includes("tenure")) {
        persona.tenure = persona.tenure || getRandomItem(TENURE_OPTIONS);
      }
      if (selectedTraits.includes("region")) {
        persona.region = persona.region || getRandomItem(REGIONS);
      }
      if (selectedTraits.includes("workSetting")) {
        persona.workSetting =
          persona.workSetting || getRandomItem(WORK_SETTINGS);
      }
      if (selectedTraits.includes("shift")) {
        persona.shift = persona.shift || getRandomItem(SHIFT_WINDOWS);
      }
      if (selectedTraits.includes("languages")) {
        persona.languages = persona.languages || getRandomItems(LANGUAGES, 2);
      }
      if (selectedTraits.includes("devices")) {
        persona.devices = persona.devices || getRandomItems(DEVICES, 2);
      }
      if (selectedTraits.includes("bandwidth")) {
        persona.bandwidth = persona.bandwidth || getRandomItem(BANDWIDTH_LEVELS);
      }
      if (selectedTraits.includes("baselineKnowledge")) {
        persona.baselineKnowledge =
          persona.baselineKnowledge || getRandomItem(KNOWLEDGE_LEVELS);
      }
      if (selectedTraits.includes("assessmentComfort")) {
        persona.assessmentComfort =
          persona.assessmentComfort || getRandomItem(ASSESSMENT_COMFORTS);
      }
      if (selectedTraits.includes("supportLevel")) {
        persona.supportLevel =
          persona.supportLevel || getRandomItem(SUPPORT_LEVELS);
      }
      if (selectedTraits.includes("accessibility")) {
        persona.accessibility =
          persona.accessibility || getRandomItems(ACCESSIBILITY_NEEDS, 2);
      }
      persona.ageRange = ageRange;
      persona.ageRangeOptions = ageRangeOptions;
      if (!EDUCATION_LEVELS.includes(persona.educationLevel)) {
        persona.educationLevel = getRandomItems(EDUCATION_LEVELS, 1)[0];
      }
      persona.educationLevelOptions = getRandomItems(
        EDUCATION_LEVELS.filter((e) => e !== persona.educationLevel),
        2
      );
      if (!TECH_LEVELS.includes(persona.techProficiency)) {
        persona.techProficiency = getRandomItems(TECH_LEVELS, 1)[0];
      }
      persona.techProficiencyOptions = getRandomItems(
        TECH_LEVELS.filter((t) => t !== persona.techProficiency),
        2
      );
      if (
        !persona.learningPreferences ||
        typeof persona.learningPreferences !== "object"
      ) {
        persona.learningPreferences = {
          keyword: "",
          text:
            typeof persona.learningPreferences === "string"
              ? persona.learningPreferences
              : "",
        };
      }
      if (!Array.isArray(persona.learningPreferencesOptions)) {
        persona.learningPreferencesOptions = [];
      }
      persona.learningPreferencesOptions = persona.learningPreferencesOptions.map(
        (o) =>
          typeof o === "string" ? { keyword: "", text: o } : { keyword: o.keyword || "", text: o.text || "" }
      );
      return persona;
    }
  );


// Renamed internal constant to avoid any accidental duplicate declarations
// when the file is imported by the emulator or bundler. We still export the
// function under the public name `generateLearningObjectives` for callers.
const generateLearningObjectivesCF = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (req) => {
    const {
      projectBrief,
      businessGoal,
      audienceProfile,
      projectConstraints,
      selectedModality,
      blendModalities = [],
      sourceMaterial = "",
      keyContacts = [],
      approach = "ABCD",
      bloomLevel,
      category,
      refresh,
    } = req.data || {};

    if (!projectBrief) {
      throw new HttpsError("invalid-argument", "A project brief is required.");
    }

    try {
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) throw new HttpsError("internal", "No API key available.");

      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini("gemini-1.5-pro"),
      });

      const blendedInfo =
        Array.isArray(blendModalities) && blendModalities.length
          ? `\nBlended Modalities: ${blendModalities.join(", ")}`
          : "";
      const contactsInfo = keyContacts.length
        ? `\nKey Contacts: ${keyContacts
            .map((c) => `${c.name} (${c.role})`)
            .join("; ")}`
        : "";
      const baseInfo = `Project Brief: ${projectBrief}\nBusiness Goal: ${businessGoal}\nAudience Profile: ${audienceProfile}\nProject Constraints: ${projectConstraints}\nSelected Learning Approach: ${selectedModality}${blendedInfo}\nSource Material: ${sourceMaterial}${contactsInfo}`;

      if (refresh) {
        const { type, index, existing = [] } = refresh;
        const existingList = existing.map((o) => `- ${o}`).join("\n");
        let prompt;
        switch (approach) {
          case "Bloom": {
            const level = bloomLevel || "Remember";
            prompt = `You are a Senior Instructional Designer. Using the information below, generate three new unique ${type} objectives for the learning initiative using Bloom's Taxonomy at the cognitive level "${level}". None of the objectives may match the following:\n${existingList}\nReturn JSON with this structure:\n{\n  "options": ["", "", ""]\n}\n\n${baseInfo}`;
            break;
          }
          case "Mager": {
            prompt = `You are a Senior Instructional Designer. Using the information below, generate three new unique ${type} objectives following Mager's performance-based format (Performance, Condition, Criterion). Avoid these objectives:\n${existingList}\nReturn JSON with this structure:\n{\n  "options": ["", "", ""]\n}\n\n${baseInfo}`;
            break;
          }
          case "SMART": {
            prompt = `You are a Senior Instructional Designer. Using the information below, generate three new unique ${type} objectives adhering to the SMART framework (Specific, Measurable, Achievable, Relevant, Time-bound). Avoid these objectives:\n${existingList}\nReturn JSON with this structure:\n{\n  "options": ["", "", ""]\n}\n\n${baseInfo}`;
            break;
          }
          case "Gagne": {
            const cat = category || "";
            prompt = `You are a Senior Instructional Designer. Using the information below, generate three new unique ${type} objectives for the ${cat} category from Gagné's Five Categories of Learning Outcomes. Avoid these objectives:\n${existingList}\nReturn JSON with this structure:\n{\n  "options": ["", "", ""]\n}\n\n${baseInfo}`;
            break;
          }
          case "ABCD":
          default: {
            prompt = `You are a Senior Instructional Designer. Using the information below, generate three new unique ${type} objectives using the ABCD model (Audience, Behavior, Condition, Degree). Avoid these objectives:\n${existingList}\nReturn JSON with this structure:\n{\n  "options": ["", "", ""]\n}\n\n${baseInfo}`;
          }
        }
        const flow = ai.defineFlow("learningObjectivesRefreshFlow", async () => {
          const { text } = await ai.generate(prompt);
          return text;
        });
        const text = await flow();
        const { options } = parseJsonFromText(text);
        return { refreshType: type, refreshIndex: index, options };
      }

      let prompt;
      switch (approach) {
        case "Bloom": {
          const level = bloomLevel || "Remember";
          prompt = `You are a Senior Instructional Designer. Using the information below, generate one terminal objective and three enabling objectives for the learning initiative. Use verbs appropriate for Bloom's Taxonomy cognitive level "${level}". Provide three unique variations for each objective and ensure all objectives are distinct. Return JSON with this structure:\n{\n  "terminalObjective": ["", "", ""],\n  "enablingObjectives": [\n    ["", "", ""],\n    ["", "", ""],\n    ["", "", ""]\n  ]\n}\n\n${baseInfo}`;
          break;
        }
        case "Mager": {
          prompt = `You are a Senior Instructional Designer. Using the information below, generate one terminal objective and three enabling objectives following Mager's performance-based format (Performance, Condition, Criterion). Provide three unique variations for each objective and ensure all objectives are distinct. Return JSON with this structure:\n{\n  "terminalObjective": ["", "", ""],\n  "enablingObjectives": [\n    ["", "", ""],\n    ["", "", ""],\n    ["", "", ""]\n  ]\n}\n\n${baseInfo}`;
          break;
        }
        case "SMART": {
          prompt = `You are a Senior Instructional Designer. Using the information below, generate one terminal objective and three enabling objectives that adhere to the SMART framework (Specific, Measurable, Achievable, Relevant, Time-bound). Provide three unique variations for each objective and ensure all objectives are distinct. Return JSON with this structure:\n{\n  "terminalObjective": ["", "", ""],\n  "enablingObjectives": [\n    ["", "", ""],\n    ["", "", ""],\n    ["", "", ""]\n  ]\n}\n\n${baseInfo}`;
          break;
        }
        case "Gagne": {
          prompt = `You are a Senior Instructional Designer. Using the information below, determine the most appropriate category from Gagné's Five Categories of Learning Outcomes (Verbal Information, Intellectual Skills, Cognitive Strategies, Attitudes, Motor Skills). Then generate one terminal objective and three enabling objectives suited to that category. Provide three unique variations for each objective and ensure all objectives are distinct. Return JSON with this structure:\n{\n  "category": "",\n  "terminalObjective": ["", "", ""],\n  "enablingObjectives": [\n    ["", "", ""],\n    ["", "", ""],\n    ["", "", ""]\n  ]\n}\n\n${baseInfo}`;
          break;
        }
        case "ABCD":
        default: {
          prompt = `You are a Senior Instructional Designer. Using the information below, generate one terminal objective and three enabling objectives using the ABCD model (Audience, Behavior, Condition, Degree). Provide three unique variations for each objective and ensure all objectives are distinct. Return JSON with this structure:\n{\n  "terminalObjective": ["", "", ""],\n  "enablingObjectives": [\n    ["", "", ""],\n    ["", "", ""],\n    ["", "", ""]\n  ]\n}\n\n${baseInfo}`;
        }
      }

      const flow = ai.defineFlow("learningObjectivesFlow", async () => {
        const { text } = await ai.generate(prompt);
        return text;
      });
      const text = await flow();
      const objectives = parseJsonFromText(text);
      return { approach, bloomLevel, ...objectives };
    } catch (error) {
      console.error("Error generating learning objectives:", error);
      throw new HttpsError("internal", "Failed to generate learning objectives.");
    }
  }
);
// Maintain the original exported name expected by the client
export { generateLearningObjectivesCF as generateLearningObjectives };

export const generateHierarchicalOutline = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (req) => {
    const {
      projectBrief,
      businessGoal,
      audienceProfile,
      projectConstraints,
      selectedModality,
      blendModalities = [],
      learningObjectives,
      sourceMaterial = "",
      keyContacts = [],
    } = req.data || {};

    if (!projectBrief || !learningObjectives) {
      throw new HttpsError(
        "invalid-argument",
        "Required information is missing."
      );
    }

    try {
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) throw new HttpsError("internal", "No API key available.");

      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini("gemini-1.5-pro"),
      });

      const lines = [];
      if (learningObjectives?.terminalObjective?.text) {
        lines.push(
          `Terminal Objective: ${learningObjectives.terminalObjective.text}`
        );
      }
      (learningObjectives?.enablingObjectives || []).forEach((o, i) => {
        if (o?.text) {
          lines.push(`Enabling Objective ${i + 1}: ${o.text}`);
        }
      });

      const blendedInfo =
        Array.isArray(blendModalities) && blendModalities.length
          ? `\nBlended Modalities: ${blendModalities.join(", ")}`
          : "";
      const contactsInfo = keyContacts.length
        ? `\nKey Contacts: ${keyContacts
            .map((c) => `${c.name} (${c.role})`)
            .join("; ")}`
        : "";
      const baseInfo = `Project Brief: ${projectBrief}\nBusiness Goal: ${businessGoal}\nAudience Profile: ${audienceProfile}\nProject Constraints: ${projectConstraints}\nSelected Learning Approach: ${selectedModality}${blendedInfo}\nSource Material: ${sourceMaterial}${contactsInfo}\nLearning Objectives:\n${lines.join("\n")}`;

      const prompt = `You are a Senior Instructional Designer. Using the information below, create a detailed, hierarchical course outline that ensures all learning objectives are fully covered. Each top-level section must include at least one sub-topic (e.g., 1.1) so that every heading has children. Return the outline as JSON where each entry is an object with "number" and "text" fields (e.g., [{"number":"1","text":"Intro"},{"number":"1.1","text":"Topic"}]).\n\n${baseInfo}`;

      const flow = ai.defineFlow("hierarchicalOutlineFlow", async () => {
        const { text } = await ai.generate(prompt);
        return text;
      });

      const raw = await flow();
      const parsed = parseJsonFromText(raw);
      return { outline: Array.isArray(parsed) ? parsed : parsed?.outline || [] };
    } catch (error) {
      console.error("Error generating hierarchical outline:", error);
      throw new HttpsError(
        "internal",
        "Failed to generate hierarchical outline."
      );
    }
  }
);

export const generateLearningDesignDocument = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (req) => {
    const {
      projectBrief,
      businessGoal,
      audienceProfile,
      projectConstraints,
      selectedModality,
      blendModalities = [],
      learningObjectives,
      courseOutline,
      trainingPlan,
      sourceMaterial = "",
      keyContacts = [],
    } = req.data || {};

    if (!projectBrief) {
      throw new HttpsError(
        "invalid-argument",
        "Required information is missing."
      );
    }

    try {
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) throw new HttpsError("internal", "No API key available.");

      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini("gemini-1.5-pro"),
      });

      const lines = [];
      if (learningObjectives?.terminalObjective?.text) {
        lines.push(
          `Terminal Objective: ${learningObjectives.terminalObjective.text}`
        );
      }
      (learningObjectives?.enablingObjectives || []).forEach((o, i) => {
        if (o?.text) {
          lines.push(`Enabling Objective ${i + 1}: ${o.text}`);
        }
      });

      const blendedInfo =
        Array.isArray(blendModalities) && blendModalities.length
          ? `\nBlended Modalities: ${blendModalities.join(", ")}`
          : "";
      const outlineInfo = courseOutline ? `\nCourse Outline:\n${courseOutline}` : "";
      const objectivesInfo = lines.length
        ? `\nLearning Objectives:\n${lines.join("\n")}`
        : "";
      const planInfo = trainingPlan ? `\nTraining Plan:\n${trainingPlan}` : "";
      const contactsInfo = keyContacts.length
        ? `\nKey Contacts: ${keyContacts
            .map((c) => `${c.name} (${c.role})`)
            .join("; ")}`
        : "";
      const baseInfo = `Project Brief: ${projectBrief}\nBusiness Goal: ${businessGoal}\nAudience Profile: ${audienceProfile}\nProject Constraints: ${projectConstraints}\nSelected Learning Approach: ${selectedModality}${blendedInfo}\nSource Material: ${sourceMaterial}${contactsInfo}${planInfo}${outlineInfo}${objectivesInfo}`;

      const prompt = `You are a Senior Instructional Designer. Using the information below, create a comprehensive Learning Design Document that serves as the single source of truth for the project. Include the following sections: 1. Front Matter & Executive Summary (Project Title, Project Overview, Key Stakeholders) 2. Audience Analysis (Learner Demographics, Prior Knowledge & Skills, Learner Motivation, Technical Environment, Learner Personas) 3. Business Goals & Learning Objectives (Business Goal, Terminal Learning Objective, Enabling Learning Objectives) 4. Instructional Strategy (Delivery Modality, Instructional Approach, Tone & Style, Interaction Strategy) 5. Curriculum Blueprint (Hierarchical Outline, Objective Mapping, Content Summary, Estimated Seat Time) 6. Assessment & Evaluation Strategy (Formative Assessment, Summative Assessment, Evaluation Plan for Kirkpatrick Levels 1-4, xAPI Strategy if applicable). Present the document in clear markdown with headings and subheadings.\n\n${baseInfo}`;

      const flow = ai.defineFlow("learningDesignDocumentFlow", async () => {
        const { text } = await ai.generate(prompt);
        return text;
      });

      const document = await flow();
      return { document };
    } catch (error) {
      console.error("Error generating learning design document:", error);
      throw new HttpsError(
        "internal",
        "Failed to generate learning design document."
      );
    }
  }
);

export const generateStoryboard = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (request) => {
    console.log("Incoming request data:", request.data);
    console.log("Incoming auth:", request.auth);

    const payload = request.data;
    const topic = payload?.topic;
    const targetAudience = payload?.targetAudience || "undergraduate students";

    if (!topic) {
      throw new HttpsError("invalid-argument", "A topic must be provided.");
    }

    try {
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) throw new HttpsError("internal", "No API key available.");

      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini("gemini-1.5-pro"),
      });

      const promptTemplate = `Create a detailed and engaging e-learning storyboard on the topic: "${topic}".

The target audience is ${targetAudience}.  The storyboard should be composed of multiple frames, each including:

* **Frame Title:** A concise title for the frame.
* **Visuals:**  Suggestions for images, graphics, or diagrams that illustrate the concept. Be specific (e.g., "a photo of a plant cell" not just "an image").
* **Text:** Clear and accessible text that explains the concept in depth.  Keep the text concise and focused.
* **Audio Cues:** Recommendations for audio elements (e.g., "Narration explaining the process," "Upbeat background music," "Sound effect of a cash register").
* **Annotations/Interactive Elements:**  Notes for additional explanations, interactive questions (multiple-choice, true/false, open-ended), or prompts for learner reflection ("Consider how this applies to your own life...").

The storyboard should cover all critical aspects of the topic, starting with an engaging introduction, progressing through the core content with detailed explanations, and concluding with a reflective summary and actionable steps. Include interactive elements that encourage learner engagement and personalization of the content.  Ensure the storyboard guides learners through the topic in a logical, engaging, and educational manner.
`;

      const flow = ai.defineFlow("storyboardFlow", async () => {
        const { text } = await ai.generate(promptTemplate);
        return text;
      });

      const storyboard = await flow();
      return { storyboard };
    } catch (error) {
      console.error("Error generating storyboard:", error);
      throw new HttpsError("internal", "Failed to generate storyboard.");
    }
  }
);

// ------------------------------
// EMAIL FUNCTIONS (unchanged API)
// ------------------------------
export const sendEmailBlast = functions.https.onCall(async (data, context) => {
  const payload = data.data ? data.data : data;
  console.log("sendEmailBlast called, context.auth:", context.auth);
  console.log("Payload received:", payload);

  let authInfo = context.auth;
  if (!authInfo && payload.__token) {
    try {
      authInfo = await admin.auth().verifyIdToken(payload.__token);
      console.log("Verified __token successfully. authInfo:", authInfo);
    } catch (error) {
      console.error("Error verifying __token:", error);
    }
  }
  if (!authInfo) {
    console.error("Unauthorized attempt to send email blast. authInfo is", authInfo);
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to send an email blast."
    );
  }
  console.log("sendEmailBlast: Authenticated call. authInfo.uid:", authInfo.uid);
  const { subject, message } = payload;
  console.log("sendEmailBlast: Received subject:", subject, "and message:", message);
  try {
    const emailListSnapshot = await db.collection("emailList").get();
    const emailList = emailListSnapshot.docs.map((doc) => doc.data().email);
    if (emailList.length === 0) {
      return { success: false, error: "No subscribers found." };
    }
    console.log(`Sending email blast to ${emailList.length} subscribers`);
    const mailOptions = {
      from: "jonny@thoughtify.training",
      bcc: emailList,
      subject: subject,
      text: message,
    };
    await transporter.sendMail(mailOptions);
    console.log("Email blast sent successfully!");
    return { success: true, message: "Email blast sent successfully!" };
  } catch (error) {
    console.error("Error sending email blast:", error);
    return { success: false, error: error.message };
  }
});

export const sendEmailReply = functions.https.onCall(async (callData) => {
  const payload = callData.data ? callData.data : callData;
  console.log("Full callData:", callData);
  console.log("Using payload:", payload);
  const recipientEmail = payload.recipientEmail ? payload.recipientEmail.toString().trim() : "";
  const subject = payload.subject || "";
  const message = payload.message || "";
  console.log("sendEmailReply data received:", { recipientEmail, subject, message });
  if (!recipientEmail) {
    return { success: false, error: "No recipient email provided." };
  }
  const mailOptions = {
    from: '"Jonny" <jonny@thoughtify.training>',
    to: [recipientEmail],
    subject: subject,
    text: message,
  };
  console.log("Mail options to be sent:", mailOptions);
  try {
    await transporter.sendMail(mailOptions);
    console.log("Email sent successfully to:", recipientEmail);
    return { success: true, message: "Email sent successfully!" };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error: error.message };
  }
});

export const generateInitialInquiryMap = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (request) => {
    const { projectId, brief } = request.data || {};
    if (!projectId || !brief) {
      throw new HttpsError(
        "invalid-argument",
        "projectId and project brief are required."
      );
    }

    const key = process.env.GOOGLE_GENAI_API_KEY;
    if (!key) {
      throw new HttpsError("internal", "No API key available.");
    }

    const ai = genkit({
      plugins: [googleAI({ apiKey: key })],
      model: gemini("gemini-1.5-pro"),
    });

    const flow = ai.defineFlow("initialInquiryMapFlow", async () => {
      const prompt = `Given the project brief below, generate 3 initial hypotheses as a JSON array. Each item must contain: title, parentHypothesisId (null), confidenceScore (0-1), status, links (empty array).\nProject brief: ${brief}`;
      const { text } = await ai.generate(prompt);
      return parseJsonFromText(text);
    });

    let hypotheses;
    try {
      hypotheses = await flow();
      if (!Array.isArray(hypotheses)) {
        throw new Error("AI did not return an array");
      }
    } catch (error) {
      console.error("AI generation failed:", error);
      throw new HttpsError("internal", "Failed to generate hypotheses");
    }

    const collections = getInquiryMapCollections(projectId);
    const batch = db.batch();
    hypotheses.forEach((h) => {
      const docRef = collections.hypotheses.doc();
      batch.set(docRef, buildInquiryNode(h));
    });
    await batch.commit();

    return { count: hypotheses.length };
  }
);

// ---------------------------------------
// AVATAR GENERATOR (CALLABLE, OPTION A)
// ---------------------------------------
export const generateAvatar = onCall(
  {
    region: "us-central1",
    invoker: "public",
    timeoutSeconds: 60,
    maxInstances: 2,
    // NOTE: no "secrets" needed anymore
  },
  async (request) => {
    const {
      name,
      motivation = "",
      challenges = "",
      ageRange = "",
      techProficiency = "",
      educationLevel = "",
      learningPreferences = "",
      seedExtra = "",
    } = request.data || {};
    if (!name) throw new HttpsError("invalid-argument", "name is required");

    // deterministic seed + cache key
    const seed = `${name}|${motivation}|${challenges}|${ageRange}|${techProficiency}|${educationLevel}|${learningPreferences}|${seedExtra}`;
    const hash = crypto.createHash("md5").update(seed).digest("hex");

    const bucket = admin.storage().bucket(BUCKET_NAME);
    const file = bucket.file(`avatars/${hash}.svg`);

    // 1) Serve from cache if present
    const [exists] = await file.exists();
    if (exists) {
      const [buf] = await file.download();
      const svgCached = buf.toString("utf8");
      return { avatar: `data:image/svg+xml;utf8,${encodeURIComponent(svgCached)}` };
    }

    // 2) Generate new SVG with DiceBear (notionists)
    const ageColors = {
      "18-24": "#E9F0FF",
      "25-34": "#F9EAFF",
      "35-44": "#FFF3D6",
      "45-54": "#E8FFF3",
      "55+": "#FDEEEF",
    };
    const backgroundColor = ageColors[ageRange] ? [ageColors[ageRange]] : ["#E9F0FF", "#F9EAFF", "#FFF3D6", "#E8FFF3", "#FDEEEF"];
    const svg = createAvatar(notionists, {
      seed,
      radius: 50, // rounded avatar
      backgroundColor,
      // backgroundType: "gradientLinear", // uncomment for gradient backgrounds
    }).toString();

    // 3) Save to Storage + return
    await file.save(Buffer.from(svg), {
      contentType: "image/svg+xml",
      metadata: { cacheControl: "public, max-age=31536000" },
    });

    return { avatar: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
  }
);


export const savePersona = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }
  const { initiativeId, personaId, persona } = request.data || {};
  if (!initiativeId || !personaId || !persona) {
    throw new HttpsError(
      "invalid-argument",
      "Missing initiativeId, personaId, or persona data"
    );
  }
  if (!persona.type) {
    throw new HttpsError("invalid-argument", "Persona must include a type");
  }
  const initiativeRef = db
    .collection("users")
    .doc(uid)
    .collection("initiatives")
    .doc(initiativeId);
  await initiativeRef.set(
    { updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  await initiativeRef
    .collection("personas")
    .doc(personaId)
    .set(persona, { merge: true });
  return { id: personaId };
});

export { getEmailAuthUrl, emailOAuthCallback, sendQuestionEmail } from "./emailProviders.js";
