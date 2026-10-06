# 3D World
A three-dimensional world with objects, lighting and physics.  
**Try it out [here](https://ashbellett.github.io/3d-world/).**

Click or tap to throw objects, drag to move the camera.

## Running locally
The page uses ES modules and WebAssembly, so it must be served over HTTP rather than opened as a file:
```
python3 -m http.server
```
Then open http://localhost:8000.

## Dependencies
[Three.js](https://github.com/mrdoob/three.js) r186, loaded from jsDelivr via the import map in `index.html`  
[Ammo.js](https://github.com/kripken/ammo.js) WebAssembly build (commit `79190a1`, the same build Three.js uses), in `lib/ammo`

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
