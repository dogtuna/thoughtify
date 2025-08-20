import { generate } from "../ai";

/**
 * Classify a task message into a recommended communication method tag.
 * Falls back to "email" on error.
 * @param {string} message
 * @returns {Promise<string>} tag
 */
export async function classifyTask(message) {
  const prompt = `You are a smart assistant that decides how to handle tasks.\nChoose exactly one of: email, call, meeting, research.\nTask: ${message}`;
  try {
    const { text } = await generate(prompt);
    const response = text.trim().toLowerCase();
    if (response.includes("meeting")) return "meeting";
    if (response.includes("call")) return "call";
    if (response.includes("chat")) return "call";
    if (response.includes("research")) return "research";
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

export default { classifyTask, isQuestionTask };
