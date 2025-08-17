// src/ai.js
import { getGenerativeModel } from 'firebase/ai';
import { initAIClient } from './aiClient';

let modelPromise;

/**
 * Lazily load the generative model configured via Remote Config.
 * @returns {Promise<import('firebase/ai').GenerativeModel>}
 */
async function getModel() {
  if (!modelPromise) {
    modelPromise = initAIClient().then(({ aiClient, modelName }) =>
      getGenerativeModel(aiClient, { model: modelName }),
    );
  }
  return modelPromise;
}

/**
 * Simple wrapper around the Firebase AI client that mirrors the
 * previous `ai.generate` interface used by the app.
 * @param {string} prompt
 * @returns {Promise<{text: string}>}
 */
export async function generate(prompt) {
  const model = await getModel();
  const result = await model.generateContent(prompt);
  return { text: result.response.text() };
}

export default { generate };

