import type { Camera } from 'three/webgpu';
import { MeshPhongMaterial, Raycaster, SphereGeometry, Vector2, Vector3 } from 'three/webgpu';
import { config } from './config.ts';
import type { Physics, Shape } from './physics.ts';
import type { World } from './world.ts';
import { createMesh } from './world.ts';

// Fires projectiles from the camera towards a point on the screen
export class Launcher {
    readonly world: World;
    readonly camera: Camera;
    readonly geometry: SphereGeometry;
    readonly material: MeshPhongMaterial;
    readonly shape: Shape;
    readonly raycaster = new Raycaster();
    readonly pointer = new Vector2();
    readonly position = new Vector3();

    constructor(world: World, physics: Physics, camera: Camera) {
        this.world = world;
        this.camera = camera;
        // Shared by every projectile
        const { radius, colour } = config.projectile;
        this.geometry = new SphereGeometry(radius, 32);
        this.material = new MeshPhongMaterial({ color: colour });
        this.shape = physics.createSphereShape(radius);
    }

    // Takes normalised device coordinates, from -1 to 1
    fire(x: number, y: number): void {
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
        this.world.add(projectile, this.shape, { transient: true, sharedGeometry: true });
    }
}
