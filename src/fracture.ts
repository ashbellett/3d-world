import type { Vector3 } from 'three/webgpu';
import { Quaternion } from 'three/webgpu';
import { ConvexObjectBreaker } from 'three/addons/misc/ConvexObjectBreaker.js';
import { config } from './config.ts';
import type { ContactFilter, ImpactHandler, Physics } from './physics.ts';
import type { BodyMesh, World, WorldObject } from './world.ts';

// Where an object was hit, in its local space
interface Impact {
    point: Vector3;
    normal: Vector3;
}

const inverse = new Quaternion();

// Breaks breakable objects that are hit harder than their breakImpulse into debris. At most
// config.fracture.maxPerFrame objects break each frame, so a shot that hits several boxes
// doesn't stall a single frame; the rest wait in a queue.
export class Fracture {
    readonly world: World;
    readonly physics: Physics;
    readonly breaker = new ConvexObjectBreaker();
    // Mesh -> impact point and normal in the mesh's local space, which stay valid while the
    // mesh moves
    readonly queue = new Map<WorldObject, Impact>();
    // Bound once, as they're called for every contact each frame
    readonly accept: ContactFilter = (id0, id1) =>
        this.canBreak(this.world.get(id0)) || this.canBreak(this.world.get(id1));
    readonly onImpact: ImpactHandler = (id0, id1, impulse, point, normal) => {
        this.enqueue(id0, impulse, point, normal);
        this.enqueue(id1, impulse, point, normal);
    };

    constructor(world: World, physics: Physics) {
        this.world = world;
        this.physics = physics;
    }

    canBreak(mesh: WorldObject | undefined): mesh is WorldObject {
        return mesh !== undefined && mesh.userData.breakable && !this.queue.has(mesh);
    }

    enqueue(id: number, impulse: number, point: Vector3, normal: Vector3): void {
        const mesh = this.world.get(id);
        if (!this.canBreak(mesh) || impulse <= mesh.userData.breakImpulse) return;
        inverse.copy(mesh.quaternion).invert();
        this.queue.set(mesh, {
            point: point.clone().sub(mesh.position).applyQuaternion(inverse),
            normal: normal.clone().applyQuaternion(inverse),
        });
    }

    update(): void {
        this.physics.forEachImpact(this.accept, this.onImpact);
        let remaining = config.fracture.maxPerFrame;
        for (const [mesh, impact] of this.queue) {
            if (remaining === 0) break;
            this.queue.delete(mesh);
            // It may have been removed while it waited
            if (!this.world.has(mesh)) continue;
            this.shatter(mesh, impact);
            remaining--;
        }
    }

    shatter(mesh: WorldObject, { point, normal }: Impact): void {
        const data = mesh.userData;
        point.applyQuaternion(mesh.quaternion).add(mesh.position);
        normal.applyQuaternion(mesh.quaternion);
        // The debris takes the object's velocity
        this.physics.readVelocity(data.body, data.velocity, data.angularVelocity);
        // The breaker uses the local matrix, which is otherwise only updated when rendering
        mesh.updateMatrix();
        let debris;
        try {
            debris = this.breaker.subdivideByImpact(
                mesh,
                point,
                normal,
                config.fracture.radialIterations,
                config.fracture.randomIterations,
            );
        } catch {
            // ConvexHull throws on pieces with almost no volume, which a cut through an edge or
            // corner can leave. The object stays whole rather than the error stopping the loop.
            return;
        }
        if (debris.length === 0) return;
        for (const fragment of debris as BodyMesh[]) {
            fragment.userData.breakImpulse = data.breakImpulse;
            const shape = this.physics.createHullShape(fragment.geometry.attributes.position.array);
            this.world.add(fragment, shape, { transient: true });
        }
        this.world.remove(mesh);
    }
}
