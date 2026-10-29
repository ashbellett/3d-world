import type { BufferGeometry, Material } from 'three';
import {
    BoxGeometry,
    CanvasTexture,
    Color,
    MeshLambertMaterial,
    RepeatWrapping,
    SRGBColorSpace,
    Vector3,
} from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { config } from './config.ts';
import type { BlockSpec, LevelSpec } from './levels.ts';
import type { Physics } from './physics.ts';
import type { World } from './world.ts';
import { createMesh } from './world.ts';

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

// Builds levels: the ground, and the level's breakable objects. Loading a level removes
// everything in the world first, and frees what the last level's objects shared.
export class LevelLoader {
    readonly world: World;
    readonly physics: Physics;
    // The grid on top of the ground, plain on its sides. Kept for every level.
    readonly groundMaterials: Material[];
    // Shared by the current level's objects
    geometries: BufferGeometry[] = [];
    materials: Material[] = [];
    shapes: Ammo.btCollisionShape[] = [];

    constructor(world: World, physics: Physics) {
        this.world = world;
        this.physics = physics;
        const side = new MeshLambertMaterial({ color: config.ground.colour });
        const top = new MeshLambertMaterial({
            color: config.ground.colour,
            map: createGridTexture(),
        });
        // In BoxGeometry's face order: +x, -x, +y, -y, +z, -z
        this.groundMaterials = [side, side, top, side, side, side];
    }

    load(level: LevelSpec): void {
        this.world.clear();
        this.free();
        this.addGround();
        for (const block of level.blocks) this.addBlocks(block);
    }

    free(): void {
        for (const geometry of this.geometries) geometry.dispose();
        for (const material of this.materials) material.dispose();
        for (const shape of this.shapes) this.physics.destroyShape(shape);
        this.geometries = [];
        this.materials = [];
        this.shapes = [];
    }

    addGround(): void {
        const [width, height, depth] = config.ground.size;
        const ground = createMesh(
            new BoxGeometry(width, height, depth),
            this.groundMaterials,
            new Vector3(0, -height / 2, 0),
            0,
        );
        this.world.add(ground, this.physics.createBoxShape(width, height, depth));
    }

    addBlocks({ shape, mass, colour, breakImpulse, positions }: BlockSpec): void {
        let geometry: BufferGeometry;
        let collisionShape: Ammo.btCollisionShape;
        if ('box' in shape) {
            const [width, height, depth] = shape.box;
            geometry = new BoxGeometry(width, height, depth);
            collisionShape = this.physics.createBoxShape(width, height, depth);
        } else {
            geometry = new ConvexGeometry(shape.hull.map((point) => new Vector3(...point)));
            collisionShape = this.physics.createHullShape(geometry.attributes.position.array);
        }
        const material = new MeshLambertMaterial({ color: colour });
        this.geometries.push(geometry);
        this.materials.push(material);
        this.shapes.push(collisionShape);

        const position = new Vector3();
        for (const point of positions) {
            const mesh = createMesh(
                geometry,
                material,
                position.fromArray(point),
                mass,
                breakImpulse,
            );
            this.world.add(mesh, collisionShape, { sharedGeometry: true, sharedShape: true });
        }
    }
}
