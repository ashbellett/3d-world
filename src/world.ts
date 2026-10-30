import type { BufferGeometry, Camera, Color } from 'three/webgpu';
import { Frustum, Matrix4, Quaternion, Sphere, Vector3 } from 'three/webgpu';
import type { Batch } from './batch.ts';
import { config } from './config.ts';
import type { CullCandidate } from './cull.ts';
import { cullOrder } from './cull.ts';
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
    // A projectile or debris, removed beyond config.world.maxObjects, as World.cull describes
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

const frustum = new Frustum();
const viewProjection = new Matrix4();
const sphere = new Sphere();

// The radius of the sphere around the object's origin that holds its geometry
function radiusOf({ geometry }: WorldObject): number {
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const { center, radius } = geometry.boundingSphere!;
    return center.length() + radius;
}

// The objects in the world, each a physics body drawn as an instance in the batch
export class World {
    readonly batch: Batch;
    readonly physics: Physics;
    // Id -> object, oldest first
    readonly objects = new Map<number, WorldObject>();
    nextId = 0;
    readonly toRemove = new Set<WorldObject>();
    // Objects shrinking away -> seconds they've been shrinking
    readonly fading = new Map<WorldObject, number>();

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
        if (this.batch.full) this.makeRoom();
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

    isFading(object: WorldObject): boolean {
        return this.fading.has(object);
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

    // Starts projectiles and debris shrinking away beyond config.world.maxObjects, not counting
    // those already going, the least noticeable from the camera first, by config.world.cullOrder
    cull(camera: Camera): void {
        const { maxObjects, cullOrder: rules } = config.world;
        const excess = this.objects.size - this.toRemove.size - this.fading.size - maxObjects;
        if (excess <= 0) return;
        frustum.setFromProjectionMatrix(
            viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
        );
        const candidates: (CullCandidate & { object: WorldObject })[] = [];
        for (const object of this.objects.values()) {
            if (!object.transient || this.toRemove.has(object) || this.fading.has(object)) continue;
            const radius = radiusOf(object);
            const distance = object.position.distanceTo(camera.position);
            candidates.push({
                object,
                id: object.id,
                offScreen: !frustum.intersectsSphere(sphere.set(object.position, radius)),
                resting: this.physics.isResting(object.body),
                screenSize: radius / Math.max(distance, 1e-6),
            });
        }
        for (const { object } of cullOrder(candidates, rules).slice(0, excess)) {
            this.fading.set(object, 0);
        }
    }

    // Shrinks fading objects over config.world.fadeTime, and queues those that have gone for
    // removal. Returns whether any are fading.
    fade(delta: number): boolean {
        for (const [object, time] of this.fading) {
            const elapsed = time + delta;
            const size = 1 - elapsed / config.world.fadeTime;
            if (size <= 0) {
                this.toRemove.add(object);
                continue;
            }
            this.fading.set(object, elapsed);
            this.batch.setTransform(object.instance, object.position, object.quaternion, size);
        }
        return this.fading.size > 0;
    }

    // Removes queued objects. Returns whether anything was removed.
    flush(): boolean {
        if (this.toRemove.size === 0) return false;
        for (const object of this.toRemove) this.removeNow(object);
        return true;
    }

    // Removes the object, its body and instance, and its geometry if it doesn't share it. Does
    // nothing if it's already been removed, as makeRoom may remove an object something else has
    // queued.
    removeNow(object: WorldObject): void {
        this.toRemove.delete(object);
        if (!this.objects.has(object.id)) return;
        this.physics.removeBody(object.body);
        this.batch.removeInstance(object.instance);
        if (!object.sharedGeometry) this.batch.removeGeometry(object.geometryId);
        this.objects.delete(object.id);
        this.fading.delete(object);
    }

    // Removes an object at once, when the batch has no room for another: the one that has
    // shrunk furthest, or if none is shrinking, the oldest projectile or piece of debris
    makeRoom(): void {
        let victim: WorldObject | undefined;
        let furthest = -1;
        for (const [object, time] of this.fading) {
            if (time > furthest) [victim, furthest] = [object, time];
        }
        victim ??= [...this.objects.values()].find((object) => object.transient);
        if (!victim) {
            throw new Error(
                `The batch is full of level objects: config.batch.instances must be above ${this.objects.size}`,
            );
        }
        this.removeNow(victim);
    }
}
