import { Quaternion, Vector3 } from 'three/webgpu';
import type { BreakJob, Breaker, Piece } from './breaker.ts';
import { geometryOf } from './breaker.ts';
import { config } from './config.ts';
import type { ImpactHandler, Physics, Shape } from './physics.ts';
import type { World, WorldObject } from './world.ts';

const position = new Vector3();
const quaternion = new Quaternion();
const inverse = new Quaternion();

// Breaks breakable objects that are hit harder than their breakImpulse into debris. The breaker
// cuts them up, in a worker in the page, while they carry on moving; the pieces then replace
// them where they've got to. At most config.fracture.maxPerFrame objects are replaced each
// frame, so a shot that breaks several boxes doesn't stall a single frame; the rest wait.
export class Fracture {
    readonly world: World;
    readonly physics: Physics;
    readonly breaker: Breaker;
    // Objects being cut up, so they aren't cut up twice
    readonly breaking = new Set<WorldObject>();
    // Objects that have been cut up, and their pieces, oldest first
    readonly broken: { object: WorldObject; pieces: Piece[] }[] = [];
    // Bound once, as it's called for every impact each frame
    readonly onImpact: ImpactHandler = (id0, id1, impulse, point, normal) => {
        this.enqueue(id0, impulse, point, normal);
        this.enqueue(id1, impulse, point, normal);
    };

    constructor(world: World, physics: Physics, breaker: Breaker) {
        this.world = world;
        this.physics = physics;
        this.breaker = breaker;
    }

    canBreak(object: WorldObject | undefined): object is WorldObject {
        return (
            object !== undefined &&
            object.breakImpulse < Infinity &&
            !this.breaking.has(object) &&
            !this.world.isFading(object)
        );
    }

    // Sends the object to be cut up, if the impact breaks it
    enqueue(id: number, impulse: number, point: Vector3, normal: Vector3): void {
        const object = this.world.get(id);
        if (!this.canBreak(object) || impulse <= object.breakImpulse) return;
        // In the object's space, where the body was hit, rather than where it's drawn, between
        // steps
        this.physics.readPose(object.body, position, inverse);
        inverse.invert();
        const job: BreakJob = {
            positions: Float32Array.from(object.geometry.getAttribute('position').array),
            normals: Float32Array.from(object.geometry.getAttribute('normal').array),
            mass: object.mass,
            point: point.clone().sub(position).applyQuaternion(inverse).toArray(),
            normal: normal.clone().applyQuaternion(inverse).toArray(),
            seed: Math.floor(Math.random() * 2 ** 32),
        };
        this.breaking.add(object);
        void this.breaker(job).then((pieces) => this.broken.push({ object, pieces }));
    }

    update(): void {
        this.physics.forEachImpact(this.onImpact);
        for (let i = 0; i < config.fracture.maxPerFrame && this.broken.length > 0; i++) {
            const { object, pieces } = this.broken.shift()!;
            this.breaking.delete(object);
            // It may have been removed while it was being cut up
            if (this.world.has(object)) this.shatter(object, pieces);
        }
    }

    // Replaces the object with its pieces, where its body is now and moving as it is
    shatter(object: WorldObject, pieces: Piece[]): void {
        if (pieces.length === 0) return;
        let shapes: Shape[];
        try {
            shapes = pieces.map((piece) => this.physics.createHullShape(piece.positions));
        } catch {
            // Rapier throws on pieces too flat to have a hull. The object stays whole rather
            // than the error stopping the loop.
            return;
        }
        this.physics.readPose(object.body, position, quaternion);
        const velocity = new Vector3();
        const angularVelocity = new Vector3();
        this.physics.readVelocity(object.body, velocity, angularVelocity);
        pieces.forEach((piece, i) => {
            this.world.add(
                {
                    geometry: geometryOf(piece),
                    colour: object.colour,
                    mass: piece.mass,
                    position: new Vector3(...piece.position)
                        .applyQuaternion(quaternion)
                        .add(position),
                    quaternion,
                    velocity,
                    angularVelocity,
                    // Pieces too small to break again don't
                    breakImpulse: piece.breakable ? object.breakImpulse : undefined,
                    transient: true,
                },
                shapes[i],
            );
        });
        this.world.remove(object);
    }
}
