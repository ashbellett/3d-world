import { Timer } from 'three';
import { Bench } from './bench.ts';
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
const levelNames = levels.map((level) => level.name);
const bench = Bench.fromUrl(levelNames);
createLevelMenu(container, levelNames, (index) => loader.load(levels[index]), bench?.level);
onCanvasClick(graphics.canvas, (x, y) => launcher.fire(x, y));

const timer = new Timer();
timer.connect(document);
graphics.renderer.setAnimationLoop((timestamp) => {
    timer.update(timestamp);
    bench?.startFrame(timestamp, (x, y) => launcher.fire(x, y));
    physics.step(bench ? bench.delta : timer.getDelta());
    bench?.profiler.lap('physics');
    const moved = world.sync();
    fracture.update();
    world.cull();
    const removed = world.flush();
    bench?.profiler.lap('logic');
    // The bench renders every frame, so each run renders the same number of frames
    graphics.render(bench !== undefined || moved || removed);
    bench?.profiler.lap('render');
    if (bench?.endFrame(world.objects.size, graphics.backendName, physics.engineName)) {
        graphics.renderer.setAnimationLoop(null);
    }
});
