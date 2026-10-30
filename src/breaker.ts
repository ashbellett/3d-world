import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three/webgpu';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { ConvexObjectBreaker } from 'three/addons/misc/ConvexObjectBreaker.js';
import { config } from './config.ts';
import { seededRandom } from './random.ts';

export type Vec3 = [number, number, number];

// An object to break, in its own space: its geometry's positions and normals, as debris and
// Batch.prepare make them, its mass, where it was hit and the seed for where it's cut
export interface BreakJob {
    positions: Float32Array;
    normals: Float32Array;
    mass: number;
    point: Vec3;
    normal: Vec3;
    seed: number;
}

// A piece of a broken object: its geometry, centred on its position in the object's space, and
// whether it's big enough to break again
export interface Piece {
    positions: Float32Array;
    normals: Float32Array;
    mass: number;
    breakable: boolean;
    position: Vec3;
}

// Breaks an object into pieces, or returns none if it can't
export type Breaker = (job: BreakJob) => Promise<Piece[]>;

// The messages to and from fracture.worker.ts
export interface BreakRequest {
    id: number;
    job: BreakJob;
}

export interface BreakResult {
    id: number;
    pieces: Piece[];
}

const breaker = new ConvexObjectBreaker();
// For the meshes the breaker cuts and makes, which are never drawn. Without one, each would make
// its own.
const material = new MeshBasicMaterial();

// Makes a geometry from a job's or piece's positions and normals
export function geometryOf({
    positions,
    normals,
}: Pick<Piece, 'positions' | 'normals'>): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(normals, 3));
    return geometry;
}

// The hull of the positions' points, with points closer together than config.fracture.mergeDistance
// merged. Cuts leave points that differ only by rounding, which the breaker keeps, so each time a
// piece breaks its pieces have more, until their hulls have thousands of tiny faces.
export function simplifiedHull(positions: ArrayLike<number>): BufferGeometry {
    const { mergeDistance } = config.fracture;
    const points = new Map<string, Vector3>();
    for (let i = 0; i < positions.length; i += 3) {
        const point = new Vector3(positions[i], positions[i + 1], positions[i + 2]);
        const key = point
            .toArray()
            .map((value) => Math.round(value / mergeDistance))
            .join();
        if (!points.has(key)) points.set(key, point);
    }
    return new ConvexGeometry([...points.values()]);
}

// Cuts the object up with ConvexObjectBreaker, which takes the cuts' positions from Math.random,
// so from the job's seed here. Returns no pieces if it can't be cut.
export function breakObject({ positions, normals, mass, point, normal, seed }: BreakJob): Piece[] {
    const mesh = new Mesh(geometryOf({ positions, normals }), material);
    // The fields the breaker reads, and sets on the pieces. Velocities are the body's when the
    // pieces replace it.
    Object.assign(mesh.userData, {
        mass,
        velocity: new Vector3(),
        angularVelocity: new Vector3(),
        breakable: true,
    });
    const random = Math.random;
    Math.random = seededRandom(seed);
    try {
        const pieces = breaker.subdivideByImpact(
            mesh,
            new Vector3(...point),
            new Vector3(...normal),
            config.fracture.radialIterations,
            config.fracture.randomIterations,
        ) as Mesh[];
        return pieces.map((piece) => {
            const geometry = simplifiedHull(piece.geometry.getAttribute('position').array);
            return {
                positions: (geometry.getAttribute('position') as BufferAttribute)
                    .array as Float32Array,
                normals: (geometry.getAttribute('normal') as BufferAttribute).array as Float32Array,
                mass: piece.userData.mass as number,
                breakable: piece.userData.breakable as boolean,
                position: piece.position.toArray(),
            };
        });
    } catch {
        // ConvexHull throws on pieces with almost no volume, which a cut through an edge or
        // corner can leave, or that merging points flattens. The object stays whole.
        return [];
    } finally {
        Math.random = random;
    }
}

// Breaks objects on the main thread, for the tests, and if the worker fails
export const breakHere: Breaker = (job) => Promise.resolve(breakObject(job));

// Breaks objects in a worker running fracture.worker.ts, so breaking doesn't hold up frames. If
// the worker fails, it says so on the console, and objects break on the main thread from then on.
export function breakInWorker(worker: Worker): Breaker {
    let nextId = 0;
    let failed = false;
    const pending = new Map<number, { job: BreakJob; resolve: (pieces: Piece[]) => void }>();
    worker.addEventListener('message', ({ data: { id, pieces } }: MessageEvent<BreakResult>) => {
        pending.get(id)?.resolve(pieces);
        pending.delete(id);
    });
    worker.addEventListener('error', (event) => {
        const reason = event.message || "it couldn't load";
        console.error(
            `The fracture worker failed (${reason}), so objects break on the main thread`,
        );
        failed = true;
        for (const { job, resolve } of pending.values()) resolve(breakObject(job));
        pending.clear();
    });
    return (job) => {
        if (failed) return breakHere(job);
        const id = nextId++;
        return new Promise((resolve) => {
            pending.set(id, { job, resolve });
            // Copied rather than transferred, so the main thread can break it if the worker fails
            const request: BreakRequest = { id, job };
            worker.postMessage(request);
        });
    };
}
