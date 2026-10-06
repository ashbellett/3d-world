import { MeshPhongMaterial, Raycaster, SphereGeometry, Vector2, Vector3 } from 'three';
import { config } from './config.js';
import { createMesh } from './world.js';

// Fires projectiles from the camera towards a point on the screen
export class Launcher {
    constructor(world, physics, camera) {
        this.world = world;
        this.camera = camera;
        // Shared by every projectile
        const { radius, colour } = config.projectile;
        this.geometry = new SphereGeometry(radius, 32);
        this.material = new MeshPhongMaterial({ color: colour });
        this.shape = physics.createSphereShape(radius);
        this.raycaster = new Raycaster();
        this.pointer = new Vector2();
        this.position = new Vector3();
    }

    // Takes normalised device coordinates, from -1 to 1
    fire(x, y) {
        this.raycaster.setFromCamera(this.pointer.set(x, y), this.camera);
        const { origin, direction } = this.raycaster.ray;
        // Start one unit in front of the camera
        this.position.copy(origin).add(direction);
        const projectile = createMesh(
            this.geometry,
            this.material,
            this.position,
            config.projectile.mass,
        );
        projectile.userData.velocity.copy(direction).multiplyScalar(config.projectile.speed);
        this.world.add(projectile, this.shape, {
            transient: true,
            sharedGeometry: true,
            sharedShape: true,
        });
    }
}
