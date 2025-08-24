export const DEFAULT_CONFIDENCE_SLOPE = 1.0;

export function logisticConfidence(raw, slope = DEFAULT_CONFIDENCE_SLOPE) {
  return 1 / (1 + Math.exp(-slope * raw));
}
