// src/aiClient.js
import { getAI, GoogleAIBackend, VertexAIBackend } from 'firebase/ai';
import { getRemoteConfig, fetchAndActivate, getValue } from 'firebase/remote-config';
import { app } from './firebase';

// Default Remote Config values for offline or first-run scenarios
const DEFAULTS = {
  aiProvider: 'google',
  modelName: 'gemini-1.5-flash',
};

// Set up Remote Config
const remoteConfig = getRemoteConfig(app);
remoteConfig.settings = { minimumFetchIntervalMillis: 3600000 };
remoteConfig.defaultConfig = DEFAULTS;

let aiProvider = DEFAULTS.aiProvider;
let modelName = DEFAULTS.modelName;

try {
  await fetchAndActivate(remoteConfig);
  aiProvider = getValue(remoteConfig, 'aiProvider').asString() || DEFAULTS.aiProvider;
  modelName = getValue(remoteConfig, 'modelName').asString() || DEFAULTS.modelName;
} catch (err) {
  // If fetching remote config fails (offline/first run), fall back to defaults
  console.warn('Remote Config fetch failed, using defaults', err);
}

// Choose backend based on provider
const backend =
  aiProvider.toLowerCase() === 'vertex' || aiProvider.toLowerCase() === 'vertex-ai'
    ? new VertexAIBackend()
    : new GoogleAIBackend();

// Initialize the Firebase AI client using the selected backend
const aiClient = getAI(app, { backend });

// Export both the AI client and model name for consumers
export { modelName };
export default aiClient;
