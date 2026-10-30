import RAPIER from '@dimforge/rapier3d-compat';
import type { Collider, RigidBody, Shape } from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three/webgpu';
import { config } from './config.ts';

export type { Shape };

// A body and its collider, as returned by Physics.addBody
export interface BodyHandle {
    body: RigidBody;
    collider: Collider;
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

// The Rapier physics world: the only module that uses Rapier. Each body has a numeric id, which
// impacts report. Shapes can be shared by bodies. Make one with Physics.create, as Rapier's
// WebAssembly starts asynchronously.
export class Physics {
    readonly engineName = 'Rapier';
    readonly world: RAPIER.World;
    readonly events = new RAPIER.EventQueue(true);
    // Collider handle -> body id
    readonly ids = new Map<number, number>();
    // Impacts in the last frame's steps, for forEachImpact
    readonly impacts: Impact[] = [];

    static async create(): Promise<Physics> {
        await RAPIER.init();
        return new Physics();
    }

    private constructor() {
        this.world = new RAPIER.World({ x: 0, y: -config.physics.gravity, z: 0 });
    }

    createBoxShape(width: number, height: number, depth: number): Shape {
        return new RAPIER.Cuboid(width / 2, height / 2, depth / 2);
    }

    createSphereShape(radius: number): Shape {
        return new RAPIER.Ball(radius);
    }

    // Takes a geometry's position array. Throws if the points have no convex hull with volume.
    createHullShape(positions: ArrayLike<number>): Shape {
        const shape = new RAPIER.ConvexPolyhedron(Float32Array.from(positions), null);
        // Rapier only computes the hull when a collider uses the shape, and fails then if it
        // can't, so it's computed here first to fail before any collider is made
        const hull = shape.intoRaw() as ReturnType<typeof shape.intoRaw> | undefined;
        if (!hull) throw new Error('The points have no convex hull with volume');
        hull.free();
        return shape;
    }

    // Takes three.js vectors and a quaternion, and returns a handle for the other body methods.
    // A mass of 0 makes the body static. Impacts on the body with an impulse above
    // impactThreshold are reported by forEachImpact.
    addBody(
        id: number,
        shape: Shape,
        mass: number,
        position: Vector3,
        quaternion: Quaternion,
        velocity: Vector3,
        angularVelocity: Vector3,
        impactThreshold = Infinity,
    ): BodyHandle {
        const bodyDesc = mass === 0 ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic();
        bodyDesc
            .setTranslation(position.x, position.y, position.z)
            .setRotation(quaternion)
            .setLinvel(velocity.x, velocity.y, velocity.z)
            .setAngvel(angularVelocity);
        const body = this.world.createRigidBody(bodyDesc);

        const { friction, restitution, timestep } = config.physics;
        // Multiplied, as Bullet does, rather than averaged
        const colliderDesc = new RAPIER.ColliderDesc(shape)
            .setFriction(friction)
            .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
            .setRestitution(restitution)
            .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply);
        if (mass > 0) colliderDesc.setMass(mass);
        if (impactThreshold < Infinity) {
            // Rapier reports contact forces, which are impulses over a step. Dividing by the
            // longest step reports every impulse above the threshold, and some below it, which
            // forEachImpact's caller compares again.
            colliderDesc
                .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
                .setContactForceEventThreshold(impactThreshold / timestep);
        }
        const collider = this.world.createCollider(colliderDesc, body);
        this.ids.set(collider.handle, id);
        return { body, collider };
    }

    // Frees the body. Bodies touching it are woken first, so that removing it doesn't leave
    // anything asleep in mid-air.
    removeBody({ body, collider }: BodyHandle): void {
        this.world.contactPairsWith(collider, (other) => other.parent()?.wakeUp());
        this.ids.delete(collider.handle);
        this.world.removeRigidBody(body);
    }

    // Copies the body's transform into a three.js position and quaternion. Returns false,
    // without copying, if the body is asleep or static.
    readTransform({ body }: BodyHandle, position: Vector3, quaternion: Quaternion): boolean {
        if (body.isSleeping() || body.isFixed()) return false;
        body.translation(position);
        body.rotation(quaternion);
        return true;
    }

    readVelocity({ body }: BodyHandle, velocity: Vector3, angularVelocity: Vector3): void {
        body.linvel(velocity);
        body.angvel(angularVelocity);
    }

    // Steps the world by delta seconds, in equal steps no longer than config.physics.timestep,
    // and at most maxSubSteps of them. Unlike Bullet's fixed steps, which Ammo interpolated
    // between, at a high refresh rate this takes one short step a frame.
    step(delta: number): void {
        this.impacts.length = 0;
        const { timestep, maxSubSteps } = config.physics;
        const steps = Math.min(Math.ceil(delta / timestep), maxSubSteps);
        if (steps <= 0) return;
        this.world.timestep = Math.min(delta, timestep * maxSubSteps) / steps;
        for (let i = 0; i < steps; i++) {
            this.world.step(this.events);
            this.events.drainContactForceEvents((event) => {
                this.addImpact(
                    this.world.getCollider(event.collider1()),
                    this.world.getCollider(event.collider2()),
                );
            });
        }
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
