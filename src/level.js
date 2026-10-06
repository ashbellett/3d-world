import { BoxGeometry, MeshLambertMaterial, Vector3 } from 'three';
import { config } from './config.js';
import { createMesh } from './world.js';

// Adds the ground and the stack of breakable boxes
export function buildLevel(world, physics) {
    const [width, height, depth] = config.ground.size;
    const ground = createMesh(
        new BoxGeometry(width, height, depth),
        new MeshLambertMaterial({ color: config.ground.colour }),
        new Vector3(),
        0,
    );
    world.add(ground, physics.createBoxShape(width, height, depth));

    const { count, size, gap, mass, colour } = config.stack;
    // Shared by every box
    const geometry = new BoxGeometry(size, size, size);
    const material = new MeshLambertMaterial({ color: colour });
    const shape = physics.createBoxShape(size, size, size);
    const spacing = size + gap;
    const bottom = height / 2 + gap;
    const position = new Vector3();
    for (let i = 0; i < count[0]; i++) {
        for (let j = 0; j < count[1]; j++) {
            for (let k = 0; k < count[2]; k++) {
                position.set(
                    (i - (count[0] - 1) / 2) * spacing,
                    bottom + (j + 0.5) * spacing,
                    (k - (count[2] - 1) / 2) * spacing,
                );
                const box = createMesh(geometry, material, position, mass, true);
                world.add(box, shape, { sharedGeometry: true, sharedShape: true });
            }
        }
    }
}
