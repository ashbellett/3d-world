import { beforeEach, describe, expect, test } from 'vitest';
import { Quaternion, Vector3 } from 'three/webgpu';
import { config } from './config.ts';
import type { BodyHandle, Shape } from './physics.ts';
import { Physics } from './physics.ts';

let physics: Physics;
let nextId = 0;

beforeEach(async () => {
    physics = await Physics.create();
});

function add(
    shape: Shape,
    mass: number,
    position: Vector3,
    velocity = new Vector3(),
    impactThreshold?: number,
): { id: number; body: BodyHandle } {
    const id = nextId++;
    const body = physics.addBody(
        id,
        shape,
        mass,
        position,
        new Quaternion(),
        velocity,
        new Vector3(),
        impactThreshold,
    );
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
    test("doesn't move anything for no time", () => {
        const { body } = add(physics.createSphereShape(0.5), 1, new Vector3(0, 10, 0));
        physics.step(0);
        expect(heightOf(body)).toBe(10);
    });

    test('simulates at most maxSubSteps steps a frame', () => {
        const { body } = add(physics.createSphereShape(0.5), 1, new Vector3(0, 10, 0));
        physics.step(10);
        const { gravity, timestep, maxSubSteps } = config.physics;
        const time = timestep * maxSubSteps;
        // Rapier's integrator falls a little further than the exact distance, a step's worth
        const fallen = 10 - heightOf(body);
        expect(fallen).toBeGreaterThan((gravity * time * time) / 2);
        expect(fallen).toBeLessThan((gravity * time * (time + timestep)) / 2 + 1e-6);
    });
});

describe('impacts', () => {
    function impactsOf(threshold: number): number[] {
        addGround();
        const box = add(
            physics.createBoxShape(1, 1, 1),
            1,
            new Vector3(0, 0.6, 0),
            new Vector3(0, -10, 0),
            threshold,
        );
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
        add(physics.createBoxShape(1, 1, 1), 1, new Vector3(0, 0.6, 0), new Vector3(0, -10, 0));
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

describe('createHullShape', () => {
    test('makes a shape from points around a volume', () => {
        const tetrahedron = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
        expect(physics.createHullShape(tetrahedron)).toBeDefined();
    });

    test('throws for points on a line', () => {
        const line = [0, 0, 0, 1, 0, 0, 2, 0, 0];
        expect(() => physics.createHullShape(line)).toThrow(/convex hull/);
    });
});
