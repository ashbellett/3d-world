import {
    Timer,
    WebGLRenderer,
    PerspectiveCamera,
    AmbientLight,
    DirectionalLight,
    SpotLight,
    Scene,
    Color,
    Mesh,
    Vector2,
    Vector3,
    BoxGeometry,
    SphereGeometry,
    MeshBasicMaterial,
    MeshLambertMaterial,
    MeshPhongMaterial,
    Raycaster
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ConvexObjectBreaker } from 'three/addons/misc/ConvexObjectBreaker.js';

const config = {
    window: {
        maxWidth: 1280,
        maxHeight: 720,
        maxPixelRatio: 2
    },
    camera: {
        fov: 60,
        near: 0.2,
        far: 2000.0
    },
    physics: {
        gravity: 10,
        maxSubSteps: 10
    },
    objects: {
        margin: 0.02,
        friction: 0.5,
        fractureImpulse: 5
    },
    projectile: {
        mass: 10,
        radius: 0.2,
        speed: 50
    },
    world: {
        // Oldest projectiles and debris are removed beyond this many objects
        maxObjects: 200,
        // Objects that fall below this height are removed
        minY: -20
    },
    input: {
        // Pointer movement (px) beyond which a press counts as a camera drag, not a shot
        maxClickDistance: 5
    }
};

class Engine {
    constructor() {
        this.timer = new Timer();
        this.timer.connect(document);
        this.convexBreaker = new ConvexObjectBreaker();
        this.pointer = new Vector2();
        this.pointerStart = new Vector2();
        this.isClick = false;
        this.rayCaster = new Raycaster();
        this.resize();
        this.element = document.getElementById('entry');
        this.renderer = this.initRenderer();
        this.camera = this.initCamera(-16, 8, 16);
        this.controls = this.initControls(0, 0, 0);
        this.scene = this.initScene();
        this.dispatcher = null;
        this.world = null;
        // Reusable Ammo temporaries (Bullet copies their values)
        this.transform = null;
        this.vector = null;
        this.quaternion = null;
        // Rigid body user index -> mesh, in creation order
        this.objects = new Map();
        this.nextId = 0;
        this.objectsToRemove = new Set();
        this.impactPoint = new Vector3();
        this.impactNormal = new Vector3();
        this.zeroVector = new Vector3();
        this.projectileGeometry = this.createGeometry('sphere', {radius: config.projectile.radius});
        this.projectileMaterial = this.createMaterial('phong', 0x636363);
        this.animate = this.animate.bind(this);
    }

    start() {
        Ammo().then(ammo => {
            Ammo = ammo;
            this.init();
            this.initPhysics();
            this.initObjects();
            this.initEvents();
            // Don't count Ammo's loading time in the first physics step
            this.timer.reset();
            this.renderer.setAnimationLoop(this.animate);
        });
    }

    resize() {
        this.width = Math.min(window.innerWidth, config.window.maxWidth);
        this.height = Math.min(window.innerHeight, config.window.maxHeight);
        this.aspectRatio = this.width/this.height;
    }

    initRenderer() {
        let renderer = new WebGLRenderer({
            antialias: true
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.window.maxPixelRatio));
        renderer.setSize(this.width, this.height);
        renderer.shadowMap.enabled = true;
        return renderer;
    }

    initCamera(x, y, z) {
        let camera = new PerspectiveCamera(
            config.camera.fov,
            this.aspectRatio,
            config.camera.near,
            config.camera.far
        );
        camera.position.set(x, y, z);
        return camera;
    }

    initControls(x, y, z) {
        let controls = new OrbitControls(this.camera, this.renderer.domElement);
        controls.target.set(x, y, z);
        return controls;
    }

    initScene() {
        let scene = new Scene();
        scene.background = new Color(0xbfd1e5);
        return scene;
    }

    // Intensities are physically based (three.js r155+), hence the factors of PI
    lighting(type, colour, attributes) {
        let light;
        switch(type) {
            case 'ambient':
                light = new AmbientLight(colour, attributes.intensity);
                break;
            case 'directional':
                light = new DirectionalLight(colour, attributes.intensity);
                light.position.set(attributes.x, attributes.y, attributes.z);
                light.castShadow = true;
                // Cover the whole floor with the shadow camera
                light.shadow.camera.left = -attributes.shadowSize;
                light.shadow.camera.right = attributes.shadowSize;
                light.shadow.camera.top = attributes.shadowSize;
                light.shadow.camera.bottom = -attributes.shadowSize;
                light.shadow.camera.far = 100;
                light.shadow.mapSize.set(2048, 2048);
                light.shadow.normalBias = 0.02;
                break;
            case 'spotlight':
                light = new SpotLight(colour, attributes.intensity);
                light.position.set(attributes.x, attributes.y, attributes.z);
                light.castShadow = true;
                break;
            default:
                return;
        }
        this.scene.add(light);
    }

    init() {
        this.element.appendChild(this.renderer.domElement);
        this.controls.update();
        this.lighting('ambient', 0xbcbcbc, {intensity: Math.PI});
        this.lighting('directional', 0xffffff, {intensity: 0.8*Math.PI, x: -20, y: 20, z: 20, shadowSize: 32});
        this.camera.lookAt(0, 0, 0);
    }

    initPhysics() {
        this.transform = new Ammo.btTransform();
        this.vector = new Ammo.btVector3(0, 0, 0);
        this.quaternion = new Ammo.btQuaternion(0, 0, 0, 1);
        let collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
        this.dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
        let broadphase = new Ammo.btDbvtBroadphase();
        let solver = new Ammo.btSequentialImpulseConstraintSolver();
        this.world = new Ammo.btDiscreteDynamicsWorld(
            this.dispatcher,
            broadphase,
            solver,
            collisionConfiguration
        );
        this.vector.setValue(0, -config.physics.gravity, 0);
        this.world.setGravity(this.vector);
    }

    createHullShape(geometry) {
        let shape = new Ammo.btConvexHullShape();
        let points = geometry.attributes.position.array;
        for (let i = 0, length = points.length; i < length; i += 3) {
            this.vector.setValue(points[i], points[i+1], points[i+2]);
            let isLastPoint = (i >= (length-3));
            shape.addPoint(this.vector, isLastPoint);
        }
        shape.setMargin(config.objects.margin);
        return shape;
    }

    createMesh(geometry, material, position, mass, breakable) {
        let object = new Mesh(geometry, material);
        object.position.copy(position);
        this.convexBreaker.prepareBreakableObject(
            object,
            mass,
            this.zeroVector,
            this.zeroVector,
            breakable
        );
        return object;
    }

    // Adds a mesh prepared by ConvexObjectBreaker to the scene and physics world
    addObject(object, shape) {
        let {mass, velocity, angularVelocity} = object.userData;
        let position = object.position;
        let quaternion = object.quaternion;
        object.castShadow = true;
        object.receiveShadow = true;
        this.transform.setIdentity();
        this.vector.setValue(position.x, position.y, position.z);
        this.transform.setOrigin(this.vector);
        this.quaternion.setValue(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        this.transform.setRotation(this.quaternion);
        let motionState = new Ammo.btDefaultMotionState(this.transform);
        this.vector.setValue(0, 0, 0);
        shape.calculateLocalInertia(mass, this.vector);
        let bodyInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, this.vector);
        let body = new Ammo.btRigidBody(bodyInfo);
        Ammo.destroy(bodyInfo);
        body.setFriction(config.objects.friction);
        this.vector.setValue(velocity.x, velocity.y, velocity.z);
        body.setLinearVelocity(this.vector);
        this.vector.setValue(angularVelocity.x, angularVelocity.y, angularVelocity.z);
        body.setAngularVelocity(this.vector);
        let id = this.nextId++;
        body.setUserIndex(id);
        object.userData.id = id;
        object.userData.body = body;
        object.userData.motionState = motionState;
        object.userData.shape = shape;
        object.userData.collided = false;
        this.objects.set(id, object);
        this.scene.add(object);
        this.world.addRigidBody(body);
    }

    createGeometry(type, attributes) {
        switch(type) {
            case 'box':
                return new BoxGeometry(attributes.x, attributes.y, attributes.z);
            case 'sphere':
                return new SphereGeometry(attributes.radius, 32);
            default:
                break;
        }
    }

    createMaterial(type, colour) {
        switch(type) {
            case 'basic':
                return new MeshBasicMaterial({color: colour});
            case 'lambert':
                return new MeshLambertMaterial({color: colour});
            case 'phong':
                return new MeshPhongMaterial({color: colour});
            default:
                break;
        }
    }

    initObjects() {
        let position = new Vector3();
        let geometry = this.createGeometry('box', {x: 64, y: 1, z: 64});
        let material = this.createMaterial('lambert', 0xf7f7f7);
        let ground = this.createMesh(geometry, material, position, 0, false);
        this.addObject(ground, this.createHullShape(geometry));

        let size = 2;
        // Leave room for the collision margins so the stack starts at rest
        let gap = 0.05;
        let spacing = size+gap;
        material = this.createMaterial('lambert', 0x40c4b3);
        for (let i = -2; i < 2; i++) {
            for (let j = 0; j < 4; j++) {
                for (let k = -2; k < 2; k++) {
                    geometry = this.createGeometry('box', {x: size, y: size, z: size});
                    // Ground top is at y = 0.5
                    position.set((i+0.5)*spacing, (j+0.5)*spacing+0.5+gap, (k+0.5)*spacing);
                    let box = this.createMesh(geometry, material, position, 2, true);
                    this.addObject(box, this.createHullShape(geometry));
                }
            }
        }
    }

    initEvents() {
        window.addEventListener('resize', () => {
            this.resize();
            this.camera.aspect = this.aspectRatio;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.width, this.height);
        }, false);
        // Shoot on a click or tap, but not at the end of a camera drag or pinch
        let canvas = this.renderer.domElement;
        canvas.addEventListener('pointerdown', (event) => {
            if (event.isPrimary && event.button === 0) {
                this.isClick = true;
                this.pointerStart.set(event.clientX, event.clientY);
            } else {
                this.isClick = false;
            }
        }, false);
        canvas.addEventListener('pointerup', (event) => {
            if (!event.isPrimary || !this.isClick) return;
            this.isClick = false;
            let distance = Math.hypot(
                event.clientX-this.pointerStart.x,
                event.clientY-this.pointerStart.y
            );
            if (distance > config.input.maxClickDistance) return;
            let rect = canvas.getBoundingClientRect();
            this.pointer.set(
                ((event.clientX-rect.left)/rect.width)*2-1,
                -((event.clientY-rect.top)/rect.height)*2+1
            );
            this.shoot();
        }, false);
    }

    shoot() {
        this.rayCaster.setFromCamera(this.pointer, this.camera);
        let ray = this.rayCaster.ray;
        let position = new Vector3().copy(ray.direction).add(ray.origin);
        let projectile = this.createMesh(
            this.projectileGeometry,
            this.projectileMaterial,
            position,
            config.projectile.mass,
            false
        );
        projectile.userData.velocity.copy(ray.direction).multiplyScalar(config.projectile.speed);
        projectile.userData.transient = true;
        this.addObject(projectile, new Ammo.btSphereShape(config.projectile.radius));
    }

    breakObject(object) {
        let body = object.userData.body;
        let velocity = body.getLinearVelocity();
        let angularVelocity = body.getAngularVelocity();
        let debris = this.convexBreaker.subdivideByImpact(
            object,
            this.impactPoint,
            this.impactNormal,
            1,
            2
        );
        if (debris.length === 0) return;
        for (let fragment of debris) {
            fragment.userData.velocity.set(velocity.x(), velocity.y(), velocity.z());
            fragment.userData.angularVelocity.set(angularVelocity.x(), angularVelocity.y(), angularVelocity.z());
            fragment.userData.transient = true;
            this.addObject(fragment, this.createHullShape(fragment.geometry));
        }
        object.userData.collided = true;
        this.objectsToRemove.add(object);
    }

    removeObject(object) {
        let {id, body, motionState, shape} = object.userData;
        this.world.removeRigidBody(body);
        Ammo.destroy(body);
        Ammo.destroy(motionState);
        Ammo.destroy(shape);
        this.scene.remove(object);
        if (object.geometry !== this.projectileGeometry) {
            object.geometry.dispose();
        }
        this.objects.delete(id);
    }

    removeObjects() {
        if (this.objectsToRemove.size === 0) return;
        // Wake bodies touching removed ones so nothing is left asleep in mid-air
        for (let i = 0, count = this.dispatcher.getNumManifolds(); i < count; i++) {
            let contactManifold = this.dispatcher.getManifoldByIndexInternal(i);
            let body0 = contactManifold.getBody0();
            let body1 = contactManifold.getBody1();
            if (this.objectsToRemove.has(this.objects.get(body0.getUserIndex()))) body1.activate();
            if (this.objectsToRemove.has(this.objects.get(body1.getUserIndex()))) body0.activate();
        }
        for (let object of this.objectsToRemove) {
            this.removeObject(object);
        }
        this.objectsToRemove.clear();
    }

    // Queues the oldest projectiles and debris for removal beyond the object limit
    limitObjects() {
        let excess = this.objects.size-this.objectsToRemove.size-config.world.maxObjects;
        for (let object of this.objects.values()) {
            if (excess <= 0) break;
            if (!object.userData.transient || this.objectsToRemove.has(object)) continue;
            this.objectsToRemove.add(object);
            excess--;
        }
    }

    animate(timestamp) {
        this.timer.update(timestamp);
        this.step(this.timer.getDelta());
        this.renderer.render(this.scene, this.camera);
    }

    updateObjects() {
        for (let object of this.objects.values()) {
            let body = object.userData.body;
            object.userData.collided = false;
            if (!body.isActive()) continue;
            body.getMotionState().getWorldTransform(this.transform);
            let origin = this.transform.getOrigin();
            let quaternion = this.transform.getRotation();
            object.position.set(origin.x(), origin.y(), origin.z());
            object.quaternion.set(
                quaternion.x(),
                quaternion.y(),
                quaternion.z(),
                quaternion.w()
            );
            if (object.position.y < config.world.minY) {
                this.objectsToRemove.add(object);
            }
        }
    }

    handleCollisions() {
        for (let i = 0, count = this.dispatcher.getNumManifolds(); i < count; i++) {
            let contactManifold = this.dispatcher.getManifoldByIndexInternal(i);
            let object0 = this.objects.get(contactManifold.getBody0().getUserIndex());
            let object1 = this.objects.get(contactManifold.getBody1().getUserIndex());
            if (!object0 || !object1) continue;
            let data0 = object0.userData;
            let data1 = object1.userData;
            let breakable0 = data0.breakable && !data0.collided;
            let breakable1 = data1.breakable && !data1.collided;
            if (!breakable0 && !breakable1) continue;
            let maxImpulse = 0;
            for (let j = 0, contacts = contactManifold.getNumContacts(); j < contacts; j++) {
                let contactPoint = contactManifold.getContactPoint(j);
                if (contactPoint.getDistance() >= 0) continue;
                let impulse = contactPoint.getAppliedImpulse();
                if (impulse > maxImpulse) {
                    maxImpulse = impulse;
                    let position = contactPoint.get_m_positionWorldOnB();
                    let normal = contactPoint.get_m_normalWorldOnB();
                    this.impactPoint.set(position.x(), position.y(), position.z());
                    this.impactNormal.set(normal.x(), normal.y(), normal.z());
                }
            }
            if (maxImpulse <= config.objects.fractureImpulse) continue;
            if (breakable0) this.breakObject(object0);
            if (breakable1) this.breakObject(object1);
        }
    }

    step(delta) {
        this.world.stepSimulation(delta, config.physics.maxSubSteps);
        this.updateObjects();
        this.handleCollisions();
        this.limitObjects();
        this.removeObjects();
    }
}

let engine = new Engine();
engine.start();
