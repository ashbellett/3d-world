import type { BufferGeometry, Color } from 'three/webgpu';
import { Quaternion, Vector3 } from 'three/webgpu';
import type { Batch } from './batch.ts';
import { config } from './config.ts';
import type { BodyHandle, Physics, Shape } from './physics.ts';

// What World.add makes an object from
export interface ObjectSpec {
    // From Batch.prepare
    geometry: BufferGeometry;
    // The geometry's id in the batch, if it's shared by other objects and outlives them.
    // Otherwise the object adds the geometry to the batch, and removes it when it's removed.
    geometryId?: number;
    colour: Color;
    // 0 makes it static
    mass: number;
    position: Vector3;
    quaternion?: Quaternion;
    velocity?: Vector3;
    angularVelocity?: Vector3;
    // Contact impulse above which it breaks. Without one, it doesn't.
    breakImpulse?: number;
    // A projectile or debris, removed oldest first beyond config.world.maxObjects
    transient?: boolean;
    // Small and fast, so collides along its path, as Physics describes
    continuous?: boolean;
}

// An object in the world: a physics body, drawn as an instance in the batch
export interface WorldObject {
    readonly id: number;
    readonly body: BodyHandle;
    readonly geometry: BufferGeometry;
    readonly geometryId: number;
    readonly sharedGeometry: boolean;
    readonly instance: number;
    readonly colour: Color;
    readonly mass: number;
    // Infinity if it doesn't break
    readonly breakImpulse: number;
    readonly transient: boolean;
    // Where it's drawn, which sync updates
    readonly position: Vector3;
    readonly quaternion: Quaternion;
}

// The objects in the world, each a physics body drawn as an instance in the batch
export class World {
    readonly batch: Batch;
    readonly physics: Physics;
    // Id -> object, oldest first
    readonly objects = new Map<number, WorldObject>();
    nextId = 0;
    readonly toRemove = new Set<WorldObject>();

    constructor(batch: Batch, physics: Physics) {
        this.batch = batch;
        this.physics = physics;
    }

    add(spec: ObjectSpec, shape: Shape): WorldObject {
        const {
            geometry,
            colour,
            mass,
            position,
            quaternion = new Quaternion(),
            velocity = new Vector3(),
            angularVelocity = new Vector3(),
            breakImpulse = Infinity,
            transient = false,
            continuous = false,
        } = spec;
        const id = this.nextId++;
        const body = this.physics.addBody(id, shape, {
            mass,
            position,
            quaternion,
            velocity,
            angularVelocity,
            impactThreshold: breakImpulse,
            continuous,
        });
        const sharedGeometry = spec.geometryId !== undefined;
        const geometryId = spec.geometryId ?? this.batch.addGeometry(geometry);
        const instance = this.batch.addInstance(geometryId, colour);
        const object: WorldObject = {
            id,
            body,
            geometry,
            geometryId,
            sharedGeometry,
            instance,
            colour,
            mass,
            breakImpulse,
            transient,
            position: position.clone(),
            quaternion: quaternion.clone(),
        };
        this.batch.setTransform(instance, object.position, object.quaternion);
        this.objects.set(id, object);
        return object;
    }

    get(id: number): WorldObject | undefined {
        return this.objects.get(id);
    }

    has(object: WorldObject): boolean {
        return this.objects.has(object.id);
    }

    // Queues the object for removal at the end of the frame
    remove(object: WorldObject): void {
        this.toRemove.add(object);
    }

    // Moves objects to their bodies and queues objects that fell off the world for removal.
    // Returns whether anything moved.
    sync(): boolean {
        let moved = false;
        for (const object of this.objects.values()) {
            const { body, instance, position, quaternion } = object;
            if (!this.physics.readTransform(body, position, quaternion)) continue;
            this.batch.setTransform(instance, position, quaternion);
            moved = true;
            if (position.y < config.world.minY) this.toRemove.add(object);
        }
        return moved;
    }

    // Removes every object now, rather than at the end of the frame
    clear(): void {
        for (const object of this.objects.values()) this.toRemove.add(object);
        this.flush();
    }

    // Queues the oldest projectiles and debris for removal beyond the object limit
    cull(): void {
        let excess = this.objects.size - this.toRemove.size - config.world.maxObjects;
        for (const object of this.objects.values()) {
            if (excess <= 0) break;
            if (!object.transient || this.toRemove.has(object)) continue;
            this.toRemove.add(object);
            excess--;
        }
    }

    // Removes queued objects, their bodies and instances, and any geometries they don't share.
    // Returns whether anything was removed.
    flush(): boolean {
        if (this.toRemove.size === 0) return false;
        for (const object of this.toRemove) {
            this.physics.removeBody(object.body);
            this.batch.removeInstance(object.instance);
            if (!object.sharedGeometry) this.batch.removeGeometry(object.geometryId);
            this.objects.delete(object.id);
        }
        this.toRemove.clear();
        return true;
    }
}
