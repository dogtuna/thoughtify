import { generate } from "../ai";

/**
 * Classify a task message into a recommended communication method tag.
 * Falls back to "email" on error.
 * @param {string} message
 * @returns {Promise<string>} tag
 */
export async function classifyTask(message) {
  const lower = (message || "").toLowerCase();
  const researchKeywords = [
    "research",
    "analysis",
    "analyze",
    "analyse",
    "assess",
    "review",
    "investigate",
    "evaluate",
    "explore",
    "study",
    "examine",
  ];
  if (researchKeywords.some((k) => lower.includes(k))) {
    return "research";
  }

  const designKeywords = [
    "design",
    "develop",
    "create",
    "build",
    "draft",
    "write",
    "outline",
    "storyboard",
    "instructional",
    "content",
  ];
  if (designKeywords.some((k) => lower.includes(k))) {
    return "instructional-design";
  }

  const prompt = `You are a smart assistant that decides how to handle tasks.\nChoose exactly one of: email, call, meeting, research, instructional-design.\nTask: ${message}`;
  try {
    const { text } = await generate(prompt);
    const response = text.trim().toLowerCase();
    if (response.includes("meeting")) return "meeting";
    if (response.includes("call")) return "call";
    if (response.includes("chat")) return "call";
    if (response.includes("research")) return "research";
    if (response.includes("instructional-design") || response.includes("design"))
      return "instructional-design";
    return "email";
  } catch (err) {
    console.error("classifyTask error", err);
    return "email";
  }
}

/**
 * Determine if the message is actually a question that should be tracked
 * separately instead of being a task.
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export async function isQuestionTask(message) {
  const lower = (message || "").toLowerCase().trim();
  if (!lower) return false;
  const questionPrefixes = [
    "ask",
    "who",
    "what",
    "when",
    "where",
    "why",
    "how",
    "should",
  ];
  if (lower.includes("?") || questionPrefixes.some((p) => lower.startsWith(p))) {
    return true;
  }
  const prompt = `Does the following text represent a question that is asking someone for information? Answer yes or no.\nText: ${message}`;
  try {
    const { text } = await generate(prompt);
    return text.trim().toLowerCase().startsWith("yes");
  } catch (err) {
    console.error("isQuestionTask error", err);
    return false;
  }
}

/**
 * Remove duplicate tasks based on their message text.
 * Comparison is case-insensitive and ignores punctuation and extra spaces.
 * Keeps the first occurrence of each unique message.
 * @param {Array<{message: string}>} tasks
 * @returns {Array}
 */
export function dedupeByMessage(tasks) {
  const normalize = (s) =>
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const seen = new Set();
  return tasks.filter((t) => {
    const key = normalize(t.message);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeAssigneeName(name, currentUser) {
  const user = currentUser || "";
  const normalized = (name || "").trim();
  return /instructional\s*designer|performance\s*consultant/i.test(normalized)
    ? user
    : normalized || user;
}

export default {
  classifyTask,
  isQuestionTask,
  dedupeByMessage,
  normalizeAssigneeName,
};
