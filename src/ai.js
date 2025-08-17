// src/ai.js
import aiClient from './aiClient';
import { getGenerativeModel } from 'firebase/ai';

const model = getGenerativeModel(aiClient, { model: 'gemini-1.5-flash' });

/**
 * Simple wrapper around the Firebase AI client that mirrors the
 * previous `ai.generate` interface used by the app.
 * @param {string} prompt
 * @returns {Promise<{text: string}>}
 */
export async function generate(prompt) {
  const result = await model.generateContent(prompt);
  return { text: result.response.text() };
}

export default { generate };
