import { describe, expect, test } from 'vitest';
import { BoxGeometry, Vector3 } from 'three/webgpu';
import { Batch } from './batch.ts';
import type { BreakJob } from './breaker.ts';
import type { Piece } from './breaker.ts';
import { breakHere, breakObject, geometryOf, simplifiedHull } from './breaker.ts';

function cubeJob(seed = 1): BreakJob {
    const geometry = Batch.prepare(new BoxGeometry(2, 2, 2));
    return {
        positions: Float32Array.from(geometry.getAttribute('position').array),
        normals: Float32Array.from(geometry.getAttribute('normal').array),
        mass: 4,
        point: [0, 0, -1],
        normal: [0, 0, 1],
        seed,
    };
}

describe('breakObject', () => {
    test('cuts an object into pieces that share its mass', () => {
        const pieces = breakObject(cubeJob());
        expect(pieces.length).toBeGreaterThan(1);
        const mass = pieces.reduce((sum, piece) => sum + piece.mass, 0);
        expect(mass).toBeCloseTo(4);
    });

    test('keeps the pieces inside the object', () => {
        for (const piece of breakObject(cubeJob())) {
            const centre = new Vector3(...piece.position);
            for (let i = 0; i < piece.positions.length; i += 3) {
                const corner = new Vector3().fromArray(piece.positions, i).add(centre);
                for (const value of corner.toArray()) {
                    expect(Math.abs(value)).toBeLessThanOrEqual(1 + 1e-5);
                }
            }
        }
    });

    test('gives each piece normals for every position', () => {
        for (const piece of breakObject(cubeJob())) {
            expect(piece.normals.length).toBe(piece.positions.length);
        }
    });

    test('cuts the same way for the same seed', () => {
        const positions = (seed: number) =>
            breakObject(cubeJob(seed)).map((piece) => [...piece.positions]);
        expect(positions(7)).toEqual(positions(7));
        expect(positions(7)).not.toEqual(positions(8));
    });

    test('leaves Math.random as it was', () => {
        const random = Math.random;
        breakObject(cubeJob());
        expect(Math.random).toBe(random);
    });
});

test('breakHere breaks on this thread', async () => {
    expect((await breakHere(cubeJob())).length).toBeGreaterThan(1);
});

test('geometryOf makes a geometry from positions and normals', () => {
    const [piece] = breakObject(cubeJob());
    const geometry = geometryOf(piece);
    expect(geometry.getAttribute('position').array).toBe(piece.positions);
    expect(geometry.getAttribute('normal').array).toBe(piece.normals);
});

describe('simplifiedHull', () => {
    test('merges points closer than mergeDistance', () => {
        const cube = Batch.prepare(new BoxGeometry(2, 2, 2)).getAttribute('position').array;
        // Each corner again, moved by much less than mergeDistance
        const noisy = Float32Array.from([...cube, ...Array.from(cube, (value) => value + 1e-6)]);
        const unique = new Set<string>();
        const hull = simplifiedHull(noisy).getAttribute('position');
        for (let i = 0; i < hull.count; i++) {
            unique.add([hull.getX(i), hull.getY(i), hull.getZ(i)].map((v) => v.toFixed(3)).join());
        }
        expect(unique.size).toBe(8);
    });
});

test('pieces stay simple however many times they break', () => {
    let pieces: Piece[] = breakObject(cubeJob());
    for (let generation = 0; generation < 4; generation++) {
        const most = Math.max(...pieces.map((piece) => piece.positions.length / 3));
        expect(most, `generation ${generation}`).toBeLessThan(300);
        pieces = pieces
            .filter((piece) => piece.breakable)
            .slice(0, 20)
            .flatMap((piece, i) =>
                breakObject({
                    ...piece,
                    point: [0, 0, 0],
                    normal: [Math.sin(i), Math.cos(i), 0.2],
                    seed: i,
                }),
            );
    }
});
