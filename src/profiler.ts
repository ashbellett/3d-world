// Records how long each stage of a frame takes, and summarises the samples

export interface Stats {
    mean: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
}

// Mean, percentiles and maximum of the samples, or all zeros if there are none
export function summarise(samples: readonly number[]): Stats {
    if (samples.length === 0) return { mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
    const sorted = [...samples].sort((a, b) => a - b);
    const percentile = (p: number) =>
        sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
    const total = sorted.reduce((sum, sample) => sum + sample, 0);
    return {
        mean: total / sorted.length,
        p50: percentile(50),
        p95: percentile(95),
        p99: percentile(99),
        max: sorted[sorted.length - 1],
    };
}

// Times consecutive stages of a frame: start() begins the frame, and lap(stage) records the time
// since the last start or lap under the stage's name
export class Profiler {
    readonly samples = new Map<string, number[]>();
    last = 0;

    start(): void {
        this.last = performance.now();
    }

    lap(stage: string): void {
        const now = performance.now();
        this.add(stage, now - this.last);
        this.last = now;
    }

    add(stage: string, sample: number): void {
        let samples = this.samples.get(stage);
        if (!samples) {
            samples = [];
            this.samples.set(stage, samples);
        }
        samples.push(sample);
    }

    clear(): void {
        this.samples.clear();
    }

    summarise(): Record<string, Stats> {
        return Object.fromEntries(
            [...this.samples].map(([stage, samples]) => [stage, summarise(samples)]),
        );
    }
}
