// Utility helpers for mapping hypothesis IDs to human-friendly letters (A, B, C, ...)

/**
 * Returns a map from hypothesis id -> letter label (A, B, C, ... AA, AB, ...).
 * The order is based on the provided array order to keep labels stable within a session.
 */
export function makeHypothesisLetterMap(hypotheses = []) {
  const map = {};
  const toLabel = (index) => {
    // Excel-like base-26 letters: 0->A, 25->Z, 26->AA, 27->AB, ...
    let i = index;
    let label = "";
    while (i >= 0) {
      label = String.fromCharCode(65 + (i % 26)) + label;
      i = Math.floor(i / 26) - 1;
    }
    return label;
  };
  hypotheses.forEach((h, idx) => {
    if (!h || !h.id) return;
    map[h.id] = toLabel(idx);
  });
  return map;
}

export function letterFor(hypotheses = [], id) {
  const map = makeHypothesisLetterMap(hypotheses);
  return map[id] || null;
}

export function makeIdToDisplayIdMap(hypotheses = []) {
  const map = {};
  const fallback = (id) => {
    if (typeof id !== "string") return null;
    // If the id already looks like a human label (A, B, C, ... AA, AB), use it.
    if (/^[A-Za-z]{1,3}$/.test(id)) return id.toUpperCase();
    return null;
  };
  hypotheses.forEach((h) => {
    if (!h || !h.id) return;
    map[h.id] = h.displayId || fallback(h.id);
  });
  return map;
}

export function nextDisplayId(used = new Set()) {
  const toLabel = (index) => {
    let i = index;
    let label = "";
    while (i >= 0) {
      label = String.fromCharCode(65 + (i % 26)) + label;
      i = Math.floor(i / 26) - 1;
    }
    return label;
  };
  let idx = 0;
  while (true) {
    const lab = toLabel(idx);
    if (!used.has(lab)) return lab;
    idx += 1;
  }
}
