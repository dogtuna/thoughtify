import { genkit } from "genkit";
import { gemini, googleAI } from "@genkit-ai/googleai";
import { generateTriagePrompt, calculateNewConfidence } from "./inquiryLogic.js";

// Ensure Genkit Inspector is disabled in Cloud Functions
if (!process.env.GENKIT_INSPECTOR_ENABLED) {
  process.env.GENKIT_INSPECTOR_ENABLED = "false";
}

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

  if (!uid || !initiativeId || !answerText) {
    console.error("processAnswer: missing required inputs", { hasUid: !!uid, hasInitiativeId: !!initiativeId, hasAnswer: !!answerText });
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

  // 1) Analysis and suggestions (skip if missing key)
  let analysis = "";
  let suggestions = [];
  if (genAiKey) {
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

    suggestions = normalizeSuggestions(parsed?.suggestions, {
      existingTasks: taskSet,
      existingQuestions: questionSet,
    });
    analysis = typeof parsed?.analysis === "string" ? parsed.analysis : JSON.stringify(parsed?.analysis || "");
  } else {
    console.warn("processAnswer: Missing genAiKey; skipping analysis/suggestions generation");
  }

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
    const notif = {
      type: "answerReceived",
      message: "New answer received - Click to view analysis.",
      initiativeId,
      messageId,
      createdAt: FieldValue.serverTimestamp(),
      count: 1,
    };
    if (questionId) notif.questionId = String(questionId);
    if (initiativeId && messageId) notif.href = `/discovery?initiativeId=${initiativeId}${questionId ? `&questionId=${questionId}` : ""}&messageId=${messageId}&qa=1`;
    await db
      .collection("users").doc(uid)
      .collection("notifications")
      .add(notif);
  } catch (err) {
    console.error("failed to record analysis notification", err);
  }

  // 2) Triage evidence to update hypothesis confidences and suggest new hypotheses
  try {
    if (!genAiKey) throw new Error("No genAiKey for triage");
    const ai = genkit({ plugins: [googleAI({ apiKey: genAiKey })], model: gemini("gemini-1.5-pro") });
    const evidenceText = `Question: ${dhQuestion}\nAnswer: ${answerText}${extraText ? `\nAdditional: ${extraText}` : ""}`;
    const triagePrompt = generateTriagePrompt(evidenceText, hypotheses, contacts);
    const { text: triageText } = await ai.generate(triagePrompt);
    const triage = safeParseJson(triageText, {});
    const linkCount = Array.isArray(triage?.hypothesisLinks) ? triage.hypothesisLinks.length : 0;
    console.log("processAnswer: triage link count:", linkCount);
    if (linkCount) {
      let updatedHypotheses = [...hypotheses];
      let allNewRecommendations = [ ...(triage.strategicRecommendations || []) ];
      let newProjectQuestions = [ ...(triage.projectQuestions || []) ];
      const before = new Map(
        updatedHypotheses.map((h) => [
          String(h.id),
          h.confidence ?? (typeof h.confidenceScore === "number" ? logistic(h.confidenceScore) : 0),
        ])
      );

      const normalize = (s) => String(s || "").trim();
      const simplify = (s) => normalize(s).toLowerCase();
      const resolveIndex = (arr, rawId) => {
        const raw = normalize(rawId);
        if (!raw) return -1;
        // 1) Exact match
        let i = arr.findIndex((h) => normalize(h.id) === raw);
        if (i !== -1) return i;
        // 2) Strip trailing label like "A: ..."
        const token = normalize(raw.split(":")[0]);
        i = arr.findIndex((h) => normalize(h.id) === token);
        if (i !== -1) return i;
        // 3) Case-insensitive comparison
        const rawL = simplify(raw);
        i = arr.findIndex((h) => simplify(h.id) === rawL);
        if (i !== -1) return i;
        const tokenL = simplify(token);
        i = arr.findIndex((h) => simplify(h.id) === tokenL);
        return i;
      };

      // helper for logistic
      function logistic(x) { return 1 / (1 + Math.exp(-x)); }

      triage.hypothesisLinks.forEach((link) => {
        const idx = resolveIndex(updatedHypotheses, link.hypothesisId);
        if (idx === -1) {
          console.warn("processAnswer: could not resolve hypothesisId from triage", link.hypothesisId);
          return;
        }
        const hId = String(updatedHypotheses[idx].id);
        const beforeConf = before.get(hId) || 0;
        const { updatedHypothesis, extraRecommendations } = calculateNewConfidence(
          updatedHypotheses[idx],
          link,
          evidenceText,
          triage.analysisSummary || "",
          respondent
        );
        updatedHypotheses[idx] = updatedHypothesis;
        const afterConf = updatedHypothesis.confidence ?? beforeConf;
        const deltaPct = Math.round((afterConf - beforeConf) * 100);
        console.log("processAnswer: link applied", {
          hypothesisId: hId,
          relationship: link.relationship,
          impact: link.impact,
          sourceAuthority: link.sourceAuthority,
          evidenceType: link.evidenceType,
          directness: link.directness,
          before: beforeConf,
          after: afterConf,
          deltaPct,
        });
        allNewRecommendations.push(...extraRecommendations);
      });

      if (triage.newHypothesis?.statement) {
        const suggested = (init.suggestedHypotheses || []).slice();
        suggested.push({
          id: `sh-${Date.now()}`,
          statement: triage.newHypothesis.statement,
          confidence: triage.newHypothesis.confidence ?? 0,
          suggestedAt: Date.now(),
          status: "pending",
          provenance: {
            evidenceText,
            analysisSummary: triage.analysisSummary || "",
            respondent,
            source: respondent,
          },
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

      // Ensure the nested inquiryMap map is updated atomically, not only via dotted paths
      const newInquiryMap = {
        ...(init.inquiryMap || {}),
        hypotheses: updatedHypotheses,
        hypothesisCount: updatedHypotheses.length,
        recommendations: updatedRecommendations,
      };

      await db
        .collection("users").doc(uid)
        .collection("initiatives").doc(initiativeId)
        .set(
          {
            inquiryMap: newInquiryMap,
            hypotheses: updatedHypotheses, // legacy top-level mirror
            recommendations: updatedRecommendations, // legacy top-level mirror
            projectQuestions: updatedProjectQuestions,
          },
          { merge: true }
        );
      console.log("processAnswer: updated hypotheses count:", updatedHypotheses.length);

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
    console.warn("processAnswer: triage skipped or failed", err?.message || err);
  }

  return { analysis, suggestions, messageId };
}
