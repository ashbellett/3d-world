// The levels the menu offers. Positions and sizes are [x, y, z] in metres, with y up from the
// ground's surface.

export type Vec3 = [number, number, number];

// A kind of breakable object, placed at any number of positions. The copies share a geometry,
// material and collision shape.
export interface BlockSpec {
    // A box of this size, or the convex hull of these points. A hull's points should be centred
    // on its centre of mass, as the body rotates about its origin.
    shape: { box: Vec3 } | { hull: Vec3[] };
    mass: number;
    colour: number;
    // Contact impulse above which it breaks. Its debris breaks at the same impulse.
    breakImpulse: number;
    positions: Vec3[];
}

export interface LevelSpec {
    name: string;
    blocks: BlockSpec[];
}

// Space left between objects, and under them, so that they start at rest
const gap = 0.01;

// Positions for a grid of cubes, centred on the ground
function stack(count: Vec3, size: number): Vec3[] {
    const spacing = size + gap;
    const positions: Vec3[] = [];
    for (let i = 0; i < count[0]; i++) {
        for (let j = 0; j < count[1]; j++) {
            for (let k = 0; k < count[2]; k++) {
                positions.push([
                    (i - (count[0] - 1) / 2) * spacing,
                    gap + (j + 0.5) * spacing,
                    (k - (count[2] - 1) / 2) * spacing,
                ]);
            }
        }
    }
    return positions;
}

// Masses and impulses for the bridge are the three.js "Convex object breaking" example's, scaled
// to the projectile here
const towerHeight = 10;
const slabCount = 8;

export const levels: LevelSpec[] = [
    {
        name: 'Stack',
        blocks: [
            {
                shape: { box: [2, 2, 2] },
                mass: 2,
                colour: 0x40c4b3,
                breakImpulse: 5,
                positions: stack([4, 4, 4], 2),
            },
        ],
    },
    {
        name: 'Bridge',
        blocks: [
            {
                shape: { box: [4, towerHeight, 4] },
                mass: 300,
                colour: 0xb03014,
                breakImpulse: 150,
                positions: [
                    [-8, towerHeight / 2 + gap, 0],
                    [8, towerHeight / 2 + gap, 0],
                ],
            },
            // Across the towers
            {
                shape: { box: [14, 0.4, 3] },
                mass: 30,
                colour: 0xb3b865,
                breakImpulse: 60,
                positions: [[0, towerHeight + 2 * gap + 0.2, 0]],
            },
        ],
    },
    {
        name: 'Dominoes',
        blocks: [
            // A row of standing slabs
            {
                shape: { box: [2, 4, 0.3] },
                mass: 35,
                colour: 0xb0b0b0,
                breakImpulse: 40,
                positions: Array.from({ length: slabCount }, (_, i): Vec3 => [
                    0,
                    2 + gap,
                    15 * (0.5 - i / (slabCount + 1)),
                ]),
            },
        ],
    },
];
