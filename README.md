# 3D World

A three-dimensional world with objects, lighting and physics.

**Try it out [here](https://ashbellett.github.io/3d-world/).**

Click or tap to throw objects, drag to move the camera.

## Running locally

Install [Node.js](https://nodejs.org/) 22.13 or later, then:

```
npm install
npm run dev
```

and open the URL it prints.

| Command           | Does                                     |
| ----------------- | ---------------------------------------- |
| `npm run dev`     | Serves the page, reloading on changes    |
| `npm run build`   | Builds the site into `dist/`             |
| `npm run preview` | Serves the built site                    |
| `npm run lint`    | Checks the code with ESLint and Prettier |
| `npm run format`  | Formats the code with Prettier           |

## Deployment

Pushes to `master` are built and deployed to GitHub Pages by `.github/workflows/deploy.yml`.
This needs the repository's Pages source set to **GitHub Actions** (Settings → Pages → Build and
deployment → Source).

## Code

The page loads `src/main.js`, which connects these modules:

| Module        | Does                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| `config.js`   | Settings and the scene layout                                              |
| `graphics.js` | Renderer, camera, controls and lights; renders only when something changed |
| `physics.js`  | The Ammo.js physics world, and the only module that uses Ammo              |
| `world.js`    | Objects in the scene, each a mesh with a physics body                      |
| `fracture.js` | Breaks objects that are hit hard enough                                    |
| `launcher.js` | Fires projectiles from the camera                                          |
| `input.js`    | Tells a click or tap from a camera drag                                    |
| `level.js`    | Builds the ground and the stack of boxes                                   |

## Dependencies

- [Three.js](https://github.com/mrdoob/three.js), installed from npm (version in `package.json`)
- [Ammo.js](https://github.com/kripken/ammo.js) WebAssembly build (commit `79190a1`, the same build
  Three.js uses), in `public/lib/ammo`

## Credit

Three.js add-ons:

- [ConvexObjectBreaker](https://threejs.org/docs/#ConvexObjectBreaker)
- [OrbitControls](https://threejs.org/docs/#OrbitControls)

Three.js code examples:

- ["WebGL Physics Convex Break"](https://threejs.org/examples/#webgl_physics_convex_break)

## To Do

- Gradient scene background
- Real-time parameter changes
- Improve positions, colours and textures
