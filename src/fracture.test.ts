import { beforeEach, expect, test } from 'vitest';
import { BoxGeometry, Color, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three/webgpu';
import { Batch } from './batch.ts';
import { config } from './config.ts';
import { Fracture } from './fracture.ts';
import { Physics } from './physics.ts';
import { World } from './world.ts';

let physics: Physics;
let world: World;
let fracture: Fracture;

beforeEach(() => {
    physics = new Physics();
    physics.world.gravity = { x: 0, y: 0, z: 0 };
    world = new World(
        new Batch(new MeshBasicMaterial(), { instances: 64, vertices: 8192 }),
        physics,
    );
    fracture = new Fracture(world, physics);
});

function addBlock(breakImpulse?: number) {
    return world.add(
        {
            geometry: Batch.prepare(new BoxGeometry(2, 2, 2)),
            colour: new Color(0x40c4b3),
            mass: 2,
            position: new Vector3(),
            breakImpulse,
        },
        physics.createBoxShape(2, 2, 2),
    );
}

// Fires a ball at the block and runs frames until it's done
function hit(speed: number): void {
    world.add(
        {
            geometry: Batch.prepare(new SphereGeometry(0.2, 8, 6)),
            colour: new Color(),
            mass: 10,
            position: new Vector3(0, 0.3, -5),
            velocity: new Vector3(0, 0, speed),
            continuous: true,
        },
        physics.createSphereShape(0.2),
    );
    for (let frame = 0; frame < 30; frame++) {
        physics.step(1 / 60);
        world.sync();
        fracture.update();
        world.flush();
    }
}

test('breaks a block hit harder than its break impulse into debris of its colour', () => {
    const block = addBlock(5);
    hit(50);
    expect(world.has(block)).toBe(false);
    const debris = [...world.objects.values()].filter((object) => object.transient);
    expect(debris.length).toBeGreaterThan(1);
    for (const piece of debris) {
        expect(piece.colour).toBe(block.colour);
        expect(piece.mass).toBeLessThan(block.mass);
        // Pieces break at the block's impulse, or not at all if too small to break again
        expect([5, Infinity]).toContain(piece.breakImpulse);
    }
});

test("doesn't break a block hit more softly than its break impulse", () => {
    const block = addBlock(1e6);
    hit(50);
    expect(world.has(block)).toBe(true);
});

test("doesn't break an unbreakable block", () => {
    const block = addBlock();
    hit(50);
    expect(world.has(block)).toBe(true);
});

test('breaks at most maxPerFrame objects a frame', () => {
    const blocks = Array.from({ length: config.fracture.maxPerFrame + 1 }, (_, i) => i * 3).map(
        (x) =>
            world.add(
                {
                    geometry: Batch.prepare(new BoxGeometry(2, 2, 2)),
                    colour: new Color(),
                    mass: 2,
                    position: new Vector3(x, 0, 0),
                    breakImpulse: 0.001,
                },
                physics.createBoxShape(2, 2, 2),
            ),
    );
    for (const block of blocks)
        fracture.enqueue(block.id, 1, new Vector3(0, 0, -1), new Vector3(0, 0, 1));
    fracture.update();
    world.flush();
    expect(blocks.filter((block) => world.has(block))).toHaveLength(1);
    fracture.update();
    world.flush();
    expect(blocks.filter((block) => world.has(block))).toHaveLength(0);
});
