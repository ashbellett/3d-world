import { Timer } from 'three/webgpu';
import { Bench } from './bench.ts';
import { Fracture } from './fracture.ts';
import type { GraphicsOptions } from './graphics.ts';
import { Graphics } from './graphics.ts';
import { onCanvasClick } from './input.ts';
import { Launcher } from './launcher.ts';
import { LevelLoader } from './level.ts';
import { levels } from './levels.ts';
import { createLevelMenu } from './menu.ts';
import { World } from './world.ts';

// ?backend=webgl renders with WebGL 2 even where WebGPU is available, to compare the two
function graphicsOptionsFromUrl(): GraphicsOptions {
    const backend = new URLSearchParams(window.location.search).get('backend');
    if (backend === null || backend === 'webgpu') return {};
    if (backend === 'webgl') return { forceWebGL: true };
    throw new Error(`Unknown backend "${backend}" in the URL: use webgpu or webgl`);
}

// Rapier is a large download, so it loads while the renderer starts
const physicsReady = import('./physics.ts').then(({ Physics }) => Physics.create());
const container = document.getElementById('container')!;
const graphics = await Graphics.create(container, graphicsOptionsFromUrl());
// Show the sky while the physics engine loads
graphics.render(false);
const physics = await physicsReady;
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
