import { describe, expect, test } from 'vitest';
import type { Vec3 } from './levels.ts';
import { levels } from './levels.ts';

// The axis-aligned box a block's copy fills, as [min, max]
function bounds(size: Vec3, position: Vec3): [Vec3, Vec3] {
    return [
        position.map((value, i) => value - size[i] / 2) as Vec3,
        position.map((value, i) => value + size[i] / 2) as Vec3,
    ];
}

function overlap([minA, maxA]: [Vec3, Vec3], [minB, maxB]: [Vec3, Vec3]): boolean {
    return [0, 1, 2].every((i) => minA[i] < maxB[i] && minB[i] < maxA[i]);
}

test('level names are unique', () => {
    const names = levels.map((level) => level.name);
    expect(new Set(names).size).toBe(names.length);
});

describe.each(levels)('$name', ({ blocks }) => {
    const boxes = blocks.flatMap(({ shape, positions }) =>
        'box' in shape ? positions.map((position) => bounds(shape.box, position)) : [],
    );

    test('has objects', () => {
        expect(blocks.flatMap((block) => block.positions).length).toBeGreaterThan(0);
    });

    test('starts every box above the ground', () => {
        for (const [min] of boxes) expect(min[1]).toBeGreaterThan(0);
    });

    test('starts no boxes overlapping', () => {
        for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
                expect(overlap(boxes[i], boxes[j]), `boxes ${i} and ${j}`).toBe(false);
            }
        }
    });

    test('gives every object a positive mass and break impulse', () => {
        for (const { mass, breakImpulse } of blocks) {
            expect(mass).toBeGreaterThan(0);
            expect(breakImpulse).toBeGreaterThan(0);
        }
    });
});
