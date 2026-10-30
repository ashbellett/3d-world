// Settings. Positions and sizes are [x, y, z], with y up from the ground's surface. The levels
// are in levels.ts.
export const config = {
    canvas: {
        maxPixelRatio: 2,
        // Edges are smoothed (multisampled) below this pixel ratio. At or above it, the pixels
        // are small enough to go without, which saves the GPU a lot of work.
        antialiasBelowPixelRatio: 2,
    },
    camera: {
        fov: 60,
        near: 0.2,
        far: 2000,
        position: [-16, 8, 16],
        target: [0, 2, 0],
    },
    background: 0xbfd1e5,
    // Intensities are physically based (three.js r155+), hence the factors of PI
    lights: {
        ambient: {
            colour: 0xbcbcbc,
            intensity: Math.PI,
        },
        directional: {
            colour: 0xffffff,
            intensity: 0.8 * Math.PI,
            position: [-20, 20, 20],
            shadowMapSize: 2048,
            shadowFar: 100,
        },
    },
    physics: {
        gravity: 10,
        // Longest step in seconds, and most steps a frame
        timestep: 1 / 60,
        maxSubSteps: 10,
        // The two bodies' frictions and restitutions are multiplied, so a contact bounces back
        // at a quarter of its speed
        friction: 0.5,
        restitution: 0.5,
        // Hulls flatter than this, in metres, are refused, as they have no inertia to rotate with
        minHullThickness: 0.001,
    },
    fracture: {
        // Objects replaced by their pieces each frame. Each adds a few bodies, so any more wait
        // for later frames.
        maxPerFrame: 2,
        radialIterations: 1,
        randomIterations: 2,
        // Pieces' points closer together than this, in metres, are merged, as breaker.ts says
        mergeDistance: 0.001,
    },
    projectile: {
        mass: 10,
        radius: 0.2,
        speed: 50,
        colour: 0x636363,
    },
    // Centred on the origin, below y = 0
    ground: {
        size: [64, 1, 64],
        colour: 0xf7f7f7,
        // Lines drawn on the top, one cell per metre
        grid: {
            colour: 0xc8c8c8,
            // Pixels per cell, and line width in pixels
            resolution: 64,
            lineWidth: 2,
        },
    },
    // Room the batch that draws the objects starts with. It grows if it needs more.
    batch: {
        instances: 256,
        vertices: 65536,
    },
    world: {
        // Oldest projectiles and debris are removed beyond this many objects
        maxObjects: 200,
        // Objects that fall below this height are removed
        minY: -20,
    },
    input: {
        // Pointer movement (px) beyond which a press counts as a camera drag, not a shot
        maxClickDistance: 5,
    },
    // The repeatable run that ?bench in the URL starts, described in bench.ts
    bench: {
        level: 'Stack',
        // Seconds the physics steps each frame
        delta: 1 / 60,
        // Frames before timing starts, while shaders compile, then frames timed
        warmupFrames: 60,
        frames: 600,
        // A shot every shotInterval frames, shots in all, at random points up to spread from the
        // centre of the screen, in normalised device coordinates
        shotInterval: 10,
        shots: 40,
        spread: 0.25,
        seed: 1,
    },
};
