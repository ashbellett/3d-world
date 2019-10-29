import {
    Clock,
    WebGLRenderer,
    PerspectiveCamera,
    AmbientLight,
    DirectionalLight,
    Scene,
    Color,
    Mesh,
    Vector2,
    Vector3,
    Quaternion,
    BoxBufferGeometry,
    SphereBufferGeometry,
    MeshBasicMaterial,
    MeshLambertMaterial,
    MeshPhongMaterial,
    Raycaster
} from '../lib/three/three.module.js';
import { OrbitControls } from '../lib/three/OrbitControls.js';
import { ConvexObjectBreaker } from '../lib/three/ConvexObjectBreaker.js';

// Window
const maxWidth = 1280;
const maxHeight = 720;
// Camera
const fov = 60;
const near = 0.2;
const far = 2000.0;
// Physics
const gravity = 10;
// Objects
const margin = 0.02;
const friction = 0.5;
const fractureImpulse = 5;
// Projectile
const mass = 10;
const radius = 0.2;
const velocity = 50;
// World
const maxObjects = 200;

// TODO need to return a light, and then add to scene independently. Maybe same with objects/bodies

class Engine {
    constructor() {
        this.clock = new Clock();
        this.convexBreaker = new ConvexObjectBreaker();
        this.mousePosition = new Vector2();
        this.rayCaster = new Raycaster();
        this.width = Math.min(window.innerWidth, maxWidth);
        this.height = Math.min(window.innerHeight, maxHeight);
        this.aspectRatio = this.width/this.height;
        this.element = document.getElementById('entry');
        this.renderer = this.initRenderer();
        this.camera = this.initCamera(-16, 8, 16);
        this.controls = this.initControls(0, 0, 0);
        this.scene = this.initScene();
        this.transform = null;
        this.dispatcher = null;
        this.world = null;
        this.objects = [];
        this.animate = this.animate.bind(this);
    }

    start() {
        Ammo().then(ammo => {
            Ammo = ammo;
            this.init();
            this.initPhysics();
            this.initObjects();
            this.initEvents();
            this.animate();
        });
    }
    
    initRenderer() {
        let renderer = new WebGLRenderer({
            alpha: true,
            antialias: true
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(this.width, this.height);
        renderer.shadowMap.enabled = true;
        renderer.gammaInput = true;
        renderer.gammaOutput = true;
        return renderer;
    }
    
    initCamera(x, y, z) {
        let camera = new PerspectiveCamera(
            fov,
            this.aspectRatio,
            near,
            far
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
    
    lighting(type, colour, attributes) {
        let light;
        switch(type) {
            case 'ambient':
                light = new AmbientLight(colour);
                this.scene.add(light);
                break;
            case 'directional':
                light = new DirectionalLight(colour, attributes.intensity);
                light.position.set(attributes.x, attributes.y, attributes.z);
                light.castShadow = true;
                this.scene.add(light);
                break;
            case 'spotlight':
                light = new DirectionalLight(colour, attributes.intensity);
                light.position.set(attributes.x, attributes.y, attributes.z);
                light.castShadow = true;
                this.scene.add(light);
            default:
                break;
        }
    }

    init() {
        this.element.appendChild(this.renderer.domElement);
        this.controls.update();
        this.lighting('ambient', 0x808080);
        this.lighting('directional', 0xffffff, {intensity: 0.8, x: -20, y: 20, z: 20});
        this.camera.lookAt(0, 0, 0);
    }
    
    initPhysics() {
        this.transform = new Ammo.btTransform();
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
        this.world.setGravity(new Ammo.btVector3(0, -gravity, 0));
    }
    
    createShape(points) {
        let shape = new Ammo.btConvexHullShape();
        let vector = new Ammo.btVector3(0, 0, 0);
        for (let i = 0, length = points.length; i < length; i += 3) {
            vector.setValue(points[i], points[i+1], points[i+2]);
            let isLastPoint = (i >= (length-3));
            shape.addPoint(vector, isLastPoint);
        }
        return shape;
    }
    
    createBody(object, shape, mass, position, quaternion, velocity, angularVelocity) {
        if (position) {
            object.position.copy(position);
        } else {
            position = object.position;
        }
        if (quaternion) {
            object.quaternion.copy( quaternion );
        } else {
            quaternion = object.quaternion;
        }
        let transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(position.x, position.y, position.z));
        transform.setRotation(new Ammo.btQuaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w));
        let motionState = new Ammo.btDefaultMotionState(transform);
        let localInertia = new Ammo.btVector3(0, 0, 0);
        shape.calculateLocalInertia(mass, localInertia);
        let bodyInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
        let body = new Ammo.btRigidBody(bodyInfo);
        body.setFriction(friction);
        if (velocity) {
            body.setLinearVelocity(new Ammo.btVector3(velocity.x, velocity.y, velocity.z));
        }
        if (angularVelocity) {
            body.setAngularVelocity(new Ammo.btVector3(angularVelocity.x, angularVelocity.y, angularVelocity.z));
        }
        body.setActivationState(4);
        object.userData.body = body;
        object.userData.collided = false;
        this.scene.add(object);
        this.objects.push(object);
        this.world.addRigidBody(body);
        return body;
    }
    
    createObject(geometry, material, position, quaternion, mass, velocity, angularVelocity) {
        let object = new Mesh(geometry, material);
        object.position.copy(position);
        object.quaternion.copy(quaternion);
        object.castShadow = true;
        object.receiveShadow = true;
        this.convexBreaker.prepareBreakableObject(
            object,
            mass,
            new Vector3(),
            new Vector3(),
            true
        );
        let shape = this.createShape(object.geometry.attributes.position.array);
        shape.setMargin(margin);
        let body = this.createBody(
            object,
            shape,
            object.userData.mass,
            null,
            null,
            velocity || object.userData.velocity,
            angularVelocity || object.userData.angularVelocity
        );
        
        let vector = new Ammo.btVector3(0, 0, 0);
        vector.object = object;
        body.setUserPointer(vector);
    }
    
    createGeometry(type, attributes) {
        switch(type) {
            case 'box':
                return new BoxBufferGeometry(attributes.x, attributes.y, attributes.z);
            case 'sphere':
                return new SphereBufferGeometry(attributes.radius, 32);
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
        let geometry = this.createGeometry('box', {x: 64, y: 1, z: 64});
        let material = this.createMaterial('lambert', 0xeeeeee);
        let position = new Vector3();
        position.set(0, 0, 0);
        let quaternion = new Quaternion();
        quaternion.set(0, 0, 0, 1)
        let mass = 0;
        this.createObject(geometry, material, position, quaternion, mass, 0, 0);

        material = this.createMaterial('lambert', 0x0D8C73);
        position = new Vector3();
        quaternion = new Quaternion();
        quaternion.set(0, 0, 0, 1)
        mass = 2;
        for (let i = -2; i < 2; i++) {
            for (let j = 0; j < 4; j++) {
                for (let k = -2; k < 2; k++) {
                    geometry = this.createGeometry('box', {x: 2, y: 2, z: 2});
                    position.set(i, j+2, k);
                    this.createObject(geometry, material, position, quaternion, mass, 0, 0);
                }
            }
        }
    }
    
    initEvents() {
        window.addEventListener('resize', () => {
            this.camera.aspect =
                Math.min(window.innerWidth, maxWidth)/
                Math.min(window.innerHeight, maxHeight);
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(
                Math.min(window.innerWidth, maxWidth),
                Math.min(window.innerHeight, maxHeight)
            );
        }, false);
        this.element.addEventListener('mousedown', (event) => {
            this.mousePosition.set(
                (event.clientX/Math.min(window.innerWidth, maxWidth))*2-1,
                -(event.clientY/Math.min(window.innerHeight, maxHeight))*2+1
            );
            this.shoot();
        }, false);
        this.element.addEventListener('touchstart', (event) => {
            this.mousePosition.set(
                (event.touches[0].clientX/Math.min(window.innerWidth, maxWidth))*2-1,
                -(event.touches[0].clientY/Math.min(window.innerHeight, maxHeight))*2+1
            );
            this.shoot();
        }, false);
    }
    
    shoot() {
        let projectile = {};
        projectile.mass = mass;
        projectile.position = new Vector3();
        projectile.quaternion = new Quaternion();
        projectile.velocity = new Vector3();
        this.rayCaster.setFromCamera(this.mousePosition, this.camera);
        projectile.position
        .copy(this.rayCaster.ray.direction)
        .add(this.rayCaster.ray.origin);
        projectile.velocity
        .copy(this.rayCaster.ray.direction)
        .multiplyScalar(velocity);
        projectile.geometry = this.createGeometry('sphere', {radius: radius});
        projectile.material = this.createMaterial('phong', 0x202020);
        this.createObject(
            projectile.geometry,
            projectile.material,
            projectile.position,
            projectile.quaternion,
            projectile.mass,
            projectile.velocity,
            0
        );
    }

    removeObject(object) {
        this.scene.remove(object);
        this.world.removeRigidBody(object.userData.body);
    }

    createDebris(object) {
        object.castShadow = true;
        object.receiveShadow = true;
        let shape = this.createShape(object.geometry.attributes.position.array);
        shape.setMargin(margin);
        let body = this.createBody(
            object,
            shape,
            object.userData.mass,
            null,
            null,
            object.userData.velocity,
            object.userData.angularVelocity
        );
        let vector = new Ammo.btVector3(0, 0, 0);
        vector.object = object;
        body.setUserPointer(vector);
    }

    animate() {
        requestAnimationFrame(this.animate);
        this.step(this.clock.getDelta());
        this.renderer.render(this.scene, this.camera);
    }
    
    step(time) {
        this.world.stepSimulation(time, 10);
        let impactPoint = new Vector3();
        let impactNormal = new Vector3();
        let objectsToRemove = [];
        let numObjectsToRemove = 0;
        for (let i = 0; i < maxObjects; i++) {
            objectsToRemove[i] = null;
        }
        for (let i = 0; i < this.objects.length; i++) {
            let object = this.objects[i];
            let body = object.userData.body;
            let motionState = body.getMotionState();
            if (motionState) {
                motionState.getWorldTransform(this.transform);
                let origin = this.transform.getOrigin();
                let quaternion = this.transform.getRotation();
                object.position.set(
                    origin.x(),
                    origin.y(),
                    origin.z()
                );
                object.quaternion.set(
                    quaternion.x(),
                    quaternion.y(),
                    quaternion.z(),
                    quaternion.w()
                );
                object.userData.collided = false;
            }
        }
        for (let i = 0; i < this.dispatcher.getNumManifolds(); i++) {
            let contactManifold = this.dispatcher.getManifoldByIndexInternal(i);
            let body0 = Ammo.castObject(contactManifold.getBody0(), Ammo.btRigidBody);
            let body1 = Ammo.castObject(contactManifold.getBody1(), Ammo.btRigidBody);
            let object0 = Ammo.castObject(body0.getUserPointer(), Ammo.btVector3).object;
            let object1 = Ammo.castObject(body1.getUserPointer(), Ammo.btVector3).object;
            if (!object0 && !object1) continue;
            let data0 = object0 ? object0.userData : null;
            let data1 = object1 ? object1.userData : null;
            let breakable0 = data0 ? data0.breakable : false;
            let breakable1 = data1 ? data1.breakable : false;
            let collided0 = data0 ? data0.collided : false;
            let collided1 = data1 ? data1.collided : false;
            if ((!breakable0 && !breakable1) || (collided0 && collided1)) continue;
            let contact = false;
            let maxImpulse = 0;
            for (let j = 0; j < contactManifold.getNumContacts(); j++) {
                let contactPoint = contactManifold.getContactPoint(j);
                if (contactPoint.getDistance() < 0) {
                    contact = true;
                    let impulse = contactPoint.getAppliedImpulse();
                    if (impulse > maxImpulse) {
                        maxImpulse = impulse;
                        let position = contactPoint.get_m_positionWorldOnB();
                        let normal = contactPoint.get_m_normalWorldOnB();
                        impactPoint.set(position.x(), position.y(), position.z());
                        impactNormal.set(normal.x(), normal.y(), normal.z());
                    }
                    break;
                }
            }
            if (!contact) continue;
            if (breakable0 && !collided0 && maxImpulse > fractureImpulse) {
                let debrisObject = this.convexBreaker.subdivideByImpact(
                    object0,
                    impactPoint,
                    impactNormal,
                    1,
                    2,
                    1.5
                );
                for (let j = 0; j < debrisObject.length; j++) {
                    let velocity = body0.getLinearVelocity();
                    let angularVelocity = body0.getAngularVelocity();
                    let fragment = debrisObject[j];
                    fragment.userData.velocity.set(velocity.x(), velocity.y(), velocity.z());
                    fragment.userData.angularVelocity.set(angularVelocity.x(), angularVelocity.y(), angularVelocity.z());
                    this.createDebris(fragment);
                }
                objectsToRemove[numObjectsToRemove++] = object0;
                data0.collided = true;
            }
            if (breakable1 && ! collided1 && maxImpulse > fractureImpulse) {
                let debrisObject = this.convexBreaker.subdivideByImpact(
                    object1,
                    impactPoint,
                    impactNormal,
                    1,
                    2,
                    1.5
                );
                for (let j = 0; j < debrisObject.length; j++) {
                    let velocity = body1.getLinearVelocity();
                    let angularVelocity = body1.getAngularVelocity();
                    let fragment = debrisObject[j];
                    fragment.userData.velocity.set(velocity.x(), velocity.y(), velocity.z());
                    fragment.userData.angularVelocity.set(angularVelocity.x(), angularVelocity.y(), angularVelocity.z());
                    this.createDebris(fragment);
                }
                objectsToRemove[numObjectsToRemove++] = object1;
                data1.collided = true;
            }
        }
        for (let i = 0; i < numObjectsToRemove; i++) {
            this.removeObject(objectsToRemove[i]);
        }
        numObjectsToRemove = 0;
    }
}

let engine = new Engine();
engine.start();
