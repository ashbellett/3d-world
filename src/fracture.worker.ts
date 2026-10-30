import type { BreakRequest, BreakResult } from './breaker.ts';
import { breakObject } from './breaker.ts';

// Breaks objects for breakInWorker, off the main thread
self.addEventListener('message', ({ data: { id, job } }: MessageEvent<BreakRequest>) => {
    const pieces = breakObject(job);
    const result: BreakResult = { id, pieces };
    self.postMessage(result, {
        transfer: pieces.flatMap(({ positions, normals }) => [positions.buffer, normals.buffer]),
    });
});
