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
import { ConvexGeometry } from '../lib/three/ConvexGeometry.js';
import { ConvexHull } from '../lib/three/ConvexHull.js';

// Window
const maxWidth = 1280;
const maxHeight = 720;
const width = Math.min(window.innerWidth, maxWidth);
const height = Math.min(window.innerHeight, maxHeight);
const aspectRatio = width/height;
// Camera
const fov = 75;
const near = 0.2;
const far = 2000.0;
// Physics
const gravity = 10;
const friction = 0.5;
// Objects
const fractureImpulse = 200;
const projectileMass = 50;
const projectileRadius = 0.5;
const projectileInitialVelocity = 100;
// World
const margin = 0.05;
const maxObjects = 500;

// TODO need to return a light, and then add to scene independently. Maybe same with objects/bodies

class Engine {
    constructor() {
        this.clock = new Clock();
        this.convexBreaker = new ConvexObjectBreaker();
        this.mousePosition = new Vector2();
        this.rayCaster = new Raycaster();
        this.renderer = this.initRenderer();
        this.camera = this.initCamera(-14, 8, 16);
        this.controls = this.initControls(0, 2, 0);
        this.scene = this.initScene();
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
        let renderer = new WebGLRenderer();
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, height);
        renderer.shadowMap.enabled = true;
        return renderer;
    }
    
    initCamera(x, y, z) {
        let camera = new PerspectiveCamera(
            fov,
            aspectRatio,
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
                const d = 100;
                light = new DirectionalLight(colour, attributes.intensity);
                light.position.set(attributes.x, attributes.y, attributes.z);
                light.castShadow = true;
                light.shadow.camera.left = -d;
                light.shadow.camera.right = d;
                light.shadow.camera.top = d;
                light.shadow.camera.bottom = -d;
                light.shadow.camera.near = 2;
                light.shadow.camera.far = 100;
                light.shadow.mapSize.x = 1024;
                light.shadow.mapSize.y = 1024;
                this.scene.add(light);
                break;
            default:
                break;
        }
    }

    init() {
        let element = document.getElementById('entry');
        element.appendChild(this.renderer.domElement);
        this.controls.update();
        this.lighting('ambient', 0x808080);
        this.lighting('directional', 0xffffff, {intensity: 1, x: -10, y: 18, z: 5});
    }
    
    initPhysics() {
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
        this.world.addRigidBody(body);
        return body;
    }
    
    createObject(geometry, material, position, quaternion, mass) {
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
        let body = this.createBody(object, shape, object.userData.mass, null, null, object.userData.velocity, object.userData.angularVelocity);
        object.userData.body = body;
        object.userData.isCollided = false;
        this.scene.add(object);
        this.objects.push(object);
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
        let geometry = this.createGeometry('box', {x: 1, y: 1, z: 1});
        // let geometry = createGeometry('sphere', {radius: 1});
        let material = this.createMaterial('lambert', 0xFFFFFF);
        let position = new Vector3();
        position.set(0, -0.5, 0);
        let quaternion = new Quaternion();
        quaternion.set(0, 0, 0, 1)
        let mass = 0;
        this.createObject(geometry, material, position, quaternion, mass);
    }
    
    initEvents() {
        window.addEventListener('mousedown', (event) => {
            this.mousePosition.set(
                (event.clientX/Math.min(window.innerWidth, this.maxWidth))*2-1,
                -(event.clientY/Math.min(window.innerHeight, this.maxHeight))*2+1
            );
            this.shoot();
        }, false);
    }
    
    shoot() {
    
    }

    animate() {
        requestAnimationFrame(this.animate);
        this.step(this.clock.getDelta());
        this.renderer.render(this.scene, this.camera);
    }
    
    step(time) {
        this.world.stepSimulation(time, 10);
    }
}

let engine = new Engine();
engine.start();
// add an engine.close function?
