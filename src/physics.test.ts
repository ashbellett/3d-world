import { beforeEach, describe, expect, test } from 'vitest';
import { Quaternion, Vector3 } from 'three/webgpu';
import { config } from './config.ts';
import type { BodyHandle, BodyOptions, Shape } from './physics.ts';
import { Physics, spansVolume } from './physics.ts';

let physics: Physics;
let nextId = 0;

beforeEach(async () => {
    physics = new Physics();
});

function add(
    shape: Shape,
    mass: number,
    position: Vector3,
    { velocity = new Vector3(), ...options }: Partial<BodyOptions> = {},
): { id: number; body: BodyHandle } {
    const id = nextId++;
    const body = physics.addBody(id, shape, {
        mass,
        position,
        quaternion: new Quaternion(),
        velocity,
        angularVelocity: new Vector3(),
        ...options,
    });
    return { id, body };
}

function addGround(): void {
    add(physics.createBoxShape(20, 1, 20), 0, new Vector3(0, -0.5, 0));
}

function heightOf(body: BodyHandle): number {
    const position = new Vector3();
    physics.readTransform(body, position, new Quaternion());
    return position.y;
}

describe('readTransform', () => {
    test('reads a moving body', () => {
        const { body } = add(physics.createSphereShape(0.5), 1, new Vector3(1, 10, 2));
        physics.step(1 / 60);
        const position = new Vector3();
        expect(physics.readTransform(body, position, new Quaternion())).toBe(true);
        expect(position.x).toBeCloseTo(1);
        expect(position.y).toBeLessThan(10);
        expect(position.z).toBeCloseTo(2);
    });

    test("doesn't read a static body", () => {
        const { body } = add(physics.createBoxShape(1, 1, 1), 0, new Vector3(0, 3, 0));
        physics.step(1 / 60);
        const position = new Vector3(9, 9, 9);
        expect(physics.readTransform(body, position, new Quaternion())).toBe(false);
        expect(position).toEqual(new Vector3(9, 9, 9));
    });
});

describe('step', () => {
    const { timestep, maxSubSteps } = config.physics;

    test("doesn't step for no time", () => {
        const { body } = add(physics.createSphereShape(0.5), 1, new Vector3(0, 10, 0));
        physics.step(0);
        expect(physics.steps).toBe(0);
        expect(heightOf(body)).toBe(10);
    });

    test('takes one step a frame at the step rate', () => {
        for (let i = 0; i < 600; i++) physics.step(timestep);
        expect(physics.steps).toBe(600);
    });

    test('waits for a whole step', () => {
        physics.step(timestep / 2);
        expect(physics.steps).toBe(0);
        physics.step(timestep / 2);
        expect(physics.steps).toBe(1);
    });

    test('takes at most maxSubSteps steps a frame, and drops the rest', () => {
        physics.step(10);
        expect(physics.steps).toBe(maxSubSteps);
        physics.step(0);
        expect(physics.steps).toBe(maxSubSteps);
    });

    test('draws a body where it starts', () => {
        const { body } = add(physics.createSphereShape(0.5), 1, new Vector3(1, 10, 2));
        physics.step(timestep / 2);
        const position = new Vector3();
        physics.readTransform(body, position, new Quaternion());
        expect(position).toEqual(new Vector3(1, 10, 2));
    });

    test('draws a moving body between its last two steps', () => {
        const { body } = add(physics.createSphereShape(0.5), 1, new Vector3(), {
            velocity: new Vector3(6, 0, 0),
        });
        physics.world.gravity = { x: 0, y: 0, z: 0 };
        physics.step(timestep * 2.25);
        const exact = new Vector3();
        physics.readPose(body, exact, new Quaternion());
        expect(exact.x).toBeCloseTo(6 * timestep * 2);
        const drawn = new Vector3();
        physics.readTransform(body, drawn, new Quaternion());
        expect(drawn.x).toBeCloseTo(6 * timestep * 1.25);
    });
});

describe('impacts', () => {
    function impactsOf(threshold: number): number[] {
        addGround();
        const box = add(physics.createBoxShape(1, 1, 1), 1, new Vector3(0, 0.6, 0), {
            velocity: new Vector3(0, -10, 0),
            impactThreshold: threshold,
        });
        const impulses: number[] = [];
        for (let i = 0; i < 10; i++) {
            physics.step(1 / 60);
            physics.forEachImpact((id0, id1, impulse, point) => {
                expect([id0, id1]).toContain(box.id);
                // On the ground's surface, under the box
                expect(point.y).toBeCloseTo(0, 1);
                expect(Math.abs(point.x)).toBeLessThanOrEqual(0.5 + 1e-3);
                impulses.push(impulse);
            });
        }
        return impulses;
    }

    test('reports a hit harder than the threshold', () => {
        const impulses = impactsOf(1);
        expect(impulses.length).toBeGreaterThan(0);
        expect(Math.max(...impulses)).toBeGreaterThan(1);
    });

    test("doesn't report a hit softer than the threshold", () => {
        expect(impactsOf(1000)).toEqual([]);
    });

    test("doesn't report bodies without a threshold", () => {
        addGround();
        add(physics.createBoxShape(1, 1, 1), 1, new Vector3(0, 0.6, 0), {
            velocity: new Vector3(0, -10, 0),
        });
        let count = 0;
        for (let i = 0; i < 10; i++) {
            physics.step(1 / 60);
            physics.forEachImpact(() => count++);
        }
        expect(count).toBe(0);
    });
});

test('removing a body wakes the bodies resting on it', () => {
    addGround();
    const bottom = add(physics.createBoxShape(1, 1, 1), 1, new Vector3(0, 0.5, 0));
    const top = add(physics.createBoxShape(1, 1, 1), 1, new Vector3(0, 1.5, 0));
    for (let i = 0; i < 600 && !top.body.body.isSleeping(); i++) physics.step(1 / 60);
    expect(top.body.body.isSleeping()).toBe(true);
    physics.removeBody(bottom.body);
    expect(top.body.body.isSleeping()).toBe(false);
});

describe('spansVolume', () => {
    const tetrahedron = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];

    test('accepts points around a volume', () => {
        expect(spansVolume(tetrahedron, 0.001)).toBe(true);
    });

    test('accepts a volume whatever order its points come in', () => {
        const cube = [0, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].flatMap((z) => [x, y, z])));
        expect(spansVolume(cube, 0.001)).toBe(true);
        expect(spansVolume([...cube].reverse(), 0.001)).toBe(true);
    });

    test('refuses fewer than four points', () => {
        expect(spansVolume([0, 0, 0, 1, 0, 0, 0, 1, 0], 0.001)).toBe(false);
    });

    test('refuses points at one place', () => {
        expect(spansVolume([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 0.001)).toBe(false);
    });

    test('refuses points on a line', () => {
        expect(spansVolume([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3], 0.001)).toBe(false);
    });

    test('refuses points on a plane, at any angle', () => {
        // The plane x + y + z = 1
        expect(spansVolume([1, 0, 0, 0, 1, 0, 0, 0, 1, 0.5, 0.5, 0], 0.001)).toBe(false);
    });

    test('refuses a volume thinner than the minimum', () => {
        const sliver = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0.0005];
        expect(spansVolume(sliver, 0.001)).toBe(false);
        expect(spansVolume(sliver, 0.0001)).toBe(true);
    });
});

describe('createHullShape', () => {
    test('makes a shape from points around a volume', () => {
        expect(physics.createHullShape([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])).toBeDefined();
    });

    test('throws for flat points', () => {
        const square = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
        expect(() => physics.createHullShape(square)).toThrow(/too flat/);
    });
});

describe('a projectile hitting a thin slab', () => {
    // Starting at many distances, so it reaches the slab at every point in a step
    async function misses(projectile: Partial<BodyOptions>, slab: Partial<BodyOptions> = {}) {
        const { speed, radius, mass } = config.projectile;
        const missed: number[] = [];
        for (let i = 0; i < 20; i++) {
            physics = new Physics();
            const target = add(physics.createBoxShape(2, 4, 0.3), 35, new Vector3(), slab);
            const distance = 5 + (i * speed) / 60 / 20;
            add(physics.createSphereShape(radius), mass, new Vector3(0, 0, -distance), {
                velocity: new Vector3(0, 0, speed),
                ...projectile,
            });
            for (let step = 0; step < 30; step++) physics.step(1 / 60);
            const velocity = new Vector3();
            physics.readVelocity(target.body, velocity, new Vector3());
            if (velocity.z < 0.1) missed.push(distance);
        }
        return missed;
    }

    test('hits it when continuous', async () => {
        expect(await misses({ continuous: true })).toEqual([]);
    });

    test('can pass through it otherwise', async () => {
        expect((await misses({})).length).toBeGreaterThan(0);
    });

    // A Rapier bug this works around: if it's fixed, the slab and debris can be continuous too
    test('can pass through it when both are continuous', async () => {
        expect((await misses({ continuous: true }, { continuous: true })).length).toBeGreaterThan(
            0,
        );
    });
});
