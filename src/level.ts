import type { BufferGeometry, Scene } from 'three/webgpu';
import {
    BoxGeometry,
    CanvasTexture,
    Color,
    Mesh,
    MeshLambertMaterial,
    Quaternion,
    RepeatWrapping,
    SRGBColorSpace,
    Vector3,
} from 'three/webgpu';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { Batch } from './batch.ts';
import { config } from './config.ts';
import type { BlockSpec, LevelSpec } from './levels.ts';
import type { Physics, Shape } from './physics.ts';
import type { World } from './world.ts';

// A tile of the ground's grid: one cell, with lines along two of its edges
function createGridTexture(): CanvasTexture {
    const { colour, resolution, lineWidth } = config.ground.grid;
    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, resolution, resolution);
    context.fillStyle = `#${new Color(colour).getHexString()}`;
    context.fillRect(0, 0, resolution, lineWidth);
    context.fillRect(0, 0, lineWidth, resolution);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    const [width, , depth] = config.ground.size;
    texture.repeat.set(width, depth);
    // Keeps the lines sharp when seen at a low angle. three.js lowers it to what the GPU allows.
    texture.anisotropy = 16;
    return texture;
}

// The ground's body id, which no world object has
const groundId = -1;

// Adds the ground, with its grid on top, and its body. It isn't a world object, so it stays for
// every level, and as it has its own materials, it isn't in the batch.
export function addGround(scene: Scene, physics: Physics): void {
    const [width, height, depth] = config.ground.size;
    const side = new MeshLambertMaterial({ color: config.ground.colour });
    const top = new MeshLambertMaterial({ color: config.ground.colour, map: createGridTexture() });
    // In BoxGeometry's face order: +x, -x, +y, -y, +z, -z
    const ground = new Mesh(new BoxGeometry(width, height, depth), [
        side,
        side,
        top,
        side,
        side,
        side,
    ]);
    ground.position.set(0, -height / 2, 0);
    // Everything is above it, so it has nothing to cast a shadow on
    ground.receiveShadow = true;
    scene.add(ground);
    physics.addBody(groundId, physics.createBoxShape(width, height, depth), {
        mass: 0,
        position: ground.position,
        quaternion: new Quaternion(),
        velocity: new Vector3(),
        angularVelocity: new Vector3(),
    });
}

// Builds levels' breakable objects. Loading a level removes everything in the world first, and
// frees the geometries the last level's objects shared.
export class LevelLoader {
    readonly world: World;
    readonly physics: Physics;
    // The batch ids of the geometries the current level's objects share
    geometryIds: number[] = [];

    constructor(world: World, physics: Physics) {
        this.world = world;
        this.physics = physics;
    }

    load(level: LevelSpec): void {
        this.world.clear();
        for (const id of this.geometryIds) this.world.batch.removeGeometry(id);
        this.geometryIds = [];
        for (const block of level.blocks) this.addBlocks(block);
    }

    addBlocks({ shape, mass, colour, breakImpulse, positions }: BlockSpec): void {
        let geometry: BufferGeometry;
        let collisionShape: Shape;
        if ('box' in shape) {
            const [width, height, depth] = shape.box;
            geometry = Batch.prepare(new BoxGeometry(width, height, depth));
            collisionShape = this.physics.createBoxShape(width, height, depth);
        } else {
            geometry = new ConvexGeometry(shape.hull.map((point) => new Vector3(...point)));
            collisionShape = this.physics.createHullShape(geometry.attributes.position.array);
        }
        const geometryId = this.world.batch.addGeometry(geometry);
        this.geometryIds.push(geometryId);
        const blockColour = new Color(colour);
        for (const point of positions) {
            this.world.add(
                {
                    geometry,
                    geometryId,
                    colour: blockColour,
                    mass,
                    position: new Vector3(...point),
                    breakImpulse,
                },
                collisionShape,
            );
        }
    }
}
