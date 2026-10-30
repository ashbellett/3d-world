import type { Camera } from 'three/webgpu';
import { Color, Raycaster, SphereGeometry, Vector2 } from 'three/webgpu';
import { Batch } from './batch.ts';
import { config } from './config.ts';
import type { Physics, Shape } from './physics.ts';
import type { World } from './world.ts';

// Fires projectiles from the camera towards a point on the screen
export class Launcher {
    readonly world: World;
    readonly camera: Camera;
    // Shared by every projectile
    readonly geometry = Batch.prepare(new SphereGeometry(config.projectile.radius, 32));
    readonly geometryId: number;
    readonly colour = new Color(config.projectile.colour);
    readonly shape: Shape;
    readonly raycaster = new Raycaster();
    readonly pointer = new Vector2();

    constructor(world: World, physics: Physics, camera: Camera) {
        this.world = world;
        this.camera = camera;
        this.geometryId = world.batch.addGeometry(this.geometry);
        this.shape = physics.createSphereShape(config.projectile.radius);
    }

    // Takes normalised device coordinates, from -1 to 1
    fire(x: number, y: number): void {
        this.raycaster.setFromCamera(this.pointer.set(x, y), this.camera);
        const { origin, direction } = this.raycaster.ray;
        const { mass, speed } = config.projectile;
        this.world.add(
            {
                geometry: this.geometry,
                geometryId: this.geometryId,
                colour: this.colour,
                mass,
                // One unit in front of the camera
                position: origin.clone().add(direction),
                velocity: direction.clone().multiplyScalar(speed),
                transient: true,
                // As it moves further in a step than a domino is thick
                continuous: true,
            },
            this.shape,
        );
    }
}
