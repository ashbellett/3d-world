import { Timer } from 'three';
import { Fracture } from './fracture.ts';
import { Graphics } from './graphics.ts';
import { onCanvasClick } from './input.ts';
import { Launcher } from './launcher.ts';
import { LevelLoader } from './level.ts';
import { levels } from './levels.ts';
import { createLevelMenu } from './menu.ts';
import { Physics } from './physics.ts';
import { World } from './world.ts';

const container = document.getElementById('container')!;
const graphics = new Graphics(container);
// Show the sky while the physics engine loads
graphics.render(false);

// Ammo is defined by public/lib/ammo/ammo.wasm.js, which index.html loads
const physics = new Physics(await Ammo());
const world = new World(graphics.scene, physics);
const fracture = new Fracture(world, physics);
const launcher = new Launcher(world, physics, graphics.camera);
const loader = new LevelLoader(world, physics);
createLevelMenu(
    container,
    levels.map((level) => level.name),
    (index) => loader.load(levels[index]),
);
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
