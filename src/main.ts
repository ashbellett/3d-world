import { MeshLambertMaterial, Timer } from 'three/webgpu';
import { Batch } from './batch.ts';
import { Bench } from './bench.ts';
import { breakInWorker } from './breaker.ts';
import { config } from './config.ts';
import { Fracture } from './fracture.ts';
import type { GraphicsOptions } from './graphics.ts';
import { Graphics } from './graphics.ts';
import { onCanvasClick } from './input.ts';
import { Launcher } from './launcher.ts';
import { LevelLoader, addGround } from './level.ts';
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

// Shows why the page couldn't start, which would otherwise leave it blank
function showStartError(container: HTMLElement, error: unknown): void {
    console.error(error);
    const message = document.createElement('p');
    message.className = 'start-error';
    message.setAttribute('role', 'alert');
    const detail = error instanceof Error ? error.message : String(error);
    message.textContent = `The page couldn't start: ${detail}`;
    container.append(message);
}

async function start(container: HTMLElement): Promise<void> {
    // Rapier is a large download, so it loads while the renderer starts
    const physicsReady = import('./physics.ts').then(({ Physics }) => new Physics());
    const graphics = await Graphics.create(container, graphicsOptionsFromUrl());
    // Show the sky while the physics engine loads
    graphics.render(false);
    const physics = await physicsReady;
    // White, so each object's colour is its own
    const batch = new Batch(new MeshLambertMaterial(), config.batch);
    graphics.scene.add(batch.mesh);
    addGround(graphics.scene, physics);
    const world = new World(batch, physics);
    const worker = new Worker(new URL('./fracture.worker.ts', import.meta.url), { type: 'module' });
    const fracture = new Fracture(world, physics, breakInWorker(worker));
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
        const delta = bench ? bench.delta : timer.getDelta();
        physics.step(delta);
        bench?.profiler.lap('physics');
        const moved = world.sync();
        fracture.update();
        world.cull(graphics.camera);
        const fading = world.fade(delta);
        const removed = world.flush();
        bench?.profiler.lap('logic');
        // The bench renders every frame, so each run renders the same number of frames
        graphics.render(bench !== undefined || moved || fading || removed);
        bench?.profiler.lap('render');
        if (
            bench?.endFrame(
                world.objects.size,
                world.nextId,
                graphics.backendName,
                physics.engineName,
            )
        ) {
            graphics.renderer.setAnimationLoop(null);
        }
    });
}

const container = document.getElementById('container')!;
start(container).catch((error: unknown) => showStartError(container, error));
