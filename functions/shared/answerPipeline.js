import { genkit } from "genkit";
import { gemini, googleAI } from "@genkit-ai/googleai";
import { generateTriagePrompt, calculateNewConfidence } from "./inquiryLogic.js";

// Utility: parse JSON with fallback to first JSON object substring
function safeParseJson(text, fallback = {}) {
  try {
    return JSON.parse(text);
  } catch (_) {
    const m = text && String(text).match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch (_) {}
    }
    return fallback;
  }
}

// Filters and normalizes suggestion items
function normalizeSuggestions(raw, { existingTasks = new Set(), existingQuestions = new Set() } = {}) {
  const allowedCategories = ["question", "meeting", "email", "research", "instructional-design"];
  const allowedTaskTypes = ["validate", "refute", "explore"];
  const src = Array.isArray(raw) ? raw : [];
  return src
    .filter((s) =>
      s &&
      typeof s.text === "string" &&
      typeof s.category === "string" &&
      typeof s.who === "string" &&
      allowedCategories.includes(s.category.toLowerCase()) &&
      !existingTasks.has(s.text.toLowerCase()) &&
      !existingQuestions.has(s.text.toLowerCase())
    )
    .map((s) => ({
      text: s.text,
      category: s.category.toLowerCase(),
      who: s.who,
      hypothesisId: typeof s.hypothesisId === "string" && s.hypothesisId.trim() ? s.hypothesisId.trim() : null,
      taskType: allowedTaskTypes.includes((s.taskType || "").toLowerCase()) ? s.taskType.toLowerCase() : "explore",
    }));
}

export async function processAnswer(db, FieldValue, params) {
  const {
    uid,
    initiativeId,
    questionId,
    questionText,
    answerText,
    extraText = "",
    respondent = "",
    subject = "Incoming answer",
    genAiKey,
    messageRef = null, // optional DocumentReference to attach analysis
  } = params;

  if (!uid || !initiativeId || !answerText || !genAiKey) {
    return { analysis: "", suggestions: [] };
  }

  const initSnap = await db
    .collection("users")
    .doc(uid)
    .collection("initiatives")
    .doc(initiativeId)
    .get();
  const init = initSnap.data() || {};

  // Build project context
  const contextPieces = [];
  if (init.projectName) contextPieces.push(`Project Name: ${init.projectName}`);
  if (init.businessGoal) contextPieces.push(`Business Goal: ${init.businessGoal}`);
  if (init.audienceProfile) contextPieces.push(`Audience Profile: ${init.audienceProfile}`);
  if (init.projectConstraints) contextPieces.push(`Project Constraints: ${init.projectConstraints}`);
  const contacts = init.keyContacts || init.contacts || [];
  if (contacts.length) {
    contextPieces.push(`Key Contacts: ${contacts.map((c) => `${c.name}${c.role ? ` (${c.role})` : ""}`).join(", ")}`);
  }
  const questionsArr = init.projectQuestions || [];
  if (questionsArr.length) {
    const qa = questionsArr
      .map((q) => {
        const answers = Array.isArray(q.contactStatus)
          ? q.contactStatus
              .map((cs) => {
                const contact = contacts.find((c) => c.id === cs.contactId);
                const name = contact?.name || cs.contactId;
                const texts = (cs.answers || [])
                  .map((a) => a?.text || "")
                  .filter((s) => String(s).trim())
                  .join("; ");
                return texts ? `${name}: ${texts}` : null;
              })
              .filter(Boolean)
              .join("; ")
          : "";
        return answers ? `${q?.question || q}: ${answers}` : `${q?.question || q}`;
      })
      .join("\n");
    contextPieces.push(`Existing Q&A:\n${qa}`);
  }
  const documents = init.sourceMaterials || [];
  if (Array.isArray(documents) && documents.length) {
    const docs = documents.map((d) => `${d.name}:\n${d.content || ""}`).join("\n");
    contextPieces.push(`Source Materials:\n${docs}`);
  }
  const projectContext = contextPieces.join("\n\n");
  const hypotheses = (init.inquiryMap && init.inquiryMap.hypotheses) || init.hypotheses || [];
  const hypothesisList = hypotheses
    .map((h) => `${h.id}: ${h.statement || h.hypothesis || h.text || h.label || h.id}`)
    .join("\n");

  const dhQuestion = questionText || (questionsArr.find((q) => String(q.id) === String(questionId))?.question) || subject;

  // 1) Analysis and suggestions
  const ai = genkit({ plugins: [googleAI({ apiKey: genAiKey })], model: gemini("gemini-1.5-pro") });
  const analysisPrompt = `You are an expert Instructional Designer and Performance Consultant. You are analyzing ${respondent}'s answer to a specific discovery question. Your goal is to understand what this answer means for the training project and to determine follow-up actions.
\nProject Context:\n${projectContext}
\nExisting Hypotheses:\n${hypothesisList}
\nDiscovery Question:\n${dhQuestion}
\nAnswer from ${respondent}:\n${answerText}
\nAvoid suggesting tasks or questions that already exist in the provided lists.
\nPlease provide a JSON object with two fields:
- "analysis": a concise summary of what this answer reveals about the question in the context of the project.
- "suggestions": An array of objects for follow-up actions. Each object must have these fields:
    1. "text": The follow-up action. Do not include any names in this text.
    2. "category": One of "question", "meeting", "email", "research", or "instructional-design".
    3. "who": The person or group to work with (a known contact name, known stakeholder, or the current user).
    4. "hypothesisId": The ID of the related hypothesis, or null if exploring a new idea.
    5. "taskType": One of "validate", "refute", or "explore".
\nRespond ONLY in this JSON format:
{"analysis": "...", "suggestions": [{"text": "...", "category": "...", "who": "...", "hypothesisId": "A", "taskType": "validate"}, ...]}`;

  const { text: aiText } = await ai.generate(analysisPrompt);
  const parsed = safeParseJson(aiText, {});

  const taskSet = new Set((init.tasks || []).map((t) => (t.message || "").toLowerCase()));
  const questionSet = new Set((questionsArr || []).map((q) => (q.question || String(q)).toLowerCase()));

  const suggestions = normalizeSuggestions(parsed?.suggestions, {
    existingTasks: taskSet,
    existingQuestions: questionSet,
  });
  const analysis = typeof parsed?.analysis === "string" ? parsed.analysis : JSON.stringify(parsed?.analysis || "");

  // Persist suggested tasks (non-question)
  const suggestedTasks = suggestions.filter((s) => s.category !== "question");
  if (suggestedTasks.length) {
    const tasksCol = db
      .collection("users").doc(uid)
      .collection("initiatives").doc(initiativeId)
      .collection("suggestedTasks");
    await Promise.all(
      suggestedTasks.map((s) =>
        tasksCol.add({
          message: s.text,
          subType: s.category,
          who: s.who,
          hypothesisId: s.hypothesisId || null,
          taskType: s.taskType,
          status: "pending",
          createdAt: FieldValue.serverTimestamp(),
          source: { kind: "answer", questionId: String(questionId || ""), respondent },
        })
      )
    );
    await db
      .collection("users").doc(uid)
      .collection("notifications").doc("suggestedTasks")
      .set({ type: "suggestedTasks", count: FieldValue.increment(suggestedTasks.length), createdAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  // Persist suggested questions
  const questionSuggestions = suggestions.filter((s) => s.category === "question");
  if (questionSuggestions.length) {
    const qCol = db
      .collection("users").doc(uid)
      .collection("initiatives").doc(initiativeId)
      .collection("suggestedQuestions");
    await Promise.all(
      questionSuggestions.map((s) =>
        qCol.add({
          question: s.text,
          hypothesisId: s.hypothesisId || null,
          createdAt: FieldValue.serverTimestamp(),
          source: { kind: "answer", questionId: String(questionId || ""), respondent },
        })
      )
    );
    await db
      .collection("users").doc(uid)
      .collection("notifications").doc("suggestedQuestions")
      .set({ type: "suggestedQuestions", count: FieldValue.increment(questionSuggestions.length), createdAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  // Persist analysis and notify
  let messageId = null;
  try {
    if (messageRef) {
      await messageRef.set({ analysis, suggestions }, { merge: true });
      messageId = messageRef.id;
    } else {
      const ref = await db.collection("users").doc(uid).collection("messages").add({
        subject,
        body: answerText,
        extra: extraText,
        questionId: String(questionId || ""),
        initiativeId,
        from: respondent,
        createdAt: FieldValue.serverTimestamp(),
      });
      messageId = ref.id;
      await ref.set({ analysis, suggestions }, { merge: true });
    }
    await db
      .collection("users").doc(uid)
      .collection("notifications")
      .add({
        type: "answerReceived",
        message: "New answer received - Click to view analysis.",
        questionId: questionId ? String(questionId) : undefined,
        initiativeId,
        href: initiativeId && messageId ? `/discovery?initiativeId=${initiativeId}&questionId=${questionId}&messageId=${messageId}&qa=1` : undefined,
        messageId,
        createdAt: FieldValue.serverTimestamp(),
        count: 1,
      });
  } catch (err) {
    console.error("failed to record analysis notification", err);
  }

  // 2) Triage evidence to update hypothesis confidences and suggest new hypotheses
  try {
    const evidenceText = `Question: ${dhQuestion}\nAnswer: ${answerText}${extraText ? `\nAdditional: ${extraText}` : ""}`;
    const triagePrompt = generateTriagePrompt(evidenceText, hypotheses, contacts);
    const { text: triageText } = await ai.generate(triagePrompt);
    const triage = safeParseJson(triageText, {});
    if (triage?.hypothesisLinks?.length) {
      let updatedHypotheses = [...hypotheses];
      let allNewRecommendations = [ ...(triage.strategicRecommendations || []) ];
      let newProjectQuestions = [ ...(triage.projectQuestions || []) ];
      const before = new Map(updatedHypotheses.map((h) => [h.id, h.confidence || 0]));

      triage.hypothesisLinks.forEach((link) => {
        const idx = updatedHypotheses.findIndex((h) => h.id === link.hypothesisId);
        if (idx === -1) return;
        const { updatedHypothesis, extraRecommendations } = calculateNewConfidence(
          updatedHypotheses[idx],
          link,
          evidenceText,
          triage.analysisSummary || "",
          respondent
        );
        updatedHypotheses[idx] = updatedHypothesis;
        allNewRecommendations.push(...extraRecommendations);
      });

      if (triage.newHypothesis?.statement) {
        const suggested = (init.suggestedHypotheses || []).slice();
        suggested.push({
          id: `sh-${Date.now()}`,
          statement: triage.newHypothesis.statement,
          confidence: triage.newHypothesis.confidence ?? 0,
          suggestedAt: FieldValue.serverTimestamp(),
          status: "pending",
        });
        await db
          .collection("users").doc(uid)
          .collection("initiatives").doc(initiativeId)
          .set({ suggestedHypotheses: suggested }, { merge: true });
        await db
          .collection("users").doc(uid)
          .collection("notifications").doc("suggestedHypotheses")
          .set({ type: "suggestedHypotheses", count: FieldValue.increment(1), createdAt: FieldValue.serverTimestamp() }, { merge: true });
      }

      const updatedRecommendations = [ ...(init.inquiryMap?.recommendations || init.recommendations || []), ...allNewRecommendations ];
      const updatedProjectQuestions = [ ...(init.projectQuestions || []), ...newProjectQuestions ];

      await db
        .collection("users").doc(uid)
        .collection("initiatives").doc(initiativeId)
        .set(
          {
            "inquiryMap.hypotheses": updatedHypotheses,
            hypotheses: updatedHypotheses,
            "inquiryMap.recommendations": updatedRecommendations,
            recommendations: updatedRecommendations,
            projectQuestions: updatedProjectQuestions,
          },
          { merge: true }
        );

      for (const h of updatedHypotheses) {
        const was = before.get(h.id) || 0;
        const now = h.confidence || 0;
        if (was < 0.8 && now >= 0.8) {
          await db
            .collection("users").doc(uid)
            .collection("notifications").doc(`hyp-${h.id}`)
            .set({
              type: "hypothesisConfidence",
              message: `${h.statement || h.hypothesis || h.id} confidence now at ${(now * 100).toFixed(0)}%`,
              count: FieldValue.increment(1),
              createdAt: FieldValue.serverTimestamp(),
            }, { merge: true });
        }
      }
    }
  } catch (err) {
    console.error("triage failed", err);
  }

  return { analysis, suggestions };
}

