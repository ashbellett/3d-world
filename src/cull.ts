// Which projectiles and debris to remove first when there are too many objects: the least
// noticeable. Each rule puts some before others, and breaks ties in the rules before it;
// whatever's still tied goes oldest first.
//
// - offScreen: outside the camera's view before inside it
// - resting: at rest before moving
// - small: smaller on screen before larger, by size over distance from the camera
// - old: older before newer
export type CullRule = 'offScreen' | 'resting' | 'small' | 'old';

export interface CullCandidate {
    // Higher is newer
    id: number;
    offScreen: boolean;
    resting: boolean;
    // How big it looks: its radius over its distance from the camera
    screenSize: number;
}

const compare: Record<CullRule, (a: CullCandidate, b: CullCandidate) => number> = {
    offScreen: (a, b) => Number(b.offScreen) - Number(a.offScreen),
    resting: (a, b) => Number(b.resting) - Number(a.resting),
    small: (a, b) => a.screenSize - b.screenSize,
    old: (a, b) => a.id - b.id,
};

// Returns the candidates in the order to remove them, first first
export function cullOrder<T extends CullCandidate>(
    candidates: T[],
    rules: readonly CullRule[],
): T[] {
    return [...candidates].sort((a, b) => {
        for (const rule of rules) {
            const order = compare[rule](a, b);
            if (order !== 0) return order;
        }
        return compare.old(a, b);
    });
}
