import { Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three/webgpu';
import { ConvexObjectBreaker } from 'three/addons/misc/ConvexObjectBreaker.js';
import { config } from './config.ts';
import type { ImpactHandler, Physics, Shape } from './physics.ts';
import type { World, WorldObject } from './world.ts';

// Where an object was hit, in its local space
interface Impact {
    point: Vector3;
    normal: Vector3;
}

// The fields ConvexObjectBreaker reads from a mesh it breaks, and sets on the pieces. Pieces too
// small to break again aren't breakable.
interface BreakerData {
    mass: number;
    velocity: Vector3;
    angularVelocity: Vector3;
    breakable: boolean;
}

type BreakerMesh = Mesh & { userData: BreakerData };

const position = new Vector3();
const inverse = new Quaternion();
// For the meshes the breaker cuts and makes, which are never drawn. Without one, each would make
// its own.
const breakerMaterial = new MeshBasicMaterial();

// Breaks breakable objects that are hit harder than their breakImpulse into debris. At most
// config.fracture.maxPerFrame objects break each frame, so a shot that hits several boxes
// doesn't stall a single frame; the rest wait in a queue.
export class Fracture {
    readonly world: World;
    readonly physics: Physics;
    readonly breaker = new ConvexObjectBreaker();
    // Object -> impact point and normal in the object's local space, which stay valid while it
    // moves
    readonly queue = new Map<WorldObject, Impact>();
    // Bound once, as it's called for every impact each frame
    readonly onImpact: ImpactHandler = (id0, id1, impulse, point, normal) => {
        this.enqueue(id0, impulse, point, normal);
        this.enqueue(id1, impulse, point, normal);
    };

    constructor(world: World, physics: Physics) {
        this.world = world;
        this.physics = physics;
    }

    canBreak(object: WorldObject | undefined): object is WorldObject {
        return object !== undefined && object.breakImpulse < Infinity && !this.queue.has(object);
    }

    enqueue(id: number, impulse: number, point: Vector3, normal: Vector3): void {
        const object = this.world.get(id);
        if (!this.canBreak(object) || impulse <= object.breakImpulse) return;
        // Where the body was hit, rather than where it's drawn, between steps
        this.physics.readPose(object.body, position, inverse);
        inverse.invert();
        this.queue.set(object, {
            point: point.clone().sub(position).applyQuaternion(inverse),
            normal: normal.clone().applyQuaternion(inverse),
        });
    }

    update(): void {
        this.physics.forEachImpact(this.onImpact);
        let remaining = config.fracture.maxPerFrame;
        for (const [object, impact] of this.queue) {
            if (remaining === 0) break;
            this.queue.delete(object);
            // It may have been removed while it waited
            if (!this.world.has(object)) continue;
            this.shatter(object, impact);
            remaining--;
        }
    }

    shatter(object: WorldObject, { point, normal }: Impact): void {
        // A mesh for the breaker to cut: where the body is, rather than where it's drawn, between
        // steps, so the debris starts where the body was, and with its velocity
        const mesh = new Mesh(object.geometry, breakerMaterial);
        this.physics.readPose(object.body, mesh.position, mesh.quaternion);
        mesh.updateMatrix();
        const data: BreakerData = {
            mass: object.mass,
            velocity: new Vector3(),
            angularVelocity: new Vector3(),
            breakable: true,
        };
        this.physics.readVelocity(object.body, data.velocity, data.angularVelocity);
        Object.assign(mesh.userData, data);
        point.applyQuaternion(mesh.quaternion).add(mesh.position);
        normal.applyQuaternion(mesh.quaternion);
        let debris: BreakerMesh[];
        let shapes: Shape[];
        try {
            debris = this.breaker.subdivideByImpact(
                mesh,
                point,
                normal,
                config.fracture.radialIterations,
                config.fracture.randomIterations,
            ) as BreakerMesh[];
            shapes = debris.map((piece) =>
                this.physics.createHullShape(piece.geometry.attributes.position.array),
            );
        } catch {
            // ConvexHull and Rapier throw on pieces with almost no volume, which a cut through an
            // edge or corner can leave. The object stays whole rather than the error stopping
            // the loop.
            return;
        }
        if (debris.length === 0) return;
        debris.forEach(({ geometry, position, quaternion, userData }, i) => {
            this.world.add(
                {
                    geometry,
                    colour: object.colour,
                    mass: userData.mass,
                    position,
                    quaternion,
                    velocity: userData.velocity,
                    angularVelocity: userData.angularVelocity,
                    breakImpulse: userData.breakable ? object.breakImpulse : undefined,
                    transient: true,
                },
                shapes[i],
            );
        });
        this.world.remove(object);
    }
}
