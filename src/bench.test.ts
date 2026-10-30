import { expect, test } from 'vitest';
import { seededRandom } from './bench.ts';

test('a seed always gives the same numbers', () => {
    const a = seededRandom(1);
    const b = seededRandom(1);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
});

test('different seeds give different numbers', () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
});

test('numbers are in [0, 1)', () => {
    const random = seededRandom(42);
    for (let i = 0; i < 10000; i++) {
        const value = random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
    }
});
