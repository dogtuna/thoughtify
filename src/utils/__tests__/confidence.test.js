import { describe, expect, it } from 'vitest';
import { logisticConfidence } from '../confidence.js';

describe('logisticConfidence', () => {
  it('approaches 1 with repeated large positive inputs', () => {
    let value = 0;
    for (let i = 0; i < 5; i += 1) {
      value = logisticConfidence(value + 10);
    }
    expect(value).toBeLessThan(1);
    expect(value).toBeCloseTo(1, 4);
  });
});
