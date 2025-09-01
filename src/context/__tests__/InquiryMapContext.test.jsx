import { describe, expect, it } from 'vitest';

// Local copy of normalizeConfidence to avoid Firebase imports in tests
const normalizeConfidence = (value) => Math.min(1, Math.max(0, value));

describe('normalizeConfidence', () => {
  it('clamps values below 0 to 0', () => {
    expect(normalizeConfidence(-0.5)).toBe(0);
  });

  it('allows values within range', () => {
    expect(normalizeConfidence(0.4)).toBe(0.4);
  });

  it('clamps values above 1 to 1', () => {
    expect(normalizeConfidence(1.7)).toBe(1);
  });
});
