import { afterEach, describe, expect, test, vi } from 'vitest';
import { Profiler, summarise } from './profiler.ts';

describe('summarise', () => {
    test('gives zeros for no samples', () => {
        expect(summarise([])).toEqual({ mean: 0, p50: 0, p95: 0, p99: 0, max: 0 });
    });

    test('gives the one sample for every statistic', () => {
        expect(summarise([4])).toEqual({ mean: 4, p50: 4, p95: 4, p99: 4, max: 4 });
    });

    test('takes percentiles from the sorted samples', () => {
        // 100 down to 1, so the input order isn't sorted
        const samples = Array.from({ length: 100 }, (_, i) => 100 - i);
        expect(summarise(samples)).toEqual({ mean: 50.5, p50: 51, p95: 96, p99: 100, max: 100 });
    });

    test("doesn't reorder the samples it's given", () => {
        const samples = [3, 1, 2];
        summarise(samples);
        expect(samples).toEqual([3, 1, 2]);
    });
});

describe('Profiler', () => {
    afterEach(() => vi.restoreAllMocks());

    test('records the time between laps under each stage', () => {
        const now = vi.spyOn(performance, 'now');
        const profiler = new Profiler();
        now.mockReturnValueOnce(10);
        profiler.start();
        now.mockReturnValueOnce(12);
        profiler.lap('physics');
        now.mockReturnValueOnce(17);
        profiler.lap('render');
        expect(profiler.summarise().physics.mean).toBe(2);
        expect(profiler.summarise().render.mean).toBe(5);
    });

    test('forgets samples when cleared', () => {
        const profiler = new Profiler();
        profiler.add('frame', 16);
        profiler.clear();
        expect(profiler.summarise()).toEqual({});
    });
});
