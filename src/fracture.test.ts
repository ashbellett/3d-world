import { beforeEach, expect, test, vi } from 'vitest';
import {
    BoxGeometry,
    Color,
    MeshBasicMaterial,
    Quaternion,
    SphereGeometry,
    Vector3,
} from 'three/webgpu';
import { Batch } from './batch.ts';
import { breakHere } from './breaker.ts';
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
    fracture = new Fracture(world, physics, breakHere);
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

// Lets the breaker's results arrive, as they would between frames
const nextFrame = () => new Promise((resolve) => setTimeout(resolve));

// Fires a ball at the block and runs frames until it's done
async function hit(speed: number): Promise<void> {
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
        await nextFrame();
    }
}

test('breaks a block hit harder than its break impulse into debris of its colour', async () => {
    const block = addBlock(5);
    await hit(50);
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

test("doesn't break a block hit more softly than its break impulse", async () => {
    const block = addBlock(1e6);
    await hit(50);
    expect(world.has(block)).toBe(true);
});

test("doesn't break an unbreakable block", async () => {
    const block = addBlock();
    await hit(50);
    expect(world.has(block)).toBe(true);
});

test('replaces at most maxPerFrame objects a frame', async () => {
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
    await nextFrame();
    fracture.update();
    world.flush();
    expect(blocks.filter((block) => world.has(block))).toHaveLength(1);
    fracture.update();
    world.flush();
    expect(blocks.filter((block) => world.has(block))).toHaveLength(0);
});

test('places the pieces where the object has moved to while being cut up', async () => {
    const block = addBlock(0.001);
    fracture.enqueue(block.id, 1, new Vector3(0, 0, -1), new Vector3(0, 0, 1));
    // Moves the body before the pieces arrive
    block.body.body.setTranslation({ x: 10, y: 0, z: 0 }, true);
    await nextFrame();
    fracture.update();
    world.flush();
    const pieces = [...world.objects.values()];
    expect(pieces.length).toBeGreaterThan(1);
    const centre = pieces
        .reduce((sum, piece) => sum.addScaledVector(piece.position, piece.mass), new Vector3())
        .divideScalar(block.mass);
    expect(centre.x).toBeCloseTo(10, 1);
});

test('stops tracking a block once its pieces have replaced it', async () => {
    const block = addBlock(0.001);
    fracture.enqueue(block.id, 1, new Vector3(0, 0, -1), new Vector3(0, 0, 1));
    expect(fracture.canBreak(block)).toBe(false);
    await nextFrame();
    fracture.update();
    expect(fracture.breaking.size).toBe(0);
});

// ConvexObjectBreaker misplaces the pieces of a rotated object, and so cuts few of them, which
// breaking objects in their own space avoids
test('breaks a rotated block as fully as an upright one', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const piecesOf = async (quaternion: Quaternion) => {
        world.clear();
        const block = world.add(
            {
                geometry: Batch.prepare(new BoxGeometry(2, 2, 2)),
                colour: new Color(),
                mass: 2,
                position: new Vector3(3, 4, 5),
                quaternion,
                breakImpulse: 0.001,
            },
            physics.createBoxShape(2, 2, 2),
        );
        const hitPoint = new Vector3(0.3, 0.2, -1).applyQuaternion(quaternion).add(block.position);
        const hitNormal = new Vector3(0, 0, 1).applyQuaternion(quaternion);
        fracture.enqueue(block.id, 1, hitPoint, hitNormal);
        await nextFrame();
        fracture.update();
        world.flush();
        return world.objects.size;
    };
    const upright = await piecesOf(new Quaternion());
    const rotated = await piecesOf(
        new Quaternion().setFromAxisAngle(new Vector3(1, 1, 0).normalize(), 0.7),
    );
    vi.restoreAllMocks();
    expect(upright).toBeGreaterThan(2);
    expect(rotated).toBe(upright);
});
