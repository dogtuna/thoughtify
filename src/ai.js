// src/ai.js
import { genkit } from 'genkit';
import { gemini, googleAI } from '@genkit-ai/googleai';
/** @typedef {import('./ai.types').ContentAssetGenerationResult} ContentAssetGenerationResult */

// The googleAI plugin should automatically pick up your API key from your environment.
// (Ensure your .env file contains REACT_APP_GOOGLE_GENAI_API_KEY if using Create React App.)
const ai = genkit({
  plugins: [googleAI()],
  model: gemini('gemini-2.5-pro'), // set the default model
});

// Define a flow for generating a course outline.
// This flow takes a course topic as input and returns a course outline.
export const courseOutlineFlow = ai.defineFlow('courseOutlineFlow', async (topic) => {
  // Construct a prompt that includes your guidelines.
  const prompt = `Generate a professional, multi-module course outline for a course on "${topic}". 
Include the following sections:
  - Course Title
  - Introduction/Overview
  - Target Audience
  - Learning Objectives
  - Module Summaries (each with a module title, key concepts, and recommended resources)
  - Conclusion or Next Steps

Use clear, concise language suitable for a general audience.`;
  
  // Make the generation request.
  const { text } = await ai.generate(prompt);
  return text;
});

// Define a flow for generating detailed draft content and a media asset list from an LDD.
// The flow expects a Learning Design Document (object or string) and returns the drafts
// alongside suggested media assets for each content block.
export const contentAssetGenerationFlow = ai.defineFlow(
  'contentAssetGenerationFlow',
  async (ldd) => {
    const prompt = `You are acting as a subject matter expert and content developer. Given the Learning Design Document below, produce draft materials and a media asset list for each component.\n\nLDD:\n${JSON.stringify(ldd, null, 2)}\n\nRespond ONLY with valid JSON matching this structure:\n{\n  "lessonContent": [],\n  "videoScripts": [],\n  "facilitatorGuides": [],\n  "participantWorkbooks": [],\n  "knowledgeBaseArticles": [],\n  "mediaAssets": []\n}\nEach array should contain entries for the corresponding components. Each mediaAssets entry should include a type, description, and usage notes. Do not include any explanatory text outside the JSON.`;

    const { text } = await ai.generate(prompt);
    /** @type {ContentAssetGenerationResult} */
    const result = JSON.parse(text);
    return result;
  },
);

export default ai;
