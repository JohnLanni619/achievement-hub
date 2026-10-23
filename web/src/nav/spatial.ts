export type Direction = "up" | "down" | "left" | "right";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How much a sideways offset counts against a candidate, relative to distance ahead. */
const OFFSET_WEIGHT = 3;

function overlap(a1: number, a2: number, b1: number, b2: number) {
  return Math.min(a2, b2) - Math.max(a1, b1);
}

/**
 * Picks the candidate a D-pad press should move focus to: the nearest box
 * lying in `dir` from `from`, preferring boxes aligned with it (same row or
 * column) over closer ones that are off to the side. Returns -1 if none.
 */
export function pickNext(from: Box, candidates: Box[], dir: Direction): number {
  const vertical = dir === "up" || dir === "down";
  const fromCenter = vertical ? (from.top + from.bottom) / 2 : (from.left + from.right) / 2;

  let best = -1;
  let bestScore = Infinity;
  candidates.forEach((c, i) => {
    const center = vertical ? (c.top + c.bottom) / 2 : (c.left + c.right) / 2;
    let gap: number;
    switch (dir) {
      case "down":
        if (center <= fromCenter || c.top < from.top + 1) return;
        gap = c.top - from.bottom;
        break;
      case "up":
        if (center >= fromCenter || c.bottom > from.bottom - 1) return;
        gap = from.top - c.bottom;
        break;
      case "right":
        if (center <= fromCenter || c.left < from.left + 1) return;
        gap = c.left - from.right;
        break;
      case "left":
        if (center >= fromCenter || c.right > from.right - 1) return;
        gap = from.left - c.right;
        break;
    }
    // Sideways distance: zero when the boxes share a row/column.
    const shared = vertical
      ? overlap(from.left, from.right, c.left, c.right)
      : overlap(from.top, from.bottom, c.top, c.bottom);
    const offset =
      shared > 0
        ? 0
        : vertical
          ? Math.abs((c.left + c.right) / 2 - (from.left + from.right) / 2)
          : Math.abs((c.top + c.bottom) / 2 - (from.top + from.bottom) / 2);
    const score = Math.max(0, gap) + offset * OFFSET_WEIGHT;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
