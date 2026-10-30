import { beforeEach, describe, expect, test, vi } from 'vitest';
import { BoxGeometry, MeshBasicMaterial, Scene, Vector3 } from 'three/webgpu';
import { config } from './config.ts';
import { Physics } from './physics.ts';
import type { AddOptions } from './world.ts';
import { World, createMesh } from './world.ts';

let world: World;
let physics: Physics;
const material = new MeshBasicMaterial();

beforeEach(async () => {
    physics = await Physics.create();
    world = new World(new Scene(), physics);
});

function add(y: number, options: AddOptions = {}, geometry = new BoxGeometry()) {
    const mesh = createMesh(geometry, material, new Vector3(0, y, 0), 1);
    world.add(mesh, physics.createBoxShape(1, 1, 1), options);
    return world.get(mesh.userData.id as number)!;
}

describe('createMesh', () => {
    test('makes a breakable mesh when given a break impulse', () => {
        const mesh = createMesh(new BoxGeometry(), material, new Vector3(1, 2, 3), 5, 10);
        expect(mesh.position).toEqual(new Vector3(1, 2, 3));
        expect(mesh.userData).toMatchObject({ mass: 5, breakable: true, breakImpulse: 10 });
    });

    test('makes an unbreakable mesh otherwise', () => {
        const mesh = createMesh(new BoxGeometry(), material, new Vector3(), 5);
        expect(mesh.userData).toMatchObject({ breakable: false, breakImpulse: Infinity });
    });
});

test('adds objects to the scene with increasing ids', () => {
    const first = add(10);
    const second = add(20);
    expect(second.userData.id).toBeGreaterThan(first.userData.id);
    expect(world.scene.children).toEqual([first, second]);
    expect(world.has(first)).toBe(true);
});

test('sync moves meshes to their bodies', () => {
    const mesh = add(10);
    physics.step(1 / 60);
    expect(world.sync()).toBe(true);
    expect(mesh.position.y).toBeLessThan(10);
});

test('sync queues objects that fell off the world', () => {
    const mesh = add(config.world.minY - 1);
    physics.step(1 / 60);
    world.sync();
    expect(world.flush()).toBe(true);
    expect(world.has(mesh)).toBe(false);
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

test("flush frees geometries that aren't shared", () => {
    const own = add(0, {}, new BoxGeometry());
    const shared = add(2, { sharedGeometry: true }, new BoxGeometry());
    const disposeOwn = vi.spyOn(own.geometry, 'dispose');
    const disposeShared = vi.spyOn(shared.geometry, 'dispose');
    world.clear();
    expect(disposeOwn).toHaveBeenCalled();
    expect(disposeShared).not.toHaveBeenCalled();
    expect(world.objects.size).toBe(0);
    expect(world.scene.children).toEqual([]);
});

test('flush returns false when nothing was queued', () => {
    expect(world.flush()).toBe(false);
});
