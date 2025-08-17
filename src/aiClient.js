// src/aiClient.js
import { getAI, GoogleAIBackend } from 'firebase/ai';
import { app } from './firebase';

// Initialize the Firebase AI client using the Google AI backend.
const aiClient = getAI(app, { backend: new GoogleAIBackend() });

export default aiClient;
