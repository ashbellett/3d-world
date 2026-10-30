import type { BufferGeometry, Color, Material, Quaternion } from 'three/webgpu';
import { BatchedMesh, Matrix4, Vector3 } from 'three/webgpu';

export interface BatchCapacity {
    instances: number;
    vertices: number;
}

const matrix = new Matrix4();
const unitScale = new Vector3(1, 1, 1);

// Draws many objects as one BatchedMesh, so they take one draw call rather than one each. Each
// object is an instance of a geometry, with its own colour and transform. The batch grows when
// it's full, and compacts its geometries when they've been removed and it runs out of room.
export class Batch {
    readonly mesh: BatchedMesh;
    // How many vertices the mesh has room for, used or not, as BatchedMesh doesn't say
    vertexCapacity: number;

    // Every geometry in a batch must have the same attributes and either all or none must be
    // indexed, so this returns the geometry with just positions and normals and no index, which
    // is how ConvexGeometry, and so debris, comes
    static prepare(geometry: BufferGeometry): BufferGeometry {
        const prepared = geometry.index ? geometry.toNonIndexed() : geometry;
        for (const name of Object.keys(prepared.attributes)) {
            if (name !== 'position' && name !== 'normal') prepared.deleteAttribute(name);
        }
        return prepared;
    }

    constructor(material: Material, { instances, vertices }: BatchCapacity) {
        this.mesh = new BatchedMesh(instances, vertices, 0, material);
        this.vertexCapacity = vertices;
        // Objects are opaque and few, so the depth sort costs more than the overdraw it saves
        this.mesh.sortObjects = false;
        // Its bounds aren't updated as instances move, so it's culled per instance instead
        this.mesh.frustumCulled = false;
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
    }

    // Takes a geometry from Batch.prepare, and returns its id
    addGeometry(geometry: BufferGeometry): number {
        const needed = geometry.getAttribute('position').count;
        if (this.mesh.unusedVertexCount < needed) {
            // Reclaims the room that removed geometries left, and grows if that's not enough
            this.mesh.optimize();
            if (this.mesh.unusedVertexCount < needed) {
                const used = this.vertexCapacity - this.mesh.unusedVertexCount;
                this.vertexCapacity = Math.max(this.vertexCapacity * 2, used + needed);
                this.mesh.setGeometrySize(this.vertexCapacity, 0);
            }
        }
        return this.mesh.addGeometry(geometry);
    }

    // Removes the geometry, which must have no instances left
    removeGeometry(geometryId: number): void {
        this.mesh.deleteGeometry(geometryId);
    }

    addInstance(geometryId: number, colour: Color): number {
        if (this.mesh.instanceCount >= this.mesh.maxInstanceCount) {
            this.mesh.setInstanceCount(this.mesh.maxInstanceCount * 2);
        }
        const instance = this.mesh.addInstance(geometryId);
        this.mesh.setColorAt(instance, colour);
        return instance;
    }

    setTransform(instance: number, position: Vector3, quaternion: Quaternion): void {
        this.mesh.setMatrixAt(instance, matrix.compose(position, quaternion, unitScale));
    }

    removeInstance(instance: number): void {
        this.mesh.deleteInstance(instance);
    }
}
