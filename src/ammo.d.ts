// Types for the global Ammo, defined by public/lib/ammo/ammo.wasm.js, which has none of its own.
// Covers only the parts physics.ts uses, following the build's WebIDL interface (ammo.idl).

declare namespace Ammo {
    class btVector3 {
        constructor(x?: number, y?: number, z?: number);
        x(): number;
        y(): number;
        z(): number;
        setValue(x: number, y: number, z: number): void;
    }

    class btQuaternion {
        constructor(x: number, y: number, z: number, w: number);
        x(): number;
        y(): number;
        z(): number;
        w(): number;
        setValue(x: number, y: number, z: number, w: number): void;
    }

    class btTransform {
        constructor();
        setIdentity(): void;
        setOrigin(origin: btVector3): void;
        setRotation(rotation: btQuaternion): void;
        getOrigin(): btVector3;
        getRotation(): btQuaternion;
    }

    class btMotionState {
        getWorldTransform(worldTrans: btTransform): void;
    }

    class btDefaultMotionState extends btMotionState {
        constructor(startTrans?: btTransform);
    }

    class btCollisionShape {
        setMargin(margin: number): void;
        calculateLocalInertia(mass: number, inertia: btVector3): void;
    }

    class btBoxShape extends btCollisionShape {
        constructor(boxHalfExtents: btVector3);
    }

    class btSphereShape extends btCollisionShape {
        constructor(radius: number);
    }

    class btConvexHullShape extends btCollisionShape {
        constructor();
        addPoint(point: btVector3, recalculateLocalAABB?: boolean): void;
        recalcLocalAabb(): void;
    }

    class btCollisionObject {
        activate(forceActivation?: boolean): void;
        isActive(): boolean;
        setFriction(friction: number): void;
        getUserIndex(): number;
        setUserIndex(index: number): void;
    }

    class btRigidBodyConstructionInfo {
        constructor(
            mass: number,
            motionState: btMotionState,
            collisionShape: btCollisionShape,
            localInertia?: btVector3,
        );
    }

    class btRigidBody extends btCollisionObject {
        constructor(constructionInfo: btRigidBodyConstructionInfo);
        getLinearVelocity(): btVector3;
        getAngularVelocity(): btVector3;
        setLinearVelocity(linearVelocity: btVector3): void;
        setAngularVelocity(angularVelocity: btVector3): void;
    }

    class btManifoldPoint {
        getDistance(): number;
        getAppliedImpulse(): number;
        get_m_positionWorldOnB(): btVector3;
        get_m_normalWorldOnB(): btVector3;
    }

    class btPersistentManifold {
        getBody0(): btCollisionObject;
        getBody1(): btCollisionObject;
        getNumContacts(): number;
        getContactPoint(index: number): btManifoldPoint;
    }

    class btDefaultCollisionConfiguration {
        constructor();
    }

    class btCollisionDispatcher {
        constructor(collisionConfiguration: btDefaultCollisionConfiguration);
        getNumManifolds(): number;
        getManifoldByIndexInternal(index: number): btPersistentManifold;
    }

    class btDbvtBroadphase {
        constructor();
    }

    class btSequentialImpulseConstraintSolver {
        constructor();
    }

    class btDiscreteDynamicsWorld {
        constructor(
            dispatcher: btCollisionDispatcher,
            pairCache: btDbvtBroadphase,
            constraintSolver: btSequentialImpulseConstraintSolver,
            collisionConfiguration: btDefaultCollisionConfiguration,
        );
        setGravity(gravity: btVector3): void;
        addRigidBody(body: btRigidBody): void;
        removeRigidBody(body: btRigidBody): void;
        stepSimulation(timeStep: number, maxSubSteps?: number, fixedTimeStep?: number): number;
    }

    // Frees an object made with new
    function destroy(object: object): void;
}

// Loads the WebAssembly module and resolves to the namespace above
declare function Ammo(): Promise<typeof Ammo>;
