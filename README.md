# 3D World

A three-dimensional world with objects, lighting and physics.

**Try it out [here](https://ashbellett.github.io/3d-world/).**

Click or tap to throw objects, drag to move the camera. Pick a level from the buttons in the top
left; pressing the current level's button restarts it.

## Running locally

Install [Node.js](https://nodejs.org/) 22.13 or later, then:

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
| `npm run lint`      | Checks the code with ESLint and Prettier                |
| `npm run format`    | Formats the code with Prettier                          |

## Deployment

Pushes to `main` are built and deployed to GitHub Pages by `.github/workflows/deploy.yml`.
This needs the repository's Pages source set to **GitHub Actions** (Settings → Pages → Build and
deployment → Source).

## Code

The code is TypeScript. Vite strips the types when serving and building, and `tsc` checks them
(`npm run typecheck`, and as part of `npm run build`). The page loads `src/main.ts`, which connects
these modules:

| Module        | Does                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| `config.ts`   | Settings                                                                   |
| `levels.ts`   | The levels: each object's shape, mass, colour, break strength and position |
| `graphics.ts` | Renderer, camera, controls and lights; renders only when something changed |
| `physics.ts`  | The Ammo.js physics world, and the only module that uses Ammo              |
| `world.ts`    | Objects in the scene, each a mesh with a physics body                      |
| `fracture.ts` | Breaks objects that are hit harder than their break strength               |
| `launcher.ts` | Fires projectiles from the camera                                          |
| `input.ts`    | Tells a click or tap from a camera drag                                    |
| `level.ts`    | Builds the ground, with its grid, and a level's objects                    |
| `menu.ts`     | The level buttons                                                          |
| `ammo.d.ts`   | Types for the parts of Ammo.js the code uses, as Ammo.js has none          |

## Dependencies

- [Three.js](https://github.com/mrdoob/three.js), installed from npm (version in `package.json`)
- [Ammo.js](https://github.com/kripken/ammo.js) WebAssembly build (commit `79190a1`, the same build
  Three.js uses), in `public/lib/ammo`

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
