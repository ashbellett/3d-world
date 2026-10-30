import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
    BoxGeometry,
    Color,
    Matrix4,
    MeshBasicMaterial,
    PerspectiveCamera,
    Quaternion,
    Vector3,
} from 'three/webgpu';
import { Batch } from './batch.ts';
import { config } from './config.ts';
import { Physics } from './physics.ts';
import type { ObjectSpec } from './world.ts';
import { World } from './world.ts';

let world: World;
let physics: Physics;
let batch: Batch;

beforeEach(() => {
    physics = new Physics();
    batch = new Batch(new MeshBasicMaterial(), { instances: 16, vertices: 1024 });
    world = new World(batch, physics);
});

function add(y: number, spec: Partial<ObjectSpec> = {}) {
    return world.add(
        {
            geometry: Batch.prepare(new BoxGeometry()),
            colour: new Color(0xff0000),
            mass: 1,
            position: new Vector3(0, y, 0),
            ...spec,
        },
        physics.createBoxShape(1, 1, 1),
    );
}

describe('add', () => {
    test('gives objects increasing ids', () => {
        const first = add(10);
        const second = add(20);
        expect(second.id).toBeGreaterThan(first.id);
        expect(world.has(first)).toBe(true);
        expect(world.get(second.id)).toBe(second);
    });

    test('draws the object in its colour where it starts', () => {
        const object = add(10, { colour: new Color(0x00ff00) });
        expect(batch.mesh.instanceCount).toBe(1);
        expect(batch.mesh.getColorAt(object.instance, new Color()).getHex()).toBe(0x00ff00);
    });

    test("doesn't change the position it's given", () => {
        const position = new Vector3(0, 10, 0);
        const object = add(0, { position });
        physics.step(1);
        world.sync();
        expect(position).toEqual(new Vector3(0, 10, 0));
        expect(object.position.y).toBeLessThan(10);
    });

    test('makes objects without a break impulse unbreakable', () => {
        expect(add(0).breakImpulse).toBe(Infinity);
        expect(add(0, { breakImpulse: 5 }).breakImpulse).toBe(5);
    });

    test('shares a geometry it is given the id of', () => {
        const geometry = Batch.prepare(new BoxGeometry());
        const geometryId = batch.addGeometry(geometry);
        const a = add(0, { geometry, geometryId });
        const b = add(2, { geometry, geometryId });
        expect(a.geometryId).toBe(geometryId);
        expect(b.geometryId).toBe(geometryId);
        expect(a.sharedGeometry).toBe(true);
    });
});

test('sync moves objects to their bodies', () => {
    const object = add(10);
    physics.step(1);
    expect(world.sync()).toBe(true);
    expect(object.position.y).toBeLessThan(10);
});

test('sync queues objects that fell off the world', () => {
    const object = add(config.world.minY - 1);
    physics.step(1);
    world.sync();
    expect(world.flush()).toBe(true);
    expect(world.has(object)).toBe(false);
});

describe('cull and fade', () => {
    const { maxObjects } = config.world;
    // Looking down -z from z = 10, so objects at the origin are on screen
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.updateMatrixWorld();

    beforeEach(() => {
        config.world.maxObjects = 3;
        // No gravity, so objects stay where they're put
        physics.world.gravity = { x: 0, y: 0, z: 0 };
    });
    afterEach(() => {
        config.world.maxObjects = maxObjects;
    });

    const addAt = (x: number, z: number, spec: Partial<ObjectSpec> = { transient: true }) =>
        add(0, { position: new Vector3(x, 0, z), ...spec });

    test('starts shrinking objects beyond the limit, then removes them', () => {
        const objects = [0, 1, 2, 3].map((x) => addAt(x, 0));
        world.cull(camera);
        expect(world.flush()).toBe(false);
        const fading = objects.filter((object) => world.isFading(object));
        expect(fading).toHaveLength(1);
        const [object] = fading;

        expect(world.fade(config.world.fadeTime / 2)).toBe(true);
        const scale = new Vector3();
        batch.mesh
            .getMatrixAt(object.instance, new Matrix4())
            .decompose(new Vector3(), new Quaternion(), scale);
        expect(scale.x).toBeCloseTo(0.5);
        world.flush();
        expect(world.has(object)).toBe(true);

        world.fade(config.world.fadeTime / 2);
        world.flush();
        expect(world.has(object)).toBe(false);
        expect(world.fade(0)).toBe(false);
    });

    test("doesn't count shrinking objects again", () => {
        [0, 1, 2, 3].map((x) => addAt(x, 0));
        world.cull(camera);
        world.cull(camera);
        expect(world.fading.size).toBe(1);
    });

    test("never removes objects that aren't projectiles or debris", () => {
        const fixed = [0, 1, 2, 3].map((x) => addAt(x, 0, {}));
        const transient = addAt(4, 0);
        world.cull(camera);
        expect(world.fading.size).toBe(1);
        expect(world.isFading(transient)).toBe(true);
        for (const object of fixed) expect(world.isFading(object)).toBe(false);
    });

    test('removes off-screen objects first', () => {
        const objects = [addAt(0, 0), addAt(1, 0), addAt(2, 0)];
        // Behind the camera
        const behind = addAt(0, 20);
        world.cull(camera);
        expect(world.isFading(behind)).toBe(true);
        for (const object of objects) expect(world.isFading(object)).toBe(false);
    });

    test('removes resting objects before moving ones', () => {
        const objects = [addAt(0, 0), addAt(1, 0), addAt(2, 0)];
        const resting = addAt(3, 0);
        for (const object of objects) object.body.body.setLinvel({ x: 0, y: 0, z: 0.001 }, true);
        resting.body.body.sleep();
        world.cull(camera);
        expect(world.isFading(resting)).toBe(true);
    });

    test('removes objects that look smaller first', () => {
        const near = [addAt(0, 0), addAt(1, 0), addAt(2, 0)];
        // The same size, but further from the camera
        const far = addAt(0, -30);
        world.cull(camera);
        expect(world.isFading(far)).toBe(true);
        for (const object of near) expect(world.isFading(object)).toBe(false);
    });

    test('clear removes shrinking objects too', () => {
        [0, 1, 2, 3].map((x) => addAt(x, 0));
        world.cull(camera);
        world.clear();
        expect(world.fading.size).toBe(0);
    });
});

describe('flush', () => {
    test('removes the instances and their own geometries', () => {
        const { geometryId } = add(0);
        add(2);
        world.clear();
        expect(world.objects.size).toBe(0);
        expect(batch.mesh.instanceCount).toBe(0);
        expect(() => batch.mesh.getGeometryRangeAt(geometryId)).toThrow(/deleted/);
    });

    test('keeps shared geometries', () => {
        const geometry = Batch.prepare(new BoxGeometry());
        const geometryId = batch.addGeometry(geometry);
        add(0, { geometry, geometryId });
        world.clear();
        expect(batch.mesh.getGeometryRangeAt(geometryId)!.vertexCount).toBe(36);
    });

    test('returns false when nothing was queued', () => {
        expect(world.flush()).toBe(false);
    });
});

describe('when the batch is full', () => {
    beforeEach(() => {
        batch = new Batch(new MeshBasicMaterial(), { instances: 3, vertices: 1024 });
        world = new World(batch, physics);
    });

    test('removes the object that has shrunk furthest to make room', () => {
        const [a, b, c] = [0, 2, 4].map((y) => add(y, { transient: true }));
        world.fading.set(a, 0.1);
        world.fading.set(b, 0.3);
        const d = add(6, { transient: true });
        expect(world.has(b)).toBe(false);
        for (const object of [a, c, d]) expect(world.has(object)).toBe(true);
        expect(world.fading.has(b)).toBe(false);
    });

    test('removes the oldest projectile or debris if none is shrinking', () => {
        const fixed = add(0);
        const [older, newer] = [2, 4].map((y) => add(y, { transient: true }));
        add(6, { transient: true });
        expect(world.has(older)).toBe(false);
        expect(world.has(fixed)).toBe(true);
        expect(world.has(newer)).toBe(true);
    });

    test('throws if only level objects fill it', () => {
        [0, 2, 4].forEach((y) => add(y));
        expect(() => add(6)).toThrow(/config.batch.instances must be above 3/);
    });

    test('ignores a queued object it already removed', () => {
        const [a] = [0, 2, 4].map((y) => add(y, { transient: true }));
        world.remove(a);
        add(6, { transient: true });
        expect(world.has(a)).toBe(false);
        expect(() => world.flush()).not.toThrow();
        expect(world.objects.size).toBe(3);
    });
});
