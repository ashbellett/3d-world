import type { BufferGeometry, Material, Scene } from 'three/webgpu';
import { Mesh, Vector3 } from 'three/webgpu';
import { config } from './config.ts';
import type { BodyHandle, Physics } from './physics.ts';

// What a mesh needs for World.add: the fields createMesh sets
export interface BodyData {
    mass: number;
    velocity: Vector3;
    angularVelocity: Vector3;
    breakable: boolean;
    // Contact impulse above which it breaks, if breakable
    breakImpulse: number;
}

export interface AddOptions {
    transient?: boolean;
    sharedGeometry?: boolean;
    sharedShape?: boolean;
}

// The fields World.add sets as well, described on World
export interface ObjectData extends BodyData, Required<AddOptions> {
    id: number;
    body: BodyHandle;
    shape: Ammo.btCollisionShape;
}

export type BodyMesh = Mesh & { userData: BodyData };
export type WorldObject = Mesh & { userData: ObjectData };

// Makes a mesh to pass to World.add. A breakImpulse makes it breakable. It sets the same
// userData fields as ConvexObjectBreaker.prepareBreakableObject, which the breaker reads from
// objects it breaks, and breakImpulse, which Fracture reads.
export function createMesh(
    geometry: BufferGeometry,
    material: Material | Material[],
    position: Vector3,
    mass: number,
    breakImpulse?: number,
): BodyMesh {
    const mesh = new Mesh(geometry, material);
    mesh.position.copy(position);
    const data: BodyData = {
        mass,
        velocity: new Vector3(),
        angularVelocity: new Vector3(),
        breakable: breakImpulse !== undefined,
        breakImpulse: breakImpulse ?? Infinity,
    };
    Object.assign(mesh.userData, data);
    return mesh as BodyMesh;
}

// The objects in the scene, each a mesh with a physics body. Each mesh's userData holds:
// - mass, velocity, angularVelocity, breakable, breakImpulse: from createMesh, or from
//   ConvexObjectBreaker and Fracture for debris
// - id: the body's id
// - body: the body's handle from Physics.addBody
// - shape: the body's collision shape
// - transient: whether it's a projectile or debris, removed oldest first beyond maxObjects
// - sharedGeometry, sharedShape: whether the geometry and shape outlive the object
export class World {
    readonly scene: Scene;
    readonly physics: Physics;
    // Id -> mesh, oldest first
    readonly objects = new Map<number, WorldObject>();
    nextId = 0;
    readonly toRemove = new Set<WorldObject>();
    readonly removedIds = new Set<number>();

    constructor(scene: Scene, physics: Physics) {
        this.scene = scene;
        this.physics = physics;
    }

    add(
        mesh: BodyMesh,
        shape: Ammo.btCollisionShape,
        { transient = false, sharedGeometry = false, sharedShape = false }: AddOptions = {},
    ): void {
        const data = mesh.userData;
        const id = this.nextId++;
        const body = this.physics.addBody(
            id,
            shape,
            data.mass,
            mesh.position,
            mesh.quaternion,
            data.velocity,
            data.angularVelocity,
        );
        Object.assign(data, { id, body, shape, transient, sharedGeometry, sharedShape });
        const object = mesh as WorldObject;
        object.castShadow = true;
        object.receiveShadow = true;
        this.objects.set(id, object);
        this.scene.add(object);
    }

    get(id: number): WorldObject | undefined {
        return this.objects.get(id);
    }

    has(mesh: WorldObject): boolean {
        return this.objects.has(mesh.userData.id);
    }

    // Queues the object for removal at the end of the frame
    remove(mesh: WorldObject): void {
        this.toRemove.add(mesh);
    }

    // Moves meshes to their bodies and queues objects that fell off the world for removal.
    // Returns whether anything moved.
    sync(): boolean {
        let moved = false;
        for (const mesh of this.objects.values()) {
            if (!this.physics.readTransform(mesh.userData.body, mesh.position, mesh.quaternion)) {
                continue;
            }
            moved = true;
            if (mesh.position.y < config.world.minY) this.toRemove.add(mesh);
        }
        return moved;
    }

    // Removes every object now, rather than at the end of the frame
    clear(): void {
        for (const mesh of this.objects.values()) this.toRemove.add(mesh);
        this.flush();
    }

    // Queues the oldest projectiles and debris for removal beyond the object limit
    cull(): void {
        let excess = this.objects.size - this.toRemove.size - config.world.maxObjects;
        for (const mesh of this.objects.values()) {
            if (excess <= 0) break;
            if (!mesh.userData.transient || this.toRemove.has(mesh)) continue;
            this.toRemove.add(mesh);
            excess--;
        }
    }

    // Removes queued objects and frees their bodies, and any shapes and geometries they don't
    // share. Returns whether anything was removed.
    flush(): boolean {
        if (this.toRemove.size === 0) return false;
        for (const mesh of this.toRemove) this.removedIds.add(mesh.userData.id);
        this.physics.wakeTouching(this.removedIds);
        for (const mesh of this.toRemove) {
            const { id, body, shape, sharedGeometry, sharedShape } = mesh.userData;
            this.physics.removeBody(body);
            if (!sharedShape) this.physics.destroyShape(shape);
            if (!sharedGeometry) mesh.geometry.dispose();
            this.scene.remove(mesh);
            this.objects.delete(id);
        }
        this.toRemove.clear();
        this.removedIds.clear();
        return true;
    }
}
