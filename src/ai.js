// src/ai.js
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = import.meta.env.VITE_GOOGLE_GENAI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Simple wrapper around the Google Generative AI client that mirrors the
 * previous `ai.generate` interface used by the app.
 * @param {string} prompt
 * @returns {Promise<{text: string}>}
 */
export async function generate(prompt) {
  const result = await model.generateContent(prompt);
  return { text: result.response.text() };
}

export default { generate };
