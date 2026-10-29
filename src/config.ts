// Settings and scene layout. Positions and sizes are [x, y, z].
export const config = {
    canvas: {
        maxWidth: 1280,
        maxHeight: 720,
        maxPixelRatio: 2,
    },
    camera: {
        fov: 60,
        near: 0.2,
        far: 2000,
        position: [-16, 8, 16],
        target: [0, 0, 0],
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
        maxSubSteps: 10,
        margin: 0.02,
        friction: 0.5,
    },
    fracture: {
        // Contact impulse above which a breakable object breaks
        impulse: 5,
        // Each break takes a millisecond or two, so any more wait for later frames
        maxPerFrame: 2,
        radialIterations: 1,
        randomIterations: 2,
    },
    projectile: {
        mass: 10,
        radius: 0.2,
        speed: 50,
        colour: 0x636363,
    },
    // Centred on the origin
    ground: {
        size: [64, 1, 64],
        colour: 0xf7f7f7,
    },
    // Breakable boxes, centred on the ground
    stack: {
        count: [4, 4, 4],
        size: 2,
        // Space between boxes, more than twice the collision margin, so the stack starts at rest
        gap: 0.05,
        mass: 2,
        colour: 0x40c4b3,
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
};
