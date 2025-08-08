/* eslint-disable no-unused-vars */
// functions/index.js
import process from "process";
import functions from "firebase-functions";
import nodemailer from "nodemailer";
import admin from "firebase-admin";
import { gemini, googleAI } from "@genkit-ai/googleai";
import { genkit } from "genkit";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import OpenAI from "openai";
import crypto from "crypto";
import { Buffer } from "buffer";

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

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
  // Extract JSON content even if it's wrapped in Markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const raw = fenceMatch ? fenceMatch[1] : text;

  // Locate the first JSON object within the raw text
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in text");
  }

  const jsonString = raw.slice(start, end + 1);
  return JSON.parse(jsonString);
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

export const generateProjectBrief = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"], invoker: "public" },
  async (request) => {
    const {
      businessGoal,
      audienceProfile,
      sourceMaterial,
      projectConstraints,
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

    const promptTemplate = `You are an expert Performance Consultant and Business Analyst. Using the information provided, create a project brief and list any questions that require clarification before moving forward.
Return a valid JSON object with the structure:{
  "projectBrief": "text of the brief",
  "clarifyingQuestions": ["question1", "question2"]
}
Do not include any code fences or additional formatting.

Business Goal: ${businessGoal}
Audience Profile: ${audienceProfile}
Project Constraints: ${projectConstraints}
Source Material: ${sourceMaterial}`;

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

export const generateLearningStrategy = onCall(
  { region: "us-central1", secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (req) => {
    const {
      projectBrief,
      businessGoal,
      audienceProfile,
      projectConstraints,
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
      ? ` and create ${personaCount} learner persona${personaCount > 1 ? "s" : ""}`
      : "";
    const returnStructure = personaCount
      ? `{
  "modalityRecommendation": "brief recommendation",
  "rationale": "why this modality fits",
  "learnerPersonas": [{"name":"Name","motivation":"text","challenges":"text"}]
}`
      : `{
  "modalityRecommendation": "brief recommendation",
  "rationale": "why this modality fits"
}`;

    const clarificationsBlock = (() => {
      const pairs = clarifyingQuestions.map((q, i) => `Q: ${q}\nA: ${clarifyingAnswers[i] || ""}`);
      return pairs.length ? `\nClarifications:\n${pairs.join("\n")}` : "";
    })();

    const prompt =
      `You are a Senior Instructional Designer. Using the provided information, recommend the most effective training modality${personaInstruction}. ` +
      `Return a JSON object with the structure:${returnStructure} ` +
      `Do not include code fences or extra formatting.\n\n` +
      `Project Brief: ${projectBrief}\n` +
      `Business Goal: ${businessGoal}\n` +
      `Audience Profile: ${audienceProfile}\n` +
      `Project Constraints: ${projectConstraints}` +
      clarificationsBlock;

    const { text } = await ai.generate(prompt);

    let strategy;
    try {
      strategy = parseJsonFromText(text);
    } catch (err) {
      console.error("Failed to parse AI response:", err, text);
      throw new HttpsError("internal", "Invalid AI response format.");
    }
    if (!strategy.modalityRecommendation || !strategy.rationale) {
      console.error("AI response missing expected fields:", strategy);
      throw new HttpsError("internal", "AI response missing learning strategy fields.");
    }

    // NOTE: Avatar creation moved to dedicated callable 'generateAvatar'
    // so this function focuses just on the strategy/personas JSON.
    return strategy;
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

    const randomSeed = Math.random().toString(36).substring(2, 8);
    const textPrompt = `You are a Senior Instructional Designer. Using the provided information, create one learner persona with a distinct, randomly chosen name. Return a JSON object exactly like this, no code fences, and vary the persona each time using this seed: ${randomSeed}

{
  "name": "Name",
  "motivation": "text",
  "challenges": "text"
}

Project Brief: ${projectBrief}
Business Goal: ${businessGoal}
Audience Profile: ${audienceProfile}
Project Constraints: ${projectConstraints}`;

    const { text } = await ai.generate(textPrompt);

    let persona;
    try {
      persona = parseJsonFromText(text);
    } catch (err) {
      console.error("Failed to parse AI response:", err, text);
      throw new HttpsError("internal", "Invalid AI response format.");
    }

    // Avatar is generated separately via generateAvatar callable.
    return persona;
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

// ---------------------------------------
// AVATAR GENERATOR (CALLABLE, OPTION A)
// ---------------------------------------
export const generateAvatar = onCall(
  {
    region: "us-central1",
    invoker: "public",               // <- allow client callable without CORS pain
    secrets: ["OPENAI_API_KEY"],
    timeoutSeconds: 120,
    maxInstances: 2,
    concurrency: 1,                  // keep it gentle to avoid rate limits
  },
  async (request) => {
    // If you want to require login, uncomment:
    // if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");

    const { name, motivation = "", challenges = "" } = request.data || {};
    if (!name) throw new HttpsError("invalid-argument", "name is required");

    // Cache result in Cloud Storage (deterministic key)
    const seed = `${name}|${motivation}|${challenges}`;
    const hash = crypto.createHash("md5").update(seed).digest("hex");
    const bucket = admin.storage().bucket();
    const file = bucket.file(`avatars/${hash}.png`);

    try {
      // Return cached image if it exists
  const [exists] = await file.exists();
  if (exists) {
    const [cached] = await file.download();
    return { avatar: `data:image/png;base64,${cached.toString("base64")}` };
  }

      // Generate image with OpenAI
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const prompt =
        `Professional, illustrative, social-media style character portrait. ` +
        `Subject: ${name}. Motivation: ${motivation}. Challenges: ${challenges}. ` +
        `Crisp lines, soft lighting, friendly corporate style, square composition.`;

  const imageResp = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
    // optional, looks nice with UI overlays:
    // background: "transparent",
    // quality: "high",
  });

  const b64 = imageResp?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI image generation returned no data.");

  const buffer = Buffer.from(b64, "base64");
  await file.save(buffer, {
    contentType: "image/png",
    metadata: { cacheControl: "public, max-age=31536000" },
  });

      return { avatar: `data:image/png;base64,${b64}` };
    } catch (error) {
      console.error("Error generating avatar:", error);
      throw new HttpsError("internal", "Failed to generate avatar");
    }
  }
);
