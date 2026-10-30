import { describe, expect, test } from 'vitest';
import type { CullCandidate } from './cull.ts';
import { cullOrder } from './cull.ts';

const candidate = (id: number, rest: Partial<CullCandidate> = {}): CullCandidate => ({
    id,
    offScreen: false,
    resting: false,
    screenSize: 1,
    ...rest,
});

const ids = (candidates: CullCandidate[]) => candidates.map(({ id }) => id);

describe('cullOrder', () => {
    test('puts off-screen before on-screen', () => {
        const order = cullOrder([candidate(1), candidate(2, { offScreen: true })], ['offScreen']);
        expect(ids(order)).toEqual([2, 1]);
    });

    test('puts resting before moving', () => {
        const order = cullOrder([candidate(1), candidate(2, { resting: true })], ['resting']);
        expect(ids(order)).toEqual([2, 1]);
    });

    test('puts smaller on screen before larger', () => {
        const order = cullOrder(
            [candidate(1, { screenSize: 0.3 }), candidate(2, { screenSize: 0.1 })],
            ['small'],
        );
        expect(ids(order)).toEqual([2, 1]);
    });

    test('puts older before newer when the rules leave a tie, or there are none', () => {
        expect(ids(cullOrder([candidate(3), candidate(1), candidate(2)], ['resting']))).toEqual([
            1, 2, 3,
        ]);
        expect(ids(cullOrder([candidate(3), candidate(1)], []))).toEqual([1, 3]);
    });

    test('lets each rule only break ties in the rules before it', () => {
        const candidates = [
            // On screen, at rest and tiny
            candidate(1, { resting: true, screenSize: 0.01 }),
            // Off screen, but moving and large
            candidate(2, { offScreen: true, screenSize: 5 }),
            // On screen and moving, but small
            candidate(3, { screenSize: 0.1 }),
        ];
        expect(ids(cullOrder(candidates, ['offScreen', 'resting', 'small', 'old']))).toEqual([
            2, 1, 3,
        ]);
        expect(ids(cullOrder(candidates, ['small', 'offScreen']))).toEqual([1, 3, 2]);
    });

    test("doesn't reorder the candidates it's given", () => {
        const candidates = [candidate(2), candidate(1)];
        cullOrder(candidates, ['old']);
        expect(ids(candidates)).toEqual([2, 1]);
    });
});
