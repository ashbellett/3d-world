# 3D World

A three-dimensional world with objects, lighting and physics.

**Try it out [here](https://ashbellett.github.io/3d-world/).**

Click or tap to throw objects, drag to move the camera. Pick a level from the buttons in the top
left; pressing the current level's button restarts it.

## Running locally

Install [Node.js](https://nodejs.org/) 22 (22.13 or later), 24, or 26 or later, then:

```
npm install
npm run dev
```

and open the URL it prints.

| Command             | Does                                                    |
| ------------------- | ------------------------------------------------------- |
| `npm run dev`       | Serves the page, reloading on changes                   |
| `npm run build`     | Type-checks the code, then builds the site into `dist/` |
| `npm run preview`   | Serves the built site                                   |
| `npm run typecheck` | Type-checks the code with TypeScript                    |
| `npm test`          | Runs the tests with Vitest                              |
| `npm run lint`      | Checks the code with ESLint and Prettier                |
| `npm run format`    | Formats the code with Prettier                          |

## Rendering and benchmarking

The page renders with WebGPU, or with WebGL 2 in browsers without it. Add `?backend=webgl` to the
URL to use WebGL 2 anyway.

Add `?bench` to the URL to run a benchmark, for example
[on the live site](https://ashbellett.github.io/3d-world/?bench), or
[with WebGL 2](https://ashbellett.github.io/3d-world/?bench&backend=webgl). It fires a fixed,
seeded series of shots at the Stack level, or another named like `?bench=Bridge`, steps the
physics by the same time every frame and renders every frame, then shows how long each stage of a
frame took and how many bodies the shots and breaks added. The results are also logged to the
console and stored as `window.benchResult`. Settings are under `bench` in `config.ts`.

For steady results, keep the tab in front and leave the camera alone while it runs, as the shots
are aimed from it, and run it a few times. Frame times are limited by the display's refresh rate
unless Chrome is started with `--disable-gpu-vsync --disable-frame-rate-limit`, for example with a
separate profile: `open -na "Google Chrome" --args --user-data-dir=/tmp/bench --disable-gpu-vsync
--disable-frame-rate-limit` on macOS.

## Removing objects

Projectiles and debris are removed once there are more than `maxObjects` objects (256), counting
the level's blocks, which are never removed. Each frame, the excess shrink away over `fadeTime`
(half a second), still colliding, and are then removed. The ones that go are the least noticeable,
picked by these rules in turn, each only deciding between objects the rules before it found equal:

1. Off screen before on screen
2. At rest before moving
3. Smaller on screen before larger: size divided by distance from the camera
4. Older before newer

The rules are `cullOrder`, and the limits are under `world` in `config.ts`. Reorder or leave out
rules to change the order; objects the rules leave tied go oldest first. Anything that falls off
the edge of the ground is removed at once.

There can never be more than `batch.instances` objects (512), counting those shrinking away. If
there would be, the one that has shrunk furthest goes at once.

## Deployment

Pushes to `main` are built and deployed to GitHub Pages by `.github/workflows/deploy.yml`.
This needs the repository's Pages source set to **GitHub Actions** (Settings → Pages → Build and
deployment → Source).

## Code

The code is TypeScript. Vite strips the types when serving and building, and `tsc` checks them
(`npm run typecheck`, and as part of `npm run build`). Tests sit beside the modules they test, in
`*.test.ts` files, and Vitest runs them in Node. The page loads `src/main.ts`, which connects these
modules:

| Module               | Does                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| `config.ts`          | Settings                                                                   |
| `levels.ts`          | The levels: each object's shape, mass, colour, break strength and position |
| `graphics.ts`        | Renderer, camera, controls and lights; renders only when something changed |
| `physics.ts`         | The Rapier physics world, and the only module that uses Rapier             |
| `world.ts`           | Objects in the world, each a physics body drawn by the batch               |
| `cull.ts`            | Which projectiles and debris to remove first, when there are too many      |
| `batch.ts`           | Draws every object in one draw call, as instances of a `BatchedMesh`       |
| `fracture.ts`        | Breaks objects that are hit harder than their break strength               |
| `breaker.ts`         | Cuts an object into pieces, in a worker, or on the main thread if it fails |
| `fracture.worker.ts` | The worker that `breaker.ts` cuts objects up in                            |
| `launcher.ts`        | Fires projectiles from the camera                                          |
| `input.ts`           | Tells a click or tap from a camera drag                                    |
| `level.ts`           | Adds the ground, with its grid, and builds a level's objects               |
| `menu.ts`            | The level buttons                                                          |
| `bench.ts`           | The benchmark that `?bench` runs                                           |
| `profiler.ts`        | Times each stage of a frame and summarises the times                       |
| `random.ts`          | A seeded random number generator, for repeatable benchmarks                |

## Dependencies

Installed from npm, with versions in `package.json`:

- [Three.js](https://github.com/mrdoob/three.js), using its `WebGPURenderer`
- [Rapier](https://rapier.rs), a physics engine written in Rust and compiled to WebAssembly, in its
  SIMD build, which needs WebAssembly SIMD (in every browser with WebGPU, and Safari 16.4 and
  later). Its package imports the WebAssembly as a module, which
  [vite-plugin-wasm](https://github.com/Menci/vite-plugin-wasm) handles.

## Credit

Three.js add-ons:

- [ConvexGeometry](https://threejs.org/docs/#ConvexGeometry)
- [ConvexObjectBreaker](https://threejs.org/docs/#ConvexObjectBreaker)
- [OrbitControls](https://threejs.org/docs/#OrbitControls)

Three.js code examples:

- ["Convex object breaking"](https://threejs.org/examples/#physics_ammo_break), whose scene is the
  Bridge level

## To Do

- Gradient scene background
- Real-time parameter changes
- Improve positions, colours and textures
