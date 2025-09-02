import { describe, expect, it, vi } from 'vitest';

// Mock firebase module to avoid initialization during tests
vi.mock('../../firebase.js', () => ({ db: {} }));

const { deepMerge, mergeQuestionArrays } = await import('../initiatives.js');

describe('deepMerge', () => {
  it('deletes keys when source has null or undefined', () => {
    const result = deepMerge(
      { a: 1, b: { c: 2 }, d: 4 },
      { b: { c: null }, d: undefined, e: 3 }
    );
    expect(result).toEqual({ a: 1, e: 3 });
    expect('b' in result).toBe(false);
    expect('d' in result).toBe(false);
  });
});

describe('mergeQuestionArrays', () => {
  it('updates one question without clobbering others', () => {
    const existing = [
      { id: 1, text: 'q1', asked: { x: true } },
      { id: 2, text: 'q2' },
    ];
    const updates = [{ id: 1, asked: { x: null } }];
    const result = mergeQuestionArrays(existing, updates);
    expect(result).toHaveLength(2);
    const q1 = result.find((q) => q.id === 1);
    const q2 = result.find((q) => q.id === 2);
    expect(q1.asked).toBeUndefined();
    expect(q2.text).toBe('q2');
    expect(q2.asked).toBeUndefined();
  });

  it('replaces question when _replace is true', () => {
    const existing = [{ id: 1, text: 'old', extra: 'x' }];
    const updates = [{ id: 1, _replace: true, text: 'new' }];
    const result = mergeQuestionArrays(existing, updates);
    expect(result).toEqual([{ id: 1, text: 'new' }]);
  });
});
