import { Vector3 } from 'three';
import { config } from './config.js';

// The Ammo.js (Bullet) physics world: the only module that uses Ammo. Each body has a numeric
// id, stored as its user index, which contact queries report. Shapes can be shared by bodies.
export class Physics {
    constructor(ammo) {
        this.ammo = ammo;
        // Reusable temporaries (Bullet copies their values)
        this.transform = new ammo.btTransform();
        this.vector = new ammo.btVector3(0, 0, 0);
        this.quaternion = new ammo.btQuaternion(0, 0, 0, 1);
        this.impactPoint = new Vector3();
        this.impactNormal = new Vector3();

        const collisionConfiguration = new ammo.btDefaultCollisionConfiguration();
        this.dispatcher = new ammo.btCollisionDispatcher(collisionConfiguration);
        this.world = new ammo.btDiscreteDynamicsWorld(
            this.dispatcher,
            new ammo.btDbvtBroadphase(),
            new ammo.btSequentialImpulseConstraintSolver(),
            collisionConfiguration,
        );
        this.vector.setValue(0, -config.physics.gravity, 0);
        this.world.setGravity(this.vector);
    }

    // A box collides at its size, but a hull collides at its size plus the margin. The margin
    // is added so boxes rest the same distance apart as debris, leaving visible gaps.
    createBoxShape(width, height, depth) {
        const { margin } = config.physics;
        this.vector.setValue(width / 2 + margin, height / 2 + margin, depth / 2 + margin);
        const shape = new this.ammo.btBoxShape(this.vector);
        shape.setMargin(margin);
        return shape;
    }

    createSphereShape(radius) {
        return new this.ammo.btSphereShape(radius);
    }

    // Takes a geometry's position array. Geometries repeat a vertex for each face that uses it,
    // and collision tests loop over every point in a hull, so duplicates are skipped.
    createHullShape(positions) {
        const shape = new this.ammo.btConvexHullShape();
        const seen = new Set();
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            const key = `${x},${y},${z}`;
            if (seen.has(key)) continue;
            seen.add(key);
            this.vector.setValue(x, y, z);
            shape.addPoint(this.vector, false);
        }
        shape.setMargin(config.physics.margin);
        shape.recalcLocalAabb();
        return shape;
    }

    destroyShape(shape) {
        this.ammo.destroy(shape);
    }

    // Takes three.js vectors and a quaternion, and returns a handle for the other body methods.
    // A mass of 0 makes the body static.
    addBody(id, shape, mass, position, quaternion, velocity, angularVelocity) {
        const { ammo, transform, vector } = this;
        transform.setIdentity();
        vector.setValue(position.x, position.y, position.z);
        transform.setOrigin(vector);
        this.quaternion.setValue(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        transform.setRotation(this.quaternion);
        const motionState = new ammo.btDefaultMotionState(transform);
        vector.setValue(0, 0, 0);
        shape.calculateLocalInertia(mass, vector);
        const info = new ammo.btRigidBodyConstructionInfo(mass, motionState, shape, vector);
        const body = new ammo.btRigidBody(info);
        ammo.destroy(info);
        body.setFriction(config.physics.friction);
        vector.setValue(velocity.x, velocity.y, velocity.z);
        body.setLinearVelocity(vector);
        vector.setValue(angularVelocity.x, angularVelocity.y, angularVelocity.z);
        body.setAngularVelocity(vector);
        body.setUserIndex(id);
        this.world.addRigidBody(body);
        return { body, motionState };
    }

    // Frees the body but not its shape
    removeBody({ body, motionState }) {
        this.world.removeRigidBody(body);
        this.ammo.destroy(body);
        this.ammo.destroy(motionState);
    }

    // Copies the body's transform into a three.js position and quaternion. Returns false,
    // without copying, if the body is asleep.
    readTransform({ body, motionState }, position, quaternion) {
        if (!body.isActive()) return false;
        motionState.getWorldTransform(this.transform);
        const origin = this.transform.getOrigin();
        const rotation = this.transform.getRotation();
        position.set(origin.x(), origin.y(), origin.z());
        quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
        return true;
    }

    readVelocity({ body }, velocity, angularVelocity) {
        const linear = body.getLinearVelocity();
        const angular = body.getAngularVelocity();
        velocity.set(linear.x(), linear.y(), linear.z());
        angularVelocity.set(angular.x(), angular.y(), angular.z());
    }

    step(delta) {
        this.world.stepSimulation(delta, config.physics.maxSubSteps);
    }

    // For each pair of touching bodies that accept(id0, id1) allows, finds the contact with the
    // largest impulse in the last step and calls onImpact(id0, id1, impulse, point, normal).
    // The point and normal are three.js vectors that are reused between calls.
    forEachImpact(accept, onImpact) {
        for (let i = 0, count = this.dispatcher.getNumManifolds(); i < count; i++) {
            const manifold = this.dispatcher.getManifoldByIndexInternal(i);
            const contacts = manifold.getNumContacts();
            if (contacts === 0) continue;
            const id0 = manifold.getBody0().getUserIndex();
            const id1 = manifold.getBody1().getUserIndex();
            if (!accept(id0, id1)) continue;
            let maxImpulse = 0;
            for (let j = 0; j < contacts; j++) {
                const contact = manifold.getContactPoint(j);
                if (contact.getDistance() >= 0) continue;
                const impulse = contact.getAppliedImpulse();
                if (impulse <= maxImpulse) continue;
                maxImpulse = impulse;
                const point = contact.get_m_positionWorldOnB();
                const normal = contact.get_m_normalWorldOnB();
                this.impactPoint.set(point.x(), point.y(), point.z());
                this.impactNormal.set(normal.x(), normal.y(), normal.z());
            }
            if (maxImpulse > 0) {
                onImpact(id0, id1, maxImpulse, this.impactPoint, this.impactNormal);
            }
        }
    }

    // Wakes bodies touching any of the given ids, so that removing those bodies doesn't leave
    // anything asleep in mid-air
    wakeTouching(ids) {
        for (let i = 0, count = this.dispatcher.getNumManifolds(); i < count; i++) {
            const manifold = this.dispatcher.getManifoldByIndexInternal(i);
            const body0 = manifold.getBody0();
            const body1 = manifold.getBody1();
            if (ids.has(body0.getUserIndex())) body1.activate();
            if (ids.has(body1.getUserIndex())) body0.activate();
        }
    }
}
