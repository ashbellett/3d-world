import RAPIER from '@dimforge/rapier3d-simd';
import type { Collider, RigidBody, Shape } from '@dimforge/rapier3d-simd';
import { Quaternion, Vector3 } from 'three/webgpu';
import { config } from './config.ts';

export type { Shape };

// How Physics.addBody makes a body. A mass of 0 makes it static. Impacts on it with an impulse
// above impactThreshold are reported by forEachImpact. A continuous body is checked for
// collisions along its path in each step, not only where it ends up, for small, fast bodies.
export interface BodyOptions {
    mass: number;
    position: Vector3;
    quaternion: Quaternion;
    velocity: Vector3;
    angularVelocity: Vector3;
    impactThreshold?: number;
    continuous?: boolean;
}

// A body and its collider, as returned by Physics.addBody, and its transform before the last
// step it moved in, to interpolate from
export interface BodyHandle {
    body: RigidBody;
    collider: Collider;
    previousPosition: Vector3;
    previousQuaternion: Quaternion;
    // The step that previousPosition and previousQuaternion are from the start of
    previousStep: number;
}

export type ImpactHandler = (
    id0: number,
    id1: number,
    impulse: number,
    point: Vector3,
    normal: Vector3,
) => void;

interface Impact {
    id0: number;
    id1: number;
    impulse: number;
    point: Vector3;
    normal: Vector3;
}

const translation = new Vector3();
const rotation = new Quaternion();

// Whether the coordinates' points (x, y, z, x, y, z, ...) spread more than minThickness from
// every plane, rather than all lying near one plane, line or point
export function spansVolume(coordinates: ArrayLike<number>, minThickness: number): boolean {
    const points = Array.from(
        { length: Math.floor(coordinates.length / 3) },
        (_, i) => new Vector3(coordinates[i * 3], coordinates[i * 3 + 1], coordinates[i * 3 + 2]),
    );
    if (points.length < 4) return false;
    const [origin] = points;
    const offset = new Vector3();
    const furthest = (distance: (point: Vector3) => number) =>
        points.reduce(
            (best, point) => {
                const d = distance(point);
                return d > best.distance ? { point, distance: d } : best;
            },
            { point: origin, distance: 0 },
        );
    // The point furthest from the first point, then from the line through those two, then from
    // the plane through those three
    const second = furthest((point) => point.distanceTo(origin));
    if (second.distance <= minThickness) return false;
    const direction = second.point.clone().sub(origin).normalize();
    const third = furthest((point) => offset.subVectors(point, origin).cross(direction).length());
    if (third.distance <= minThickness) return false;
    const normal = direction.cross(third.point.clone().sub(origin)).normalize();
    const fourth = furthest((point) => Math.abs(offset.subVectors(point, origin).dot(normal)));
    return fourth.distance > minThickness;
}

// The Rapier physics world: the only module that uses Rapier. Each body has a numeric id, which
// impacts report. Shapes can be shared by bodies. Importing this module loads Rapier's
// WebAssembly, so it's imported dynamically, to load while the renderer starts.
export class Physics {
    readonly engineName = 'Rapier';
    readonly world: RAPIER.World;
    readonly events = new RAPIER.EventQueue(true);
    // Collider handle -> body id
    readonly ids = new Map<number, number>();
    // Impacts in the last frame's steps, for forEachImpact
    readonly impacts: Impact[] = [];
    // Steps taken, time not yet stepped, and how far that is into the next step, from 0 to 1
    steps = 0;
    accumulator = 0;
    alpha = 0;

    constructor() {
        this.world = new RAPIER.World({ x: 0, y: -config.physics.gravity, z: 0 });
        this.world.timestep = config.physics.timestep;
    }

    createBoxShape(width: number, height: number, depth: number): Shape {
        return new RAPIER.Cuboid(width / 2, height / 2, depth / 2);
    }

    createSphereShape(radius: number): Shape {
        return new RAPIER.Ball(radius);
    }

    // Takes a geometry's position array. Throws if the points are too flat to make a hull, as
    // Rapier only computes the hull when a body uses the shape.
    createHullShape(positions: ArrayLike<number>): Shape {
        if (!spansVolume(positions, config.physics.minHullThickness)) {
            throw new Error('The points are too flat to make a convex hull');
        }
        return new RAPIER.ConvexPolyhedron(Float32Array.from(positions), null);
    }

    // Returns a handle for the other body methods
    addBody(
        id: number,
        shape: Shape,
        {
            mass,
            position,
            quaternion,
            velocity,
            angularVelocity,
            impactThreshold = Infinity,
            continuous = false,
        }: BodyOptions,
    ): BodyHandle {
        const bodyDesc = mass === 0 ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic();
        // Rapier misses hits between two bodies that both use continuous collision detection,
        // so it's only for the bodies that need it
        bodyDesc
            .setCcdEnabled(continuous)
            .setTranslation(position.x, position.y, position.z)
            .setRotation(quaternion)
            .setLinvel(velocity.x, velocity.y, velocity.z)
            .setAngvel(angularVelocity);
        const body = this.world.createRigidBody(bodyDesc);

        const { friction, restitution, timestep } = config.physics;
        // Multiplied rather than averaged, as config.physics describes
        const colliderDesc = new RAPIER.ColliderDesc(shape)
            .setFriction(friction)
            .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
            .setRestitution(restitution)
            .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply);
        if (mass > 0) colliderDesc.setMass(mass);
        if (impactThreshold < Infinity) {
            // Rapier reports contact forces: a pair's total impulse in a step, over the step.
            // That's at least its largest impulse at one point, which forEachImpact reports, so
            // this reports every impulse above the threshold, and some below it, which
            // forEachImpact's caller compares again.
            colliderDesc
                .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
                .setContactForceEventThreshold(impactThreshold / timestep);
        }
        const collider = this.world.createCollider(colliderDesc, body);
        this.ids.set(collider.handle, id);
        // As if it had been still before the last step, so it's drawn where it starts
        const handle: BodyHandle = {
            body,
            collider,
            previousPosition: position.clone(),
            previousQuaternion: quaternion.clone(),
            previousStep: this.steps - 1,
        };
        body.userData = handle;
        return handle;
    }

    // Frees the body. Bodies touching it are woken first, so that removing it doesn't leave
    // anything asleep in mid-air.
    removeBody({ body, collider }: BodyHandle): void {
        this.world.contactPairsWith(collider, (other) => other.parent()?.wakeUp());
        this.ids.delete(collider.handle);
        this.world.removeRigidBody(body);
    }

    // Copies the body's transform for drawing into a three.js position and quaternion: between
    // its last two steps, by how far the time not yet stepped is into the next. Returns false,
    // without copying, if the body is asleep or static.
    readTransform(handle: BodyHandle, position: Vector3, quaternion: Quaternion): boolean {
        const { body } = handle;
        if (body.isSleeping() || body.isFixed()) return false;
        body.translation(translation);
        body.rotation(rotation);
        // Bodies that weren't moving before the last step have nothing to interpolate from
        if (handle.previousStep === this.steps - 1) {
            position.lerpVectors(handle.previousPosition, translation, this.alpha);
            quaternion.slerpQuaternions(handle.previousQuaternion, rotation, this.alpha);
        } else {
            position.copy(translation);
            quaternion.copy(rotation);
        }
        return true;
    }

    // Copies the body's transform after the last step, as collisions see it, into a three.js
    // position and quaternion
    readPose({ body }: BodyHandle, position: Vector3, quaternion: Quaternion): void {
        body.translation(position);
        body.rotation(quaternion);
    }

    readVelocity({ body }: BodyHandle, velocity: Vector3, angularVelocity: Vector3): void {
        body.linvel(velocity);
        body.angvel(angularVelocity);
    }

    // Advances the world by delta seconds, in fixed steps of config.physics.timestep, so the
    // simulation is the same at any frame rate. Time short of a step waits for the next frame,
    // and readTransform interpolates by it. At most maxSubSteps steps' time is taken, so the
    // frame after a long one doesn't take longer still.
    step(delta: number): void {
        this.impacts.length = 0;
        const { timestep, maxSubSteps } = config.physics;
        this.accumulator = Math.min(this.accumulator + delta, timestep * maxSubSteps);
        // Allowing for rounding, so that a frame of exactly one step takes one
        while (this.accumulator >= timestep * (1 - 1e-6)) {
            this.accumulator -= timestep;
            this.world.forEachActiveRigidBody((body) => {
                const handle = body.userData as BodyHandle;
                body.translation(handle.previousPosition);
                body.rotation(handle.previousQuaternion);
                handle.previousStep = this.steps;
            });
            this.world.step(this.events);
            this.steps++;
            this.events.drainContactForceEvents((event) => {
                this.addImpact(
                    this.world.getCollider(event.collider1()),
                    this.world.getCollider(event.collider2()),
                );
            });
        }
        this.alpha = Math.max(this.accumulator, 0) / timestep;
    }

    // Records the contact between the colliders with the largest impulse in the last step
    addImpact(collider0: Collider, collider1: Collider): void {
        let impact: Impact | undefined;
        this.world.contactPair(collider0, collider1, (manifold, flipped) => {
            // The manifold's points are in its first collider's space
            const first = flipped ? collider1 : collider0;
            for (let i = 0, count = manifold.numContacts(); i < count; i++) {
                const impulse = manifold.contactImpulse(i);
                if (impulse <= (impact?.impulse ?? 0)) continue;
                impact ??= {
                    id0: this.ids.get(collider0.handle)!,
                    id1: this.ids.get(collider1.handle)!,
                    impulse: 0,
                    point: new Vector3(),
                    normal: new Vector3(),
                };
                impact.impulse = impulse;
                manifold.localContactPoint1(i, impact.point);
                impact.point
                    .applyQuaternion(first.rotation(rotation))
                    .add(first.translation(translation));
                manifold.normal(impact.normal);
            }
        });
        if (impact) this.impacts.push(impact);
    }

    // Calls onImpact(id0, id1, impulse, point, normal) for the largest contact impulse between
    // each pair of touching bodies, in each step of the last frame, where either body's impact
    // threshold may have been passed
    forEachImpact(onImpact: ImpactHandler): void {
        for (const { id0, id1, impulse, point, normal } of this.impacts) {
            onImpact(id0, id1, impulse, point, normal);
        }
    }
}
