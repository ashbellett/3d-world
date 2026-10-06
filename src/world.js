import { Mesh, Vector3 } from 'three';
import { config } from './config.js';

// Makes a mesh to pass to World.add. It sets the same userData fields as
// ConvexObjectBreaker.prepareBreakableObject, which the breaker reads from objects it breaks.
export function createMesh(geometry, material, position, mass, breakable = false) {
    const mesh = new Mesh(geometry, material);
    mesh.position.copy(position);
    Object.assign(mesh.userData, {
        mass,
        velocity: new Vector3(),
        angularVelocity: new Vector3(),
        breakable,
    });
    return mesh;
}

// The objects in the scene, each a mesh with a physics body. Each mesh's userData holds:
// - mass, velocity, angularVelocity, breakable: from createMesh or ConvexObjectBreaker
// - id: the body's id
// - body: the body's handle from Physics.addBody
// - shape: the body's collision shape
// - transient: whether it's a projectile or debris, removed oldest first beyond maxObjects
// - sharedGeometry, sharedShape: whether the geometry and shape outlive the object
export class World {
    constructor(scene, physics) {
        this.scene = scene;
        this.physics = physics;
        // Id -> mesh, oldest first
        this.objects = new Map();
        this.nextId = 0;
        this.toRemove = new Set();
        this.removedIds = new Set();
    }

    add(mesh, shape, { transient = false, sharedGeometry = false, sharedShape = false } = {}) {
        const data = mesh.userData;
        const id = this.nextId++;
        data.body = this.physics.addBody(
            id,
            shape,
            data.mass,
            mesh.position,
            mesh.quaternion,
            data.velocity,
            data.angularVelocity,
        );
        Object.assign(data, { id, shape, transient, sharedGeometry, sharedShape });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.objects.set(id, mesh);
        this.scene.add(mesh);
    }

    get(id) {
        return this.objects.get(id);
    }

    has(mesh) {
        return this.objects.has(mesh.userData.id);
    }

    // Queues the object for removal at the end of the frame
    remove(mesh) {
        this.toRemove.add(mesh);
    }

    // Moves meshes to their bodies and queues objects that fell off the world for removal.
    // Returns whether anything moved.
    sync() {
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

    // Queues the oldest projectiles and debris for removal beyond the object limit
    cull() {
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
    flush() {
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
