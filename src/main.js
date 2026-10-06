import { Timer } from 'three';
import { Fracture } from './fracture.js';
import { Graphics } from './graphics.js';
import { onCanvasClick } from './input.js';
import { Launcher } from './launcher.js';
import { buildLevel } from './level.js';
import { Physics } from './physics.js';
import { World } from './world.js';

const graphics = new Graphics(document.getElementById('container'));
// Show the sky while the physics engine loads
graphics.render(false);

// Ammo is defined by public/lib/ammo/ammo.wasm.js, which index.html loads
const physics = new Physics(await Ammo());
const world = new World(graphics.scene, physics);
const fracture = new Fracture(world, physics);
const launcher = new Launcher(world, physics, graphics.camera);
buildLevel(world, physics);
onCanvasClick(graphics.canvas, (x, y) => launcher.fire(x, y));

const timer = new Timer();
timer.connect(document);
graphics.renderer.setAnimationLoop((timestamp) => {
    timer.update(timestamp);
    physics.step(timer.getDelta());
    const moved = world.sync();
    fracture.update();
    world.cull();
    const removed = world.flush();
    graphics.render(moved || removed);
});
