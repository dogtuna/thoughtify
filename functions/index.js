/* eslint-disable no-unused-vars */
// functions/index.js
import process from "process";
import functions from "firebase-functions";
import nodemailer from "nodemailer";
import admin from "firebase-admin";
import { gemini, googleAI } from "@genkit-ai/googleai";
import { genkit } from "genkit";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";

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
  const jsonString = fenceMatch ? fenceMatch[1] : text;
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
  const generateRandomCode = () =>
    Math.random().toString(36).substring(2, 10).toUpperCase();

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
  { secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (request) => {
    console.log("Incoming request data:", request.data);
    console.log("Incoming auth:", request.auth);

    // if (!request.auth) {  // Optional: Add authentication if needed
    //   throw new HttpsError(
    //     "unauthenticated",
    //     "You must be logged in to generate a training plan."
    //   );
    // }

    const payload = request.data;
    const prompt = payload.prompt;

    if (!prompt) {
      throw new HttpsError("invalid-argument", "A prompt must be provided.");
    }

    try {
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) {
        throw new HttpsError("internal", "No API key available.");
      }

      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini('gemini-1.5-pro'),
      });

      const trainingPlanFlow = ai.defineFlow(
        "trainingPlanFlow",
        async () => {
          const { text } = await ai.generate(prompt);
          return text;
        }
      );

      const trainingPlan = await trainingPlanFlow();
      return { trainingPlan };
    } catch (error) {
      console.error("Error generating training plan:", error);
      throw new HttpsError("internal", "Failed to generate training plan.");
    }
  }
);

// Create Study Material from topic prompt
export const generateStudyMaterial = onCall(
  { secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (request) => {
    console.log("Incoming request data:", request.data);
    console.log("Incoming auth:", request.auth);

    // if (!request.auth) {
    //   throw new HttpsError(
    //     "unauthenticated",
    //     "You must be logged in to generate study material."
    //   );
    // }

    const payload = request.data;
    const topic = payload.topic;
    if (!topic) {
      throw new HttpsError("invalid-argument", "A topic must be provided.");
    }

    try {
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) {
        throw new HttpsError("internal", "No API key available.");
      }

      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini('gemini-1.5-pro'),
      });

      const promptTemplate = `Create a comprehensive study guide on "${topic}" for high school or college students.  Include the following:

* **Target Audience:** High school or college students (specify which if known).
* **Comprehensive Overview:** A thorough explanation of the topic, covering all key aspects.
* **Key Concepts:**  Essential concepts, theories, and terminology.  Explain each clearly.
* **Examples:** Illustrative examples and practical applications.
* **Review Questions or Practice Problems:** Questions or problems to test understanding and aid in exam preparation.

Prioritize accuracy and avoid fabricating information. If unsure about specific details, it's better to omit them than provide inaccurate information.  Focus on clear explanations and relevant examples.
`;

      const studyMaterialFlow = ai.defineFlow("studyMaterialFlow", async () => {
        const { text } = await ai.generate(promptTemplate);
        return text;
      });

      const studyMaterial = await studyMaterialFlow();
      return { studyMaterial };
    } catch (error) {
      console.error("Error generating study material:", error);
      throw new HttpsError("internal", "Failed to generate study material.");
    }
  }
);

/**
 * Firebase Callable Function: generateCourseOutline
 *
 * Uses a pre-written prompt template to generate a course outline for the provided topic.
 * This function uses Firebase Functions v2 secrets.
 */
export const generateCourseOutline = onCall(
  { secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (request) => {
    console.log("Incoming request data:", request.data);
    console.log("Incoming auth:", request.auth);

    // Enforce that the caller is authenticated.
    // if (!request.auth) {
    //   throw new HttpsError("unauthenticated", "You must be logged in to generate a course outline.");
    // }

    // Unwrap the payload (in v2, request.data contains the client-sent payload).
    const payload = request.data;
    const topic = payload.topic;
    if (!topic) {
      throw new HttpsError("invalid-argument", "A course topic must be provided.");
    }

    try {
      // Retrieve the API key injected as a secret.
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) {
        throw new HttpsError("internal", "No API key available.");
      }

      // Initialize GenKit instance with the Google AI plugin using the secret API key.
      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini('gemini-1.5-pro'),
      });

      // Build the prompt template using the provided topic.
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

      // Define the flow using the prompt template.
      const courseOutlineFlow = ai.defineFlow("courseOutlineFlow", async () => {
        const { text } = await ai.generate(promptTemplate);
        return text;
      });

      // Call the flow (the prompt already includes the topic).
      const outline = await courseOutlineFlow();
      return { outline };
    } catch (error) {
      console.error("Error generating course outline:", error);
      throw new HttpsError("internal", "Failed to generate the course outline.");
    }
  }
);

export const generateAssessment = onCall(
  { secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (request) => {
    console.log("Incoming request data:", request.data);
    console.log("Incoming auth:", request.auth);

    // if (!request.auth) {
    //   throw new HttpsError(
    //     "unauthenticated",
    //     "You must be logged in to generate an assessment."
    //   );
    // }

    const payload = request.data;
    const topic = payload.topic;
    if (!topic) {
      throw new HttpsError("invalid-argument", "A topic must be provided.");
    }

    try {
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) {
        throw new HttpsError("internal", "No API key available.");
      }

      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini('gemini-1.5-pro'),
      });

      const promptTemplate = `Create an assessment and answer key/rubric on the topic of "${topic}".  The assessment should evaluate understanding of the key concepts related to this topic.

**Assessment Format:**  Choose a suitable format for assessing knowledge of this topic (e.g., multiple-choice questions, short answer questions, essay question, coding challenge, project proposal, etc.).  Clearly indicate the chosen format.

**Assessment Questions/Tasks:** Provide the assessment itself. This should include clear instructions and specific questions or tasks.

**Answer Key/Rubric:**  Provide the correct answers or a detailed rubric for grading the assessment.  Ensure the answer key/rubric aligns with the chosen assessment format and effectively evaluates understanding of the topic.
`;

      const assessmentFlow = ai.defineFlow("assessmentFlow", async () => {
        const { text } = await ai.generate(promptTemplate);
        return text; // Return the generated assessment
      });

      const assessment = await assessmentFlow();
      return { assessment };
    } catch (error) {
      console.error("Error generating assessment:", error);
      throw new HttpsError("internal", "Failed to generate assessment.");
    }
  }
);

export const generateLessonContent = onCall(
  { secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (request) => {
    console.log("Incoming request data:", request.data);
    console.log("Incoming auth:", request.auth);

    // if (!request.auth) {
    //   throw new HttpsError(
    //     "unauthenticated",
    //     "You must be logged in to generate lesson content."
    //   );
    // }

    const payload = request.data;
    const topic = payload.topic;
    if (!topic) {
      throw new HttpsError("invalid-argument", "A topic must be provided.");
    }

    try {
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) {
        throw new HttpsError("internal", "No API key available.");
      }

      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini('gemini-1.5-pro'), // Or your preferred model
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


      const lessonContentFlow = ai.defineFlow("lessonContentFlow", async () => {
        const { text } = await ai.generate(promptTemplate);
        return text;
      });

      const lessonContent = await lessonContentFlow();
      return { lessonContent };
    } catch (error) {
      console.error("Error generating lesson content:", error);
      throw new HttpsError("internal", "Failed to generate lesson content.");
    }
  }
);

export const generateProjectBrief = onRequest(
  { cors: true, secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (req, res) => {
    const {
      businessGoal,
      audienceProfile,
      sourceMaterial,
      projectConstraints,
    } = req.body || {};

    if (!businessGoal) {
      res.status(400).json({ error: "A business goal is required." });
      return;
    }

    try {
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) {
        res.status(500).json({ error: "No API key available." });
        return;
      }

      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini("gemini-1.5-pro"),
      });

      const promptTemplate = `You are an expert Performance Consultant and Business Analyst. Using the information provided, create a project brief and list any questions that require clarification before moving forward.\nReturn a valid JSON object with the structure:{\n  "projectBrief": "text of the brief",\n  "clarifyingQuestions": ["question1", "question2"]\n}\nDo not include any code fences or additional formatting.\n\nBusiness Goal: ${businessGoal}\nAudience Profile: ${audienceProfile}\nProject Constraints: ${projectConstraints}\nSource Material: ${sourceMaterial}`;

      const { text } = await ai.generate(promptTemplate);
      let json;
      try {
        json = parseJsonFromText(text);
      } catch (err) {
        console.error("Failed to parse AI response:", err, text);
        res.status(500).json({ error: "Invalid AI response format." });
        return;
      }
      res.status(200).json(json);
    } catch (error) {
      console.error("Error generating project brief:", error);
      res.status(500).json({ error: "Failed to generate project brief." });
    }
  }
);

export const generateLearningStrategy = onRequest(
  { cors: true, secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (req, res) => {
    const {
      projectBrief,
      businessGoal,
      audienceProfile,
      projectConstraints,
    } = req.body || {};

    if (!projectBrief) {
      res.status(400).json({ error: "A project brief is required." });
      return;
    }

    try {
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) {
        res.status(500).json({ error: "No API key available." });
        return;
      }

      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini("gemini-1.5-pro"),
      });

      const promptTemplate = `You are a Senior Instructional Designer. Using the provided information, recommend the most effective training modality and create 2-3 learner personas. Return a JSON object with the structure:{\n  "modalityRecommendation": "brief recommendation",\n  "rationale": "why this modality fits",\n  "learnerPersonas": [{"name": "Name", "motivation": "text", "challenges": "text"}]\n}\nDo not include any code fences or additional formatting.\n\nProject Brief: ${projectBrief}\nBusiness Goal: ${businessGoal}\nAudience Profile: ${audienceProfile}\nProject Constraints: ${projectConstraints}`;

      const { text } = await ai.generate(promptTemplate);
      let strategy;
      try {
        strategy = parseJsonFromText(text);
      } catch (err) {
        console.error("Failed to parse AI response:", err, text);
        res.status(500).json({ error: "Invalid AI response format." });
        return;
      }
      res.status(200).json(strategy);
    } catch (error) {
      console.error("Error generating learning strategy:", error);
      res.status(500).json({ error: "Failed to generate learning strategy." });
    }
  }
);

export const generateStoryboard = onCall(
  { secrets: ["GOOGLE_GENAI_API_KEY"] },
  async (request) => {
    console.log("Incoming request data:", request.data);
    console.log("Incoming auth:", request.auth);

    // if (!request.auth) {
    //   throw new HttpsError(
    //     "unauthenticated",
    //     "You must be logged in to generate a storyboard."
    //   );
    // }

    const payload = request.data;
    const topic = payload.topic;
    const targetAudience = payload.targetAudience || "undergraduate students"; // Default audience


    if (!topic) {
      throw new HttpsError("invalid-argument", "A topic must be provided.");
    }

    try {
      const key = process.env.GOOGLE_GENAI_API_KEY;
      if (!key) {
        throw new HttpsError("internal", "No API key available.");
      }

      const ai = genkit({
        plugins: [googleAI({ apiKey: key })],
        model: gemini('gemini-1.5-pro'),
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

      const storyboardFlow = ai.defineFlow("storyboardFlow", async () => {
        const { text } = await ai.generate(promptTemplate);
        return text;
      });

      const storyboard = await storyboardFlow();
      return { storyboard };
    } catch (error) {
      console.error("Error generating storyboard:", error);
      throw new HttpsError("internal", "Failed to generate storyboard.");
    }
  }
);


/**
 * Firebase Callable Function: sendEmailBlast
 *
 * (Remains largely unchanged.)
 */
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

/**
 * Firebase Callable Function: sendEmailReply
 */
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
