/**
 * Simple question hygiene utilities.
 * - clusterSimilarQuestions: groups questions with cosine similarity.
 * - groupQuestionsByTheme: naive theming based on keywords.
 */

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function termFreq(tokens) {
  const freq = {};
  tokens.forEach((t) => {
    freq[t] = (freq[t] || 0) + 1;
  });
  return freq;
}

function cosineSim(a, b) {
  const freqA = termFreq(tokenize(a));
  const freqB = termFreq(tokenize(b));
  const all = new Set([...Object.keys(freqA), ...Object.keys(freqB)]);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  all.forEach((w) => {
    const va = freqA[w] || 0;
    const vb = freqB[w] || 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  });
  if (!magA || !magB) return 0;
  return dot / Math.sqrt(magA * magB);
}

export function clusterSimilarQuestions(questions, threshold = 0.8) {
  const clusters = [];
  questions.forEach((q) => {
    const found = clusters.find((c) => cosineSim(c[0], q) >= threshold);
    if (found) {
      found.push(q);
    } else {
      clusters.push([q]);
    }
  });
  return clusters;
}

export function groupQuestionsByTheme(questions) {
  const themes = { Process: [], Incentives: [], Tooling: [], External: [] };
  questions.forEach((q) => {
    const t = q.toLowerCase();
    if (/process|workflow|procedure/.test(t)) themes.Process.push(q);
    else if (/incentive|motivation|reward/.test(t)) themes.Incentives.push(q);
    else if (/tool|software|system/.test(t)) themes.Tooling.push(q);
    else themes.External.push(q);
  });
  return themes;
}
