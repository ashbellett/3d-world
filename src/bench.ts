import { config } from './config.ts';
import type { Stats } from './profiler.ts';
import { Profiler, summarise } from './profiler.ts';

export interface BenchResult {
    renderer: string;
    physics: string;
    userAgent: string;
    level: string;
    frames: number;
    objects: Stats;
    // Bodies added from the first frame to the last: projectiles and debris, so a measure of
    // how much broke
    added: number;
    // Milliseconds per frame for each stage, and between frames
    stages: Record<string, Stats>;
}

declare global {
    interface Window {
        benchResult?: BenchResult;
    }
}

// Mulberry32: a small seeded generator of numbers in [0, 1)
export function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// A repeatable run for comparing renderers and physics engines, enabled by ?bench in the URL,
// on config.bench.level, or the level named by ?bench=Level.
// Every frame steps the physics by the same time and renders, and shots are fired on a schedule
// at seeded random points, so runs do the same work whatever the frame rate. After some warm-up
// frames it times each stage for config.bench.frames frames, then shows the results and stores
// them as window.benchResult.
export class Bench {
    readonly profiler = new Profiler();
    readonly random: () => number;
    readonly objectCounts: number[] = [];
    readonly levelName: string;
    readonly level: number;
    frame = 0;
    // The world's body count at the first frame
    firstBodyCount: number | undefined;
    lastTimestamp: number | undefined;

    static fromUrl(levelNames: string[]): Bench | undefined {
        const level = new URLSearchParams(window.location.search).get('bench');
        if (level === null) return undefined;
        return new Bench(levelNames, level || config.bench.level);
    }

    constructor(levelNames: string[], levelName: string) {
        this.levelName = levelName;
        this.level = levelNames.indexOf(levelName);
        if (this.level === -1) {
            throw new Error(`No level is called "${levelName}": try ${levelNames.join(', ')}`);
        }
        const { seed } = config.bench;
        this.random = seededRandom(seed);
        // ConvexObjectBreaker cuts at Math.random points. A separate generator from the shots',
        // so the shots don't depend on how many breaks there were.
        Math.random = seededRandom(seed + 1);
    }

    get delta(): number {
        return config.bench.delta;
    }

    // Records the time since the last frame, fires this frame's shot, if any, and starts timing
    // the frame's stages
    startFrame(timestamp: number, fire: (x: number, y: number) => void): void {
        if (this.lastTimestamp !== undefined) {
            this.profiler.add('frame', timestamp - this.lastTimestamp);
        }
        this.lastTimestamp = timestamp;
        const { shotInterval, shots, spread } = config.bench;
        if (this.frame % shotInterval === 0 && this.frame / shotInterval < shots) {
            fire((this.random() * 2 - 1) * spread, (this.random() * 2 - 1) * spread);
        }
        this.profiler.start();
    }

    // Takes how many objects there are and how many bodies have ever been added. Returns whether
    // the run has finished, having reported the results.
    endFrame(objects: number, bodies: number, renderer: string, physics: string): boolean {
        this.firstBodyCount ??= bodies;
        this.objectCounts.push(objects);
        this.frame++;
        const { warmupFrames, frames } = config.bench;
        if (this.frame === warmupFrames) {
            this.profiler.clear();
            this.objectCounts.length = 0;
        }
        if (this.frame < warmupFrames + frames) return false;
        this.report({
            renderer,
            physics,
            userAgent: navigator.userAgent,
            level: this.levelName,
            frames,
            objects: summarise(this.objectCounts),
            added: bodies - this.firstBodyCount,
            stages: this.profiler.summarise(),
        });
        return true;
    }

    report(result: BenchResult): void {
        window.benchResult = result;
        console.info('Bench result', JSON.stringify(result));
        const column = (value: string | number) =>
            (typeof value === 'number' ? value.toFixed(2) : value).padStart(8);
        const lines = [
            `Renderer: ${result.renderer}`,
            `Physics:  ${result.physics}`,
            `Level:    ${result.level}`,
            `${result.frames} frames, ${result.objects.mean.toFixed(0)} objects on average, ` +
                `${result.objects.max} at most, ${result.added} added by shots and breaks`,
            '',
            ['stage', 'mean', 'p50', 'p95', 'p99', 'max'].map(column).join('') + '  (ms)',
            ...Object.entries(result.stages).map(([stage, stats]) =>
                [stage, stats.mean, stats.p50, stats.p95, stats.p99, stats.max]
                    .map(column)
                    .join(''),
            ),
        ];
        const output = document.createElement('pre');
        output.className = 'bench-result';
        output.textContent = lines.join('\n');
        document.body.append(output);
    }
}
