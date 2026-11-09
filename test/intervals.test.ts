import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeIntervals, type Interval } from '../src/intervals';

// Read the spec in src/intervals/mergeIntervals.ts, then check your progress
// with `npm run mutants:intervals`.
//
// Label every property with its pattern, on the line above its `it(`:
//   // Pattern: invariant. The output is sorted.
// (invariant, algebraic, metamorphic, differential, or conditional)

const endpoint = fc.integer({ min: -50, max: 50 });
const interval: fc.Arbitrary<Interval> = endpoint.chain(start =>
  fc.integer({ min: start, max: 50 }).map(end => [start, end]),
);
const intervalList = fc.array(interval, { maxLength: 20 });

const separatedIntervals = fc
  .array(fc.nat(10), { minLength: 2, maxLength: 12 })
  .map(lengths => {
    let start = -50;
    return lengths.map(length => {
      const current: Interval = [start, start + length];
      start = current[1] + 1;
      return current;
    });
  });

const separatedPair = fc
  .tuple(fc.integer({ min: -50, max: 30 }), fc.nat(10), fc.nat(10), fc.nat(10))
  .map(([start, firstLength, gap, secondLength]) => {
    const first: Interval = [start, start + firstLength];
    const secondStart = first[1] + gap + 1;
    const second: Interval = [secondStart, secondStart + secondLength];
    return [first, second] as const;
  });

const touchingPair = fc.integer({ min: -50, max: 48 }).map(start => [
  [start, start + 1],
  [start + 1, start + 2],
] as Interval[]);

function covers(intervals: readonly Interval[], point: number): boolean {
  return intervals.some(([start, end]) => start <= point && point <= end);
}

function coverageProbePoints(...lists: readonly (readonly Interval[])[]): number[] {
  const endpoints = [
    ...new Set(lists.flatMap(xs => xs.flatMap(([start, end]) => [start, end]))),
  ].sort((a, b) => a - b);
  const midpoints = endpoints
    .slice(0, -1)
    .map((point, index) => (point + endpoints[index + 1]) / 2);
  return [...endpoints, ...midpoints];
}

describe('mergeIntervals', () => {
  // Pattern: invariant. The output is sorted and strictly separated.
  it('returns sorted, strictly separated intervals', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        expect(out.every(([start, end]) => Number.isInteger(start) && Number.isInteger(end) && start <= end)).toBe(true);
        for (let i = 1; i < out.length; i++) {
          expect(out[i - 1][0]).toBeLessThan(out[i][0]);
          expect(out[i - 1][1]).toBeLessThan(out[i][0]);
        }
      }),
    );
  });

  // Pattern: invariant. Merging must not change the supplied array or intervals.
  it('does not modify input intervals while merging', () => {
    fc.assert(
      fc.property(touchingPair, xs => {
        const before = xs.map(([start, end]) => [start, end] as Interval);
        const references = [...xs];
        mergeIntervals(xs);
        expect(xs).toEqual(before);
        expect(xs.every((interval, index) => interval === references[index])).toBe(true);
      }),
    );
  });

  // Pattern: differential. Input and output cover the same real-number points.
  it('preserves coverage at endpoints and between them', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (const point of coverageProbePoints(xs, out)) {
          expect(covers(out, point)).toBe(covers(xs, point));
        }
      }),
    );
  });

  // Pattern: metamorphic. Reordering the same intervals does not change the result.
  it('is unaffected by reversing input order', () => {
    fc.assert(
      fc.property(separatedPair, ([first, second]) => {
        expect(mergeIntervals([second, first])).toEqual(mergeIntervals([first, second]));
      }),
    );
  });

  // Pattern: algebraic. Merging an already-merged result is idempotent.
  it('is idempotent', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const once = mergeIntervals(xs);
        expect(mergeIntervals(once)).toEqual(once);
      }),
    );
  });

  // Pattern: conditional. Already-separated intervals should remain unchanged.
  it('leaves sorted intervals with real-number gaps unchanged', () => {
    fc.assert(
      fc.property(separatedIntervals, xs => {
        expect(mergeIntervals(xs)).toEqual(xs);
      }),
    );
  });
});
