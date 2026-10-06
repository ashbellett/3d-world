import { Quaternion } from 'three';
import { ConvexObjectBreaker } from 'three/addons/misc/ConvexObjectBreaker.js';
import { config } from './config.js';

const inverse = new Quaternion();

// Breaks breakable objects that are hit hard enough into debris. At most
// config.fracture.maxPerFrame objects break each frame, so a shot that hits several boxes
// doesn't stall a single frame; the rest wait in a queue.
export class Fracture {
    constructor(world, physics) {
        this.world = world;
        this.physics = physics;
        this.breaker = new ConvexObjectBreaker();
        // Mesh -> impact point and normal in the mesh's local space, which stay valid while
        // the mesh moves
        this.queue = new Map();
        // Bound once, as they're called for every contact each frame
        this.accept = (id0, id1) => this.canBreak(id0) || this.canBreak(id1);
        this.onImpact = (id0, id1, impulse, point, normal) => {
            if (impulse <= config.fracture.impulse) return;
            this.enqueue(id0, point, normal);
            this.enqueue(id1, point, normal);
        };
    }

    canBreak(id) {
        const mesh = this.world.get(id);
        return mesh !== undefined && mesh.userData.breakable && !this.queue.has(mesh);
    }

    enqueue(id, point, normal) {
        if (!this.canBreak(id)) return;
        const mesh = this.world.get(id);
        inverse.copy(mesh.quaternion).invert();
        this.queue.set(mesh, {
            point: point.clone().sub(mesh.position).applyQuaternion(inverse),
            normal: normal.clone().applyQuaternion(inverse),
        });
    }

    update() {
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

    shatter(mesh, { point, normal }) {
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
        for (const fragment of debris) {
            const shape = this.physics.createHullShape(fragment.geometry.attributes.position.array);
            this.world.add(fragment, shape, { transient: true });
        }
        this.world.remove(mesh);
    }
}
