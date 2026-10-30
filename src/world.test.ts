import { beforeEach, describe, expect, test } from 'vitest';
import { BoxGeometry, Color, MeshBasicMaterial, Vector3 } from 'three/webgpu';
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

test('cull removes the oldest transient objects beyond the limit', () => {
    const fixed = add(0);
    // One over the limit, counting the fixed object
    const transient = Array.from({ length: config.world.maxObjects }, (_, i) =>
        add(i * 2, { transient: true }),
    );
    world.cull();
    world.flush();
    expect(world.objects.size).toBe(config.world.maxObjects);
    expect(world.has(fixed)).toBe(true);
    expect(world.has(transient[0])).toBe(false);
    expect(world.has(transient[1])).toBe(true);
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
