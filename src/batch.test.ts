import { describe, expect, test } from 'vitest';
import {
    BoxGeometry,
    Color,
    Matrix4,
    MeshBasicMaterial,
    Quaternion,
    SphereGeometry,
    Vector3,
} from 'three/webgpu';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { Batch } from './batch.ts';

const material = new MeshBasicMaterial();
const box = () => Batch.prepare(new BoxGeometry());

describe('prepare', () => {
    test('keeps only positions and normals, without an index', () => {
        const geometry = Batch.prepare(new SphereGeometry(1, 8, 6));
        expect(geometry.index).toBeNull();
        expect(Object.keys(geometry.attributes).sort()).toEqual(['normal', 'position']);
    });

    test('keeps every triangle of an indexed geometry', () => {
        const indexed = new BoxGeometry();
        expect(Batch.prepare(indexed).getAttribute('position').count).toBe(indexed.index!.count);
    });

    test('leaves debris-like geometry as it is', () => {
        const corners = [
            new Vector3(),
            new Vector3(1, 0, 0),
            new Vector3(0, 1, 0),
            new Vector3(0, 0, 1),
        ];
        const geometry = new ConvexGeometry(corners);
        expect(Batch.prepare(geometry)).toBe(geometry);
    });
});

test('sets an instance colour and transform', () => {
    const batch = new Batch(material, { instances: 4, vertices: 100 });
    const instance = batch.addInstance(batch.addGeometry(box()), new Color(0x336699));
    const position = new Vector3(1, 2, 3);
    const quaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1);
    batch.setTransform(instance, position, quaternion);
    expect(batch.mesh.getColorAt(instance, new Color()).getHex()).toBe(0x336699);
    const expected = new Matrix4().compose(position, quaternion, new Vector3(1, 1, 1));
    // Stored as 32-bit floats
    const actual = batch.mesh.getMatrixAt(instance, new Matrix4()).elements;
    actual.forEach((value, i) => expect(value).toBeCloseTo(expected.elements[i], 6));
});

test('grows when it runs out of instances', () => {
    const batch = new Batch(material, { instances: 2, vertices: 100 });
    const geometryId = batch.addGeometry(box());
    const instances = Array.from({ length: 5 }, () => batch.addInstance(geometryId, new Color()));
    expect(new Set(instances).size).toBe(5);
    expect(batch.mesh.maxInstanceCount).toBeGreaterThanOrEqual(5);
});

test('reuses the room removed geometries leave', () => {
    // Room for two boxes of 36 vertices each
    const batch = new Batch(material, { instances: 4, vertices: 72 });
    const first = batch.addGeometry(box());
    batch.addGeometry(box());
    batch.removeGeometry(first);
    batch.addGeometry(box());
    expect(batch.vertexCapacity).toBe(72);
});

test('grows when it runs out of vertices', () => {
    const batch = new Batch(material, { instances: 4, vertices: 40 });
    const ids = [batch.addGeometry(box()), batch.addGeometry(box()), batch.addGeometry(box())];
    expect(new Set(ids).size).toBe(3);
    expect(batch.vertexCapacity).toBeGreaterThanOrEqual(3 * 36);
    // The geometries added before it grew are kept
    for (const id of ids) {
        expect(batch.mesh.getGeometryRangeAt(id)!.vertexCount).toBe(36);
    }
});
